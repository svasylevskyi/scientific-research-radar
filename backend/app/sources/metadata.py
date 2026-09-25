"""Only fixed HTTPS metadata endpoints are fetched; paper URLs are never fetched."""
import asyncio
from datetime import datetime, timezone
import html
import json
import re
from typing import Any, Literal
from urllib.parse import urlencode, urlsplit
from xml.etree import ElementTree

import httpx

from app.schemas.source_verification import MetadataLookup, SourceMetadata

Provider = Literal["crossref", "arxiv"]
ENDPOINTS = {"crossref": "https://api.crossref.org/works", "arxiv": "https://export.arxiv.org/api/query"}
MAX_BODY_BYTES = 1_000_000
REQUEST_DEADLINE = 8


def plain(value: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]*>", " ", value)).split())


def safe_url(value: str | None) -> str | None:
    if not value or len(value) > 2000:
        return None
    try:
        parsed = urlsplit(value)
        return value if parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username else None
    except ValueError:
        return None


def doi_identifier(value: str | None) -> str | None:
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", (value or "").strip(), flags=re.I).lower()
    # Commas are excluded because they delimit Crossref filters; unsupported IDs
    # are reported as unverified, never interpolated as provider query syntax.
    return value if len(value) <= 200 and re.fullmatch(r"10\.\d{4,9}/[^\s,?#]+", value) else None


def arxiv_identifier(value: str | None) -> str | None:
    value = (value or "").strip()
    value = re.sub(r"^(?:arxiv:|10\.48550/arxiv\.)", "", value, flags=re.I)
    if value.startswith(("http://", "https://")):
        try:
            url = urlsplit(value)
            if url.hostname not in {"arxiv.org", "www.arxiv.org", "export.arxiv.org"}:
                return None
            value = re.sub(r"^/(?:abs|pdf)/", "", url.path).removesuffix(".pdf")
        except ValueError:
            return None
    return value.lower() if re.fullmatch(r"(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?", value, re.I) else None


def request_url(provider: Provider, identifiers: list[str]) -> str:
    params = ({"filter": ",".join(f"doi:{value}" for value in identifiers), "rows": len(identifiers)}
              if provider == "crossref" else {"id_list": ",".join(identifiers), "max_results": len(identifiers)})
    return ENDPOINTS[provider] + "?" + urlencode(params)


def crossref_record(item: dict[str, Any]) -> SourceMetadata:
    dates = []
    for key in ("published", "published-online", "published-print", "issued"):
        parts = item.get(key, {}).get("date-parts", [[]])[0]
        if not parts or not 1 <= len(parts) <= 3:
            continue
        value = "-".join(str(part).zfill(4 if index == 0 else 2) for index, part in enumerate(parts))
        # Validate complete/partial dates without inventing missing precision.
        datetime.fromisoformat(value + ("-01-01" if len(parts) == 1 else "-01" if len(parts) == 2 else ""))
        dates.append(value)
    identifier = doi_identifier(item.get("DOI"))
    if identifier is None:
        raise ValueError("Invalid DOI in provider record")
    return SourceMetadata(identifier=identifier, doi=identifier,
        title=plain(" ".join(item.get("title", [])))[:3000],
        authors=[plain(author.get("name") or " ".join(filter(None, [author.get("given"), author.get("family")])))[:300] for author in item.get("author", [])[:500]],
        dates=sorted(set(dates)), url=safe_url(item.get("URL")),
        # Crossref does not grant reuse rights to deposited abstracts.
        abstract=None,
        full_text_links=[url for link in item.get("link", [])[:10] if (url := safe_url(link.get("URL")))],
    )


def parse_crossref(body: bytes) -> dict[str, SourceMetadata]:
    data = json.loads(body)
    if data.get("status") != "ok" or not isinstance(data.get("message", {}).get("items"), list):
        raise ValueError("Invalid Crossref response")
    records = {}
    for item in data["message"]["items"]:
        try:
            record = crossref_record(item)
            records[record.identifier] = record
        except (TypeError, ValueError, KeyError, IndexError, AttributeError):
            continue  # Missing/malformed records become explicitly unverified.
    return records


def parse_arxiv(body: bytes) -> dict[str, SourceMetadata]:
    xml = body.decode("utf-8-sig")
    if "\x00" in xml or "<!DOCTYPE" in xml.upper() or "<!ENTITY" in xml.upper():
        raise ValueError("XML declarations are not accepted")
    root = ElementTree.fromstring(xml)
    ns = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}
    if root.tag != "{http://www.w3.org/2005/Atom}feed":
        raise ValueError("Invalid arXiv response")
    records = {}
    for entry in root.findall("a:entry", ns):
        identifier = arxiv_identifier(entry.findtext("a:id", "", ns))
        if identifier is None:
            continue
        published = entry.findtext("a:published", "", ns)[:10]
        if published:
            datetime.fromisoformat(published)
        record = SourceMetadata(identifier=identifier,
            title=plain(entry.findtext("a:title", "", ns))[:3000],
            authors=[plain(author.findtext("a:name", "", ns))[:300] for author in entry.findall("a:author", ns)[:500]],
            dates=[published] if published else [], doi=doi_identifier(entry.findtext("x:doi", None, ns)),
            url="https://arxiv.org/abs/" + identifier,
            abstract=plain(entry.findtext("a:summary", "", ns))[:10000] or None,
            full_text_links=[url for link in entry.findall("a:link", ns) if link.get("title") == "pdf" and (url := safe_url(link.get("href")))][:10],
            updated=entry.findtext("a:updated", None, ns))
        records[identifier] = record
        records[re.sub(r"v\d+$", "", identifier)] = record
    return records


async def _download(url: str) -> tuple[bytes, int]:
    async with httpx.AsyncClient(timeout=3, follow_redirects=False, headers={"User-Agent": "ScientificResearchRadar/1.0 (metadata verification)", "Accept-Encoding": "identity"}) as client:
        async with client.stream("GET", url) as response:
            if response.status_code == 429:
                retry = response.headers.get("Retry-After", "60")
                return b"", min(86400, max(60, int(retry))) if retry.isdigit() else 60
            response.raise_for_status()
            if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                raise ValueError("Compressed metadata responses are not accepted")
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > MAX_BODY_BYTES:
                    raise ValueError("Metadata response exceeds size limit")
            return bytes(body), 0


async def _bounded_download(url: str) -> tuple[bytes, int]:
    return await asyncio.wait_for(_download(url), timeout=REQUEST_DEADLINE)


def fetch_metadata(provider: Provider, identifiers: list[str]) -> tuple[dict[str, MetadataLookup], int]:
    """One batched request. No redirects, provider fallbacks, retries, or OpenAI."""
    url = request_url(provider, identifiers)
    retrieved_at = datetime.now(timezone.utc)
    reason = None
    backoff = 0
    records: dict[str, SourceMetadata] = {}
    try:
        body, backoff = asyncio.run(_bounded_download(url))
        if backoff:
            reason = "Provider rate limit reached; retry later."
        else:
            records = parse_crossref(body) if provider == "crossref" else parse_arxiv(body)
    except (httpx.HTTPError, TimeoutError, ValueError, TypeError, KeyError, AttributeError, ElementTree.ParseError):
        reason = "Metadata provider unavailable or returned an unsupported response; retry later."
        backoff = 60
    return {identifier: MetadataLookup(provider=provider, identifier=identifier, request_url=url,
        retrieved_at=retrieved_at, metadata=records.get(identifier),
        reason=reason or (None if identifier in records else "No matching record returned by this provider; the source is not proven invalid."))
        for identifier in identifiers}, backoff
