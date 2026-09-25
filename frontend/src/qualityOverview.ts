import type { QualityEvaluation, QualityFinding } from "./api/researchQuality";
import type { RunQualityResults } from "./api/runQualityResults";
import type { DigestRunDetail } from "./types/digest";

export const qualityLabels = { pass: "Pass", warning: "Warning", hold: "Hold", not_evaluated: "Not evaluated" };

// Completion stores metadata/evidence findings alongside local checks. Do not
// present a metadata conflict as a structural failure, or silently lose it.
export const isEvidenceFinding = (finding: QualityFinding) => finding.code === "source_evidence_incomplete";
const isMetadataFinding = (finding: QualityFinding) => finding.code.startsWith("source_metadata_") || finding.code === "source_verification_unavailable";

export function structuralAssessment(run: DigestRunDetail, evaluation?: QualityEvaluation | null) {
  const findings = (evaluation?.findings ?? run.quality_findings).filter(finding => !isMetadataFinding(finding) && !isEvidenceFinding(finding));
  const evaluated = !!evaluation || run.quality_status !== "not_evaluated";
  const status = !evaluated ? "not_evaluated" : findings.some(finding => finding.severity === "hold") ? "hold" : findings.length ? "warning" : "pass";
  return { findings, status, config: evaluation?.config ?? run.quality_config } as const;
}

export function sourceSummary(source: RunQualityResults["latestSource"]) {
  if (!source) return "Not verified";
  if (!source.papers.length) return source.findings.length ? "Verification unavailable — inspect findings" : "No papers to verify";
  const count = (status: string) => source.papers.filter(paper => paper.status === status).length;
  return `${count("verified")} verified · ${count("conflict")} conflicting · ${count("unverified")} unverified`;
}

export function evidenceSummary(content: RunQualityResults["content"]) {
  if (content.legacy) return "Not captured for this older run";
  if (!content.items.length) return "No saved source content";
  const available = content.items.filter(item => item.document.status === "available" && item.document.passages?.length).length;
  const flagged = content.items.filter(item => item.warnings.length || item.statements.some(statement => !statement.references_valid)).length;
  return `${available} of ${content.items.length} papers with saved excerpts · ${flagged} with evidence limitations`;
}

export function aiSummary(review: RunQualityResults["latestReview"]) {
  if (!review) return "Not reviewed";
  return `${review.status.replaceAll("_", " ")} · ${review.completed_claims}/${review.selected_claims} selected claims reviewed (${review.total_claims} available)`;
}
