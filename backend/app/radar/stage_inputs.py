"""Pure stage inputs, preserving discovery order and prompt payload shape."""

from datetime import datetime
from typing import Any

from app.models.digest import Digest
from app.radar.contracts import DiscoveryRelevanceOutput, PaperSummariesOutput
from app.schemas.digest import DigestRead


def summary_input(
    discovery: DiscoveryRelevanceOutput,
) -> list[dict[str, Any]]:
    relevance_by_id = {
        item.external_id: item for item in discovery.relevance.assessments
    }
    return [
        {
            **paper.model_dump(mode="json"),
            "relevance": relevance_by_id[paper.external_id].model_dump(mode="json"),
        }
        for paper in discovery.search.papers
        if relevance_by_id[paper.external_id].recommended_status
        in {"summarize", "mention_briefly"}
    ]


def trend_input(
    discovery: DiscoveryRelevanceOutput,
    summaries: PaperSummariesOutput,
) -> list[dict[str, Any]]:
    relevance_by_id = {
        item.external_id: item for item in discovery.relevance.assessments
    }
    summary_by_id = {item.external_id: item for item in summaries.paper_summaries}
    return [
        {
            "external_id": paper.external_id,
            "title": paper.title,
            "authors": paper.authors,
            "published_date": (
                paper.published_date.isoformat() if paper.published_date else None
            ),
            "url": paper.url,
            "source_name": paper.source_name,
            "access_status": paper.access_status,
            "relevance": relevance_by_id[paper.external_id].model_dump(mode="json"),
            "summary": summary_by_id[paper.external_id].model_dump(mode="json"),
        }
        for paper in discovery.search.papers
        if paper.external_id in summary_by_id
    ]


def briefing_input(
    discovery: DiscoveryRelevanceOutput,
    summaries: PaperSummariesOutput,
) -> list[dict[str, Any]]:
    relevance_by_id = {
        item.external_id: item for item in discovery.relevance.assessments
    }
    summary_by_id = {item.external_id: item for item in summaries.paper_summaries}
    return [
        {
            "external_id": paper.external_id,
            "title": paper.title,
            "authors": paper.authors,
            "url": paper.url,
            "relevance_score": relevance_by_id[paper.external_id].score,
            "recommended_status": relevance_by_id[paper.external_id].recommended_status,
            "concise_summary": summary_by_id[paper.external_id].concise_summary,
            "key_findings": summary_by_id[paper.external_id].key_findings,
            "limitations": summary_by_id[paper.external_id].limitations,
            "suggested_digest_bullet": summary_by_id[
                paper.external_id
            ].suggested_digest_bullet,
            "confidence_score": summary_by_id[paper.external_id].confidence_score,
        }
        for paper in discovery.search.papers
        if paper.external_id in summary_by_id
    ]


def digest_snapshot(
    *, digest: Digest, scheduled_for: datetime | None, time_zone: str
) -> dict[str, Any]:
    snapshot = DigestRead.model_validate(digest).model_dump(
        mode="json", exclude={"schedule", "schedule_next_at", "schedule_exhausted"}
    )
    if scheduled_for is not None:
        from zoneinfo import ZoneInfo

        end = scheduled_for.astimezone(ZoneInfo(time_zone)).date()
        start = end - (digest.reporting_to - digest.reporting_from)
        snapshot.update(reporting_from=start.isoformat(), reporting_to=end.isoformat())
    return snapshot
