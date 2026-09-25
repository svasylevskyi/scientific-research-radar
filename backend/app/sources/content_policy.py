"""Conservative permission policy. Accessibility and model labels grant no rights."""
from hashlib import sha256
import re
from urllib.parse import urlsplit

from app.radar.contracts import SearchPaper
from app.schemas.source_content import SourceDocument, SourcePassage
from app.sources.comparison import normalized, author_matches

ARXIV_TERMS = "https://info.arxiv.org/help/api/tou.html"
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
MAX_CONTENT_CHARS = 24000
MAX_PASSAGES = 24


def approved_license(url: str | None) -> str | None:
    """Only explicit CC0 or international CC BY licences; no NC/ND/SA/custom terms."""
    if not url:
        return None
    try:
        parsed = urlsplit(url)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or parsed.netloc != "creativecommons.org" or parsed.query or parsed.fragment:
        return None
    path = parsed.path.rstrip("/")
    if path == "/publicdomain/zero/1.0" or re.fullmatch(r"/licenses/by/(?:2\.0|2\.5|3\.0|4\.0)", path):
        return "https://creativecommons.org" + path + "/"
    return None


def pmc_identifier(paper: SearchPaper) -> str | None:
    for value in [paper.external_id, paper.url, *(c.url for c in paper.citations)]:
        if re.fullmatch(r"(?:pmc:)?PMC\d{1,12}", value, re.I):
            return value.split(":")[-1].upper()
        try:
            parsed = urlsplit(value)
            if parsed.scheme in {"https", "http"} and parsed.netloc in {"pmc.ncbi.nlm.nih.gov", "www.ncbi.nlm.nih.gov"}:
                match = re.fullmatch(r"/(?:pmc/)?articles/(PMC\d{1,12})/?", parsed.path)
                if match:
                    return match[1]
        except ValueError:
            continue
    return None


def identity_matches(paper: SearchPaper, *, title: str, authors: list[str]) -> bool:
    names = [name for name in paper.authors if normalized(name) not in {"et al", "others"}]
    return bool(normalized(title) and normalized(title) == normalized(paper.title) and names and authors
                and all(any(author_matches(name, actual) for actual in authors) for name in names))


def attach_passages(document: SourceDocument, sections: list[tuple[str, str]]) -> SourceDocument:
    """Retain bounded text only, with stable IDs, section labels, and a content hash."""
    remaining = MAX_CONTENT_CHARS
    passages: list[SourcePassage] = []
    for section, raw in sections:
        section = " ".join(section.split())[:200]
        text = " ".join(raw.split())
        for start in range(0, len(text), 1600):
            excerpt = text[start:start + min(1600, remaining)]
            if not excerpt or len(passages) >= MAX_PASSAGES or remaining <= 0:
                break
            digest = sha256((document.external_id + str(len(passages)) + excerpt).encode()).hexdigest()[:20]
            passages.append(SourcePassage(id="p-" + digest, section=section, text=excerpt))
            remaining -= len(excerpt)
        if remaining <= 0 or len(passages) >= MAX_PASSAGES:
            break
    if passages:
        document.passages = passages
        document.status = "available"
        document.content_sha256 = sha256("\n".join(p.text for p in passages).encode()).hexdigest()
        document.notes.append("Selected text excerpts; formatting normalized and content bounded. Figures, tables, supplements and references are omitted. Scientific support requires human review.")
    return document
