"""Structural traceability checks; these do not judge scientific support."""
from app.radar.contracts import PaperSummary, PaperSummariesOutput, SourceAttribution
from app.schemas.source_content import EvidenceStatement, PaperContentRead, SourceDocument
from app.schemas.research_quality import QualityFinding


def inspect_summary(document: SourceDocument, summary: PaperSummary | None) -> PaperContentRead:
    statements = []
    warnings = []
    allowed = {passage.id for passage in document.passages}
    if document.status != "available" or not allowed:
        warnings.append("No permission-checked source text was available.")
    if summary is not None:
        links: dict[int, list[str]] = {}
        for link in summary.finding_evidence:
            if link.finding_index >= len(summary.key_findings) or link.finding_index in links:
                warnings.append("A finding reference has an invalid or duplicate index.")
            links[link.finding_index] = link.passage_ids
        values = [(summary.concise_summary, summary.summary_evidence_ids),
                  *((finding, links.get(index, [])) for index, finding in enumerate(summary.key_findings))]
        for text, ids in values:
            valid = bool(ids) and set(ids).issubset(allowed)
            statements.append(EvidenceStatement(text=text, passage_ids=ids, references_valid=valid))
            if text and not valid and document.status == "available":
                warnings.append("A summary statement has missing or invalid evidence references.")
    return PaperContentRead(document=document, statements=statements, warnings=list(dict.fromkeys(warnings)))


def constrain_summaries(output: PaperSummariesOutput, documents: dict[str, SourceDocument]) -> None:
    for summary in output.paper_summaries:
        document = documents[summary.external_id]
        summary.source_attribution = None  # Never trust model-supplied permission claims.
        if document.status != "available" or not document.passages:
            summary.summary_basis = "metadata_only"
            summary.paper_type = "unclear"
            summary.concise_summary = "This paper was discovered, but reusable source content could not be confirmed. Scientific findings were not summarized."
            summary.suggested_digest_bullet = summary.concise_summary
            for field in ("why_this_paper_matters", "methods", "key_findings", "implications", "recommendations", "follow_up_questions", "related_search_terms", "summary_evidence_ids", "finding_evidence"):
                setattr(summary, field, [])
            summary.limitations = ["Only bibliographic metadata is available; consult the original source."]
            summary.warnings = ["No approved source content was supplied; detailed claims were omitted."]
            summary.confidence_score = 1
            continue
        summary.summary_basis = document.basis
        assert document.source_url and document.license_url
        summary.source_attribution = SourceAttribution(title=document.title, authors=document.authors,
            source_url=document.source_url, license_url=document.license_url, rights_notice=document.rights_notice or "",
            changes="Original AI summary based on selected source excerpts; source formatting normalized and text may be shortened. Source excerpts remain under the linked licence. No author endorsement is implied.")
        note = "Based only on the source abstract; full text was not reviewed." if document.basis == "abstract_only" else "Based on selected source sections; this is not a complete full-text review."
        review = inspect_summary(document, summary)
        summary.warnings = list(dict.fromkeys([*summary.warnings, note, *review.warnings]))


def evidence_findings(documents: dict[str, SourceDocument], summaries: PaperSummariesOutput) -> list[QualityFinding]:
    by_id = {summary.external_id: summary for summary in summaries.paper_summaries}
    affected = [key for key, document in documents.items() if inspect_summary(document, by_id.get(key)).warnings]
    return [QualityFinding(code="source_evidence_incomplete", severity="warning", paper_ids=affected,
        message=f"Source content or evidence links require review for {len(affected)} paper(s); semantic support has not been automatically assessed.")] if affected else []
