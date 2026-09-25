"""Build model inputs without human labels or newly retrieved source material."""
from hashlib import sha256
from typing import Any
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.evaluation.models import Benchmark, Split
from app.models.digest_run import DigestRun
from app.radar.contracts import PaperSummariesOutput
from app.radar.evidence import inspect_summary
from app.schemas.source_content import SourceDocument
from app.services.source_content_service import stored_documents
from app.sources.content_policy import ARXIV_TERMS, CC0, MAX_CONTENT_CHARS, MAX_PASSAGES, approved_license
from app.sources.pmc_content import ENDPOINT


def permitted_document(document: SourceDocument) -> bool:
    """Recheck the saved adapter provenance and integrity; model labels grant no rights."""
    if document.status != "available" or document.policy_version != "1" or not document.passages:
        return False
    if len(document.passages) > MAX_PASSAGES or sum(len(p.text) for p in document.passages) > MAX_CONTENT_CHARS:
        return False
    if len({p.id for p in document.passages}) != len(document.passages):
        return False
    if document.content_sha256 != sha256("\n".join(p.text for p in document.passages).encode()).hexdigest():
        return False
    try:
        source = urlsplit(document.source_url or "")
        permission = urlsplit(document.permission_source or "")
    except ValueError:
        return False
    if source.scheme != "https" or not document.source_version or not document.authors:
        return False
    if source.netloc == "arxiv.org":
        return document.basis == "abstract_only" and document.license_url == CC0 and document.permission_source == ARXIV_TERMS
    return (source.netloc == "pmc.ncbi.nlm.nih.gov" and source.path.startswith("/articles/PMC")
        and document.basis == "extracted_sections" and approved_license(document.license_url) is not None
        and permission.scheme == "https" and permission.netloc == "pmc.ncbi.nlm.nih.gov"
        and permission.path == urlsplit(ENDPOINT).path and document.permission_source == document.request_url)


def run_inputs(db: Session, run: DigestRun) -> list[dict[str, Any]]:
    if str(run.status) != "completed":
        raise HTTPException(409, "AI claim review is available only for completed runs.")
    stage = next((s for s in run.stages if str(s.stage) == "paper_summaries"), None)
    if stage is None or not stage.result_data:
        raise HTTPException(409, "Saved paper summaries are unavailable.")
    summaries = PaperSummariesOutput.model_validate(stage.result_data)
    documents = stored_documents(db, run.id)
    cases: list[dict[str, Any]] = []
    for paper_index, summary in enumerate(summaries.paper_summaries):
        document = documents.get(summary.external_id)
        if summary.summary_basis == "metadata_only":
            continue  # This is a disclosure, not a scientific claim to assess.
        if document is None or not permitted_document(document):
            raise HTTPException(409, "A summarized paper has no intact, permitted saved evidence. This run cannot be reviewed by AI.")
        evidence = inspect_summary(document, summary)
        for index, statement in enumerate(evidence.statements):
            if not statement.text.strip():
                continue
            sources = [{"title": document.title, "authors": document.authors, "basis": document.basis,
                "source_url": document.source_url, "license_url": document.license_url,
                "permission_url": document.permission_source, "source_version": document.source_version,
                "content_sha256": document.content_sha256, "rights_notice": document.rights_notice,
                "passages": [p.model_dump() for p in document.passages]}]
            cases.append({"case_id": f"paper-{paper_index}-statement-{index}", "paper_id": summary.external_id,
                "scope": "summary" if index == 0 else "finding", "claim": statement.text,
                "cited_passage_ids": statement.passage_ids, "sources": sources})
    if not cases:
        raise HTTPException(409, "No scientific summary claims with saved permitted evidence are available in this run.")
    return cases


def benchmark_inputs(benchmark: Benchmark, split: Split) -> list[dict[str, Any]]:
    # Deliberate allow-list: labels, severity, tags, split names and criteria never
    # reach the model. Case hashes bind the saved output to the frozen benchmark.
    return [{"case_id": case.id, "case_sha256": benchmark.case_hash(case), "scope": case.scope,
        "claim": case.claim, "cited_passage_ids": case.cited_passage_ids,
        "sources": [{"title": source.title, "authors": source.authors,
            "basis": source.kind, "source_url": source.source_url, "license_url": source.license_url,
            "permission_url": source.permission_url, "permission_note": source.permission_note,
            "passages": [p.model_dump() for p in source.passages]}
            for source in benchmark.sources if source.id in case.source_ids]}
        for case in benchmark.cases if case.split == split]
