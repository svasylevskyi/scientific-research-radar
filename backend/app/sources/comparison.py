"""Conservative comparisons: missing metadata and ambiguity are not contradictions."""
from difflib import SequenceMatcher
import re
import unicodedata
from typing import Literal

from app.radar.contracts import SearchPaper
from app.schemas.source_verification import FieldComparison, MetadataLookup, PaperVerification, SourceMetadata
from app.sources.metadata import Provider, arxiv_identifier, doi_identifier, plain


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", plain(value)).casefold()
    return " ".join(re.sub(r"[^\w\s]", " ", "".join(c for c in value if not unicodedata.combining(c))).split())


def lookup_identity(paper: SearchPaper) -> tuple[Provider, str] | None:
    # Prefer an explicit repository identity over a related journal DOI.
    arxiv = arxiv_identifier(paper.url) or arxiv_identifier(paper.pdf_url)
    if not arxiv and "arxiv" in paper.source_name.lower():
        arxiv = arxiv_identifier(paper.external_id)
    doi = doi_identifier(paper.doi)
    arxiv = arxiv or (arxiv_identifier(doi) if doi and doi.startswith("10.48550/arxiv.") else None)
    if arxiv:
        return "arxiv", arxiv
    doi = doi or doi_identifier(paper.url)
    return ("crossref", doi) if doi else None


def author_matches(claimed: str, actual: str) -> bool:
    def tokens(value: str) -> list[str]:
        if "," in value:
            last, first = value.split(",", 1)
            value = first + " " + last
        return normalized(value).split()
    left, right = tokens(claimed), tokens(actual)
    if not left or not right or left[-1] != right[-1]:
        return False
    # Initials are compatible, but author completeness/order is not asserted.
    return all(any(a == b or (len(a) == 1 and b.startswith(a)) or (len(b) == 1 and a.startswith(b))
                   for b in right[:-1]) for a in left[:-1])


def compare_paper(paper: SearchPaper, evidence: MetadataLookup | None) -> PaperVerification:
    claimed = SourceMetadata(identifier=paper.external_id, title=paper.title, authors=paper.authors,
        dates=[paper.published_date.isoformat()] if paper.published_date else [], doi=paper.doi,
        url=paper.url, full_text_links=[paper.pdf_url] if paper.pdf_url else [])
    result = PaperVerification(external_id=paper.external_id, title=paper.title, claimed=claimed,
        status="unverified", evidence=evidence)
    if evidence is None or evidence.metadata is None:
        result.notes.append(evidence.reason if evidence and evidence.reason else "No supported DOI or arXiv identifier is available.")
        return result
    actual = evidence.metadata
    checks = result.checks
    def add(field: str, status: Literal["match", "conflict", "unverified"], message: str) -> None:
        checks.append(FieldComparison(field=field, status=status, message=message))
    requested = evidence.identifier
    returned = actual.identifier
    identity_matches = (requested == returned or (evidence.provider == "arxiv" and not re.search(r"v\d+$", requested)
                        and requested == re.sub(r"v\d+$", "", returned)))
    add("identifier", "match" if identity_matches else "conflict", "Provider record identifier matches." if identity_matches else "Provider returned a different identifier or version.")
    if evidence.provider == "crossref":
        if paper.doi and not doi_identifier(paper.doi):
            add("provided DOI", "unverified", "The saved DOI is malformed or unsupported; lookup used the DOI URL instead.")
        url_doi = doi_identifier(paper.url)
        if url_doi and url_doi != actual.identifier:
            add("DOI URL", "conflict", "The saved DOI URL points to a different identifier.")
    left, right = normalized(paper.title), normalized(actual.title)
    if not left or not right:
        add("title", "unverified", "A title is missing.")
    elif left == right:
        add("title", "match", "Titles match after punctuation/case normalization.")
    elif SequenceMatcher(None, left, right).ratio() < 0.6:
        add("title", "conflict", "The recorded title differs substantially from the source title.")
    else:
        add("title", "unverified", "Title wording differs; review possible subtitle or version differences.")
    names = [name for name in paper.authors if normalized(name) not in {"et al", "others"}]
    if not names or not actual.authors:
        add("authors", "unverified", "Author metadata is missing.")
    elif all(any(author_matches(name, other) for other in actual.authors) for name in names):
        add("authors", "match", "Provided author names are compatible; list completeness is not asserted.")
    elif (all(len(normalized(name).split()) >= 2 and all(len(token) > 1 for token in normalized(name).split()) for name in names + actual.authors)
          and not any(author_matches(name, other) for name in names for other in actual.authors)):
        add("authors", "conflict", "None of the provided full author names match the source authors.")
    else:
        add("authors", "unverified", "Some author names do not match; initials, order, and name variants need review.")
    if not paper.published_date or not actual.dates:
        add("publication date", "unverified", "Publication date metadata is missing.")
    elif paper.published_date.isoformat() in actual.dates:
        add("publication date", "match", "Matches a recorded publication date (online/print/issued dates are accepted).")
    elif any(paper.published_date.isoformat().startswith(day) for day in actual.dates):
        add("publication date", "unverified", "Source date has only year/month precision; the exact day is unverified.")
    else:
        add("publication date", "conflict", "Date differs from the source publication date(s); revision dates are not publication dates.")
    if evidence.provider == "arxiv" and paper.doi:
        doi = doi_identifier(paper.doi)
        alias = doi and doi.startswith("10.48550/arxiv.") and arxiv_identifier(doi) == re.sub(r"v\d+$", "", requested)
        add("related DOI", "match" if alias or (doi and doi == actual.doi) else "unverified",
            "DOI matches repository metadata." if alias or (doi and doi == actual.doi) else "Related journal DOI is not confirmed by this repository record.")
    result.status = "conflict" if any(c.status == "conflict" for c in checks) else "unverified" if any(c.status == "unverified" for c in checks) else "verified"
    result.notes.append("Metadata retrieved. Reported full-text links are not fetched; access, licensing, and scientific claims are not verified.")
    return result
