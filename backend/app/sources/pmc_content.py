"""PMC's supported OAI interface: permissions first, then explicitly licensed XML."""
import asyncio
from datetime import datetime, timezone
import re
from urllib.parse import urlencode
from xml.etree import ElementTree as ET
import zlib

import httpx

from app.radar.contracts import SearchPaper
from app.schemas.source_content import SourceDocument
from app.sources.content_policy import approved_license, attach_passages, identity_matches
from app.sources.metadata import doi_identifier

ENDPOINT = "https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/"
MAX_BYTES = 4_000_000


class ProviderUnavailable(ValueError):
    def __init__(self, message: str, retry_after: int = 60):
        super().__init__(message)
        self.retry_after = retry_after


def request_url(identifier: str, prefix: str) -> str:
    if not re.fullmatch(r"PMC\d{1,12}", identifier) or prefix not in {"pmc", "pmc_fm"}:
        raise ValueError("Unsupported PMC identifier or format")
    return ENDPOINT + "?" + urlencode({"verb": "GetRecord", "identifier": "oai:pubmedcentral.nih.gov:" + identifier[3:], "metadataPrefix": prefix})


async def download(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=3, follow_redirects=False,
        headers={"Accept-Encoding": "gzip, deflate", "User-Agent": "ScientificResearchRadar/1.0"}) as client:
        async with client.stream("GET", url) as response:
            if response.status_code == 429:
                delay = response.headers.get("Retry-After", "60")
                raise ProviderUnavailable("PMC rate limit reached.", min(86400, max(60, int(delay))) if delay.isdigit() else 60)
            response.raise_for_status()
            encoding = response.headers.get("Content-Encoding", "identity").lower()
            if encoding not in {"gzip", "deflate", "identity"}:
                raise ValueError("Unsupported compression")
            decoder = zlib.decompressobj(16 + zlib.MAX_WBITS if encoding == "gzip" else zlib.MAX_WBITS) if encoding != "identity" else None
            output = bytearray()
            wire_size = 0
            async for raw in response.aiter_raw():
                wire_size += len(raw)
                if wire_size > MAX_BYTES:
                    raise ValueError("Response exceeds size limit")
                chunk = decoder.decompress(raw, MAX_BYTES - len(output) + 1) if decoder else raw
                output.extend(chunk)
                if len(output) > MAX_BYTES or (decoder and decoder.unconsumed_tail):
                    raise ValueError("Decoded response exceeds size limit")
            if decoder and (not decoder.eof or decoder.unused_data):
                raise ValueError("Incomplete or concatenated compressed response")
            return bytes(output)


def parse_record(body: bytes, identifier: str) -> tuple[ET.Element, str]:
    xml = body.decode("utf-8-sig")
    if "\x00" in xml or "<!DOCTYPE" in xml.upper() or "<!ENTITY" in xml.upper():
        raise ValueError("Unsafe XML declarations")
    root = ET.fromstring(xml)
    ns = {"o": "http://www.openarchives.org/OAI/2.0/"}
    if root.tag != "{http://www.openarchives.org/OAI/2.0/}OAI-PMH":
        raise ValueError("Unexpected PMC format")
    records = root.findall("o:GetRecord/o:record", ns)
    if len(records) != 1:
        raise ValueError("PMC record unavailable")
    record = records[0]
    header = record.find("o:header", ns)
    if header is None or header.get("status") == "deleted" or header.findtext("o:identifier", "", ns) != "oai:pubmedcentral.nih.gov:" + identifier[3:]:
        raise ValueError("PMC identity mismatch or deleted record")
    article = record.find("o:metadata", ns)
    if article is None or len(article) != 1:
        raise ValueError("Missing article")
    article = article[0]
    # JATS may be namespaced. Normalize tags after validating the OAI envelope.
    for node in article.iter():
        node.tag = node.tag.rsplit("}", 1)[-1]
    if article.tag != "article":
        raise ValueError("Missing JATS article")
    version = header.findtext("o:datestamp", "", ns)
    if not version or len(version) > 40:
        raise ValueError("Missing or unsupported source version")
    datetime.fromisoformat(version.replace("Z", "+00:00"))
    return article, version


def text(node: ET.Element | None) -> str:
    return " ".join(" ".join(node.itertext()).split()) if node is not None else ""


def permission(article: ET.Element) -> tuple[str, str]:
    permissions = article.find("front/article-meta/permissions")
    if permissions is None:
        raise ValueError("No affirmative reuse permission")
    licenses = permissions.findall("license")
    if any(node.get("license-type") not in {None, "open-access"} or node.get("specific-use") for node in licenses):
        raise ValueError("Licence scope is ambiguous")
    urls = [node.get("{http://www.w3.org/1999/xlink}href") for node in licenses]
    approved = [approved_license(url) for url in urls]
    notice = text(permissions)
    if not approved or any(url is None for url in approved) or len(set(approved)) != 1 or len(notice) > 6000:
        raise ValueError("Licence is unsupported or ambiguous")
    if re.search(r"except|unless|third.party|not (?:covered|included|permitted)|permission from|all rights reserved|non.commercial|no derivatives|no adaptation|prohibit|additional permission|share.alike", notice, re.I):
        raise ValueError("Additional rights restrictions need review")
    if article.find("body//permissions") is not None or article.find("body//license") is not None:
        raise ValueError("Section-specific rights need review")
    license_url = approved[0]
    assert license_url is not None
    return license_url, notice


def validate_identity(article: ET.Element, paper: SearchPaper, identifier: str) -> tuple[str, list[str]]:
    meta = article.find("front/article-meta")
    if meta is None:
        raise ValueError("Missing article identity")
    ids = {node.get("pub-id-type"): text(node) for node in meta.findall("article-id")}
    if ids.get("pmc", ids.get("pmcid", "")).removeprefix("PMC") != identifier[3:]:
        raise ValueError("Article identifier differs from requested record")
    if paper.doi and (not doi_identifier(paper.doi) or doi_identifier(paper.doi) != doi_identifier(ids.get("doi"))):
        raise ValueError("Article DOI differs from saved paper")
    title = text(meta.find("title-group/article-title"))
    authors = [" ".join(filter(None, [text(node.find("name/given-names")), text(node.find("name/surname"))])) or text(node.find("collab"))
               for node in meta.findall("contrib-group/contrib") if node.get("contrib-type") == "author"]
    if len(title) > 3000 or len(authors) > 500 or any(len(author) > 300 for author in authors):
        raise ValueError("Attribution metadata exceeds supported limits")
    if not identity_matches(paper, title=title, authors=authors):
        raise ValueError("Title or authors could not be matched conservatively")
    return title, authors


def sections(article: ET.Element) -> list[tuple[str, str]]:
    result = [("Abstract", text(node)) for node in article.findall("front/article-meta/abstract")]
    def visit(node: ET.Element, heading: str) -> None:
        if node.tag in {"fig", "table-wrap", "supplementary-material", "boxed-text", "disp-quote", "ref-list", "fn-group"}:
            return
        heading = text(node.find("title")) or heading if node.tag == "sec" else heading
        if node.tag == "p":
            # Do not copy nested third-party objects/quotes as prose.
            if not any(child.tag in {"fig", "table-wrap", "disp-quote", "permissions"} for child in node.iter()):
                result.append((heading, text(node)))
            return
        for child in node:
            visit(child, heading)
    body = article.find("body")
    if body is not None:
        visit(body, "Main text")
    return result


async def retrieve(paper: SearchPaper, identifier: str) -> SourceDocument:
    document = SourceDocument(external_id=paper.external_id, title=paper.title, authors=paper.authors,
        status="rights_unconfirmed", retrieved_at=datetime.now(timezone.utc),
        source_url=f"https://pmc.ncbi.nlm.nih.gov/articles/{identifier}/",
        request_url=request_url(identifier, "pmc_fm"))
    front_url = request_url(identifier, "pmc_fm")
    front, version = parse_record(await asyncio.wait_for(download(front_url), 8), identifier)
    title, authors = validate_identity(front, paper, identifier)
    try:
        license_url, notice = permission(front)
    except ValueError as exc:
        document.notes = [str(exc) + "; no abstract or full text retained."]
        return document
    # One serial connection, below PMC's 3 requests/second limit.
    await asyncio.sleep(0.35)
    full_url = request_url(identifier, "pmc")
    full, full_version = parse_record(await asyncio.wait_for(download(full_url), 8), identifier)
    validate_identity(full, paper, identifier)
    full_license, full_notice = permission(full)
    if (version, license_url, notice) != (full_version, full_license, full_notice):
        raise ValueError("Source version or permissions changed during retrieval")
    document.title, document.authors = title, authors
    document.license_url, document.rights_notice = license_url, notice
    document.permission_source = document.request_url
    document.request_url = full_url
    document.source_version = identifier + " @ " + full_version
    document.basis = "extracted_sections"
    document.notes = ["Abstract and selected article sections from licensed PMC XML; this is not a complete full-text review."]
    return attach_passages(document, sections(full))


def fetch_pmc(paper: SearchPaper, identifier: str) -> tuple[SourceDocument, int]:
    try:
        return asyncio.run(asyncio.wait_for(retrieve(paper, identifier), 18)), 1
    except Exception as exc:
        return SourceDocument(external_id=paper.external_id, title=paper.title, authors=paper.authors,
            status="unavailable", retrieved_at=datetime.now(timezone.utc),
            source_url=f"https://pmc.ncbi.nlm.nih.gov/articles/{identifier}/",
            notes=["PMC content unavailable, identity/permissions not confirmed, or provider response unsupported; no content retained."]), exc.retry_after if isinstance(exc, ProviderUnavailable) else 60
