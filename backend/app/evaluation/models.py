"""Versioned evaluation files; draft labels are never scientific ground truth."""

from datetime import date, datetime
from hashlib import sha256
import json
import re
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

from app.sources.content_policy import ARXIV_TERMS, CC0

Text = Annotated[str, Field(min_length=1, max_length=30000, pattern=r"\S")]
Identifier = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9_.:-]+$")]
Fingerprint = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Split = Literal["development", "heldout"]
Verdict = Literal["supported", "contradicted", "insufficient_evidence"]
Prediction = Literal["supported", "contradicted", "insufficient_evidence", "abstain"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


def fingerprint(value: BaseModel | dict) -> str:
    payload = value.model_dump(mode="json") if isinstance(value, BaseModel) else value
    return sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def unique(values: list[str], description: str) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"Duplicate {description}")


def review_identity(reviewer: str | None, reviewed_at: datetime | None, rationale: str | None) -> None:
    if not reviewer or not reviewer.strip() or not rationale or not rationale.strip() or reviewed_at is None:
        raise ValueError("Approval requires a named human reviewer, timestamp, and rationale")
    if reviewed_at.utcoffset() is None:
        raise ValueError("Review timestamp must include a timezone")


class Passage(Contract):
    id: Identifier
    text: Text


class Source(Contract):
    id: Identifier
    family: Identifier
    split: Split
    kind: Literal["arxiv_abstract", "synthetic", "unavailable"]
    title: Text
    authors: list[Text] = Field(default_factory=list, max_length=500)
    source_url: str | None = None
    license_url: str | None = None
    permission_url: str | None = None
    captured_at: date | None = None
    permission_note: Text
    passages: list[Passage] = Field(default_factory=list, max_length=24)

    @model_validator(mode="after")
    def content_permissions(self) -> Self:
        if sum(len(p.text) for p in self.passages) > 24000:
            raise ValueError("Source excerpts exceed 24,000 characters")
        if self.kind == "arxiv_abstract":
            match = re.fullmatch(r"https://arxiv.org/abs/(\d{4}\.\d{4,5})v\d+", self.source_url or "")
            if not match or self.family != match[1]:
                raise ValueError("arXiv sources require a versioned canonical URL and matching paper family")
            if self.license_url != CC0 or self.permission_url != ARXIV_TERMS:
                raise ValueError("arXiv abstract metadata requires its CC0 permission record")
            if not self.authors or not self.captured_at or not self.passages:
                raise ValueError("arXiv sources require authors, capture date and abstract text")
        else:
            if any((self.source_url, self.license_url, self.permission_url)):
                raise ValueError("Synthetic/unavailable scenarios cannot impersonate external licensed sources")
            if self.kind == "unavailable" and self.passages:
                raise ValueError("Unavailable or rights-unconfirmed sources cannot retain text")
            if self.kind == "synthetic" and not self.passages:
                raise ValueError("Synthetic sources must contain original fixture text")
        return self


class Case(Contract):
    id: Identifier
    split: Split
    scope: Literal["summary", "finding", "trend", "briefing"]
    claim: Text
    source_ids: list[Identifier] = Field(default_factory=list, max_length=30)
    cited_passage_ids: list[Identifier] = Field(default_factory=list, max_length=50)
    tags: list[Identifier] = Field(min_length=1, max_length=20)
    severity: Literal["ordinary", "critical"] = "ordinary"


class Benchmark(Contract):
    schema_version: Literal["1"] = "1"
    id: Identifier
    version: Text
    description: Text
    sources: list[Source] = Field(min_length=1, max_length=500)
    cases: list[Case] = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def relationships(self) -> Self:
        unique([s.id for s in self.sources], "source IDs")
        unique([c.id for c in self.cases], "case IDs")
        unique([p.id for s in self.sources for p in s.passages], "passage IDs")
        sources = {s.id: s for s in self.sources}
        families: dict[str, str] = {}
        for source in self.sources:
            if source.family in families and families[source.family] != source.split:
                raise ValueError("A paper family cannot appear in both development and heldout splits")
            families[source.family] = source.split
        for case in self.cases:
            unique(case.source_ids, "case source IDs")
            unique(case.cited_passage_ids, "case citation IDs")
            if any(key not in sources or sources[key].split != case.split for key in case.source_ids):
                raise ValueError(f"Case {case.id} has missing sources or crosses splits")
            # Bad citations are intentional test inputs, not approval evidence.
        return self

    def case_hash(self, case: Case) -> str:
        selected = {key: value.model_dump(mode="json") for key, value in sorted(
            ((s.id, s) for s in self.sources if s.id in case.source_ids))}
        return fingerprint({"case": case.model_dump(mode="json"), "sources": selected})

    def passages_for(self, case: Case) -> set[str]:
        return {p.id for s in self.sources if s.id in case.source_ids for p in s.passages}


class Review(Contract):
    case_id: Identifier
    case_sha256: Fingerprint
    status: Literal["pending", "approved", "excluded"] = "pending"
    verdict: Verdict | None = None
    evidence_passage_ids: list[Identifier] = Field(default_factory=list, max_length=50)
    reviewer: Text | None = None
    reviewed_at: datetime | None = None
    rationale: Text | None = None
    human_reviewed: StrictBool = False
    permissions_checked: StrictBool = False

    @model_validator(mode="after")
    def approval(self) -> Self:
        unique(self.evidence_passage_ids, "review passage IDs")
        if self.status in {"approved", "excluded"}:
            review_identity(self.reviewer, self.reviewed_at, self.rationale)
            if not self.human_reviewed or not self.permissions_checked:
                raise ValueError("Human review and permission checks must be explicitly attested")
        if self.status == "approved":
            if self.verdict is None:
                raise ValueError("An approved case needs a human verdict")
            if self.verdict != "insufficient_evidence" and not self.evidence_passage_ids:
                raise ValueError("Supported/contradicted verdicts require evidence passages")
        return self


class Reviews(Contract):
    schema_version: Literal["1"] = "1"
    benchmark_sha256: Fingerprint
    records: list[Review] = Field(default_factory=list, max_length=10000)


class Judgment(Contract):
    case_id: Identifier
    case_sha256: Fingerprint
    verdict: Prediction
    evidence_passage_ids: list[Identifier] = Field(default_factory=list, max_length=50)
    rationale: Text
    cost_usd: float | None = Field(default=None, ge=0, le=1000000)
    latency_seconds: float | None = Field(default=None, ge=0, le=10000000)


class Candidate(Contract):
    schema_version: Literal["1"] = "1"
    benchmark_sha256: Fingerprint
    candidate_id: Text
    method: Literal["human", "saved_model_output", "test_fixture"]
    model: Text | None = None
    prompt_version: Text | None = None
    evaluator_version: Text
    judgments: list[Judgment] = Field(default_factory=list, max_length=10000)

    @model_validator(mode="after")
    def model_provenance(self) -> Self:
        if self.method == "saved_model_output" and self.judgments and (not self.model or not self.prompt_version):
            raise ValueError("Saved model judgments require the model and prompt version")
        return self


class Criteria(Contract):
    schema_version: Literal["1"] = "1"
    status: Literal["draft", "approved"] = "draft"
    reviewer: Text | None = None
    reviewed_at: datetime | None = None
    rationale: Text | None = None
    minimum_reviewed_cases: int = Field(default=20, ge=1)
    minimum_source_families: int = Field(default=5, ge=1)
    minimum_prediction_coverage: float = Field(default=1, ge=0, le=1)
    minimum_accuracy: float = Field(default=0.9, ge=0, le=1)
    maximum_false_acceptance_rate: float = Field(default=0, ge=0, le=1)
    maximum_regressions: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def approval(self) -> Self:
        if self.status == "approved":
            review_identity(self.reviewer, self.reviewed_at, self.rationale)
        return self
