import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Divider,
  Link,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import type { ReactNode } from "react";

import type {
  Confidence,
  DigestRunDetail,
  DigestRunPaper,
  Priority,
  RecommendedSearch,
} from "../types/digest";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

function confidenceColor(confidence: Confidence): "success" | "warning" | "default" {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "warning";
  return "default";
}

function priorityColor(priority: Priority): "error" | "warning" | "default" {
  if (priority === "high") return "error";
  if (priority === "medium") return "warning";
  return "default";
}

function EmptyContent({ children = "Nothing was identified for this section." }: { children?: ReactNode }) {
  return <Typography color="text.secondary">{children}</Typography>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3 }, borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>{title}</Typography>
      {children}
    </Paper>
  );
}

function BulletList({ items, emptyText }: { items: string[]; emptyText?: string }) {
  if (items.length === 0) return <EmptyContent>{emptyText}</EmptyContent>;
  return (
    <List dense disablePadding sx={{ pl: 2.5, listStyle: "disc" }}>
      {items.map((item, index) => (
        <ListItem key={`${item}-${index}`} disableGutters sx={{ display: "list-item", py: 0.25 }}>
          <ListItemText primary={item} primaryTypographyProps={{ color: "text.secondary" }} />
        </ListItem>
      ))}
    </List>
  );
}

function TextBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.4 }}>{title}</Typography>
      {typeof children === "string" || typeof children === "number" ? (
        <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{children}</Typography>
      ) : children}
    </Box>
  );
}

function IdChips({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <EmptyContent>No supporting papers were referenced.</EmptyContent>;
  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      {ids.map((id) => (
        <Chip
          key={id}
          size="small"
          variant="outlined"
          label={id}
          sx={{
            maxWidth: "100%",
            height: "auto",
            "& .MuiChip-label": { whiteSpace: "normal", overflowWrap: "anywhere", py: 0.5 },
          }}
        />
      ))}
    </Stack>
  );
}

function SearchList({ searches }: { searches: RecommendedSearch[] }) {
  if (searches.length === 0) return <EmptyContent>No follow-up searches were recommended.</EmptyContent>;
  return (
    <Stack spacing={1.25}>
      {searches.map((search, index) => (
        <Box key={`${search.query}-${index}`}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
            <Typography fontWeight={700}>{search.query}</Typography>
            <Chip size="small" color={priorityColor(search.priority)} label={search.priority} />
          </Stack>
          <Typography color="text.secondary">{search.reason}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

function PaperLinks({ result }: { result: DigestRunPaper }) {
  const links = [
    { title: "Source", url: result.paper.url },
    { title: "PDF", url: result.search_data.pdf_url },
  ].filter((item): item is { title: string; url: string } => Boolean(safeExternalUrl(item.url)));
  if (links.length === 0) return null;
  return (
    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
      {links.map((item) => (
        <Link
          key={item.title}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
        >
          {item.title}<OpenInNewRoundedIcon sx={{ fontSize: 16 }} />
        </Link>
      ))}
    </Stack>
  );
}

export function DigestBriefingResult({ run }: { run: DigestRunDetail }) {
  const briefing = run.briefing;
  if (!briefing) {
    return <Alert severity="info">No briefing data was produced for this run.</Alert>;
  }
  const data = briefing.data;
  const paperByExternalId = new Map(
    run.paper_results.map((result) => [result.paper.external_id, result.paper]),
  );
  const selectedPapers = [
    ...data.top_paper_external_ids.map((id) => ({ id, category: "Top paper" })),
    ...data.secondary_paper_external_ids.map((id) => ({ id, category: "Secondary paper" })),
  ];

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <AutoStoriesRoundedIcon color="primary" />
            <Typography variant="h4" component="h2">{briefing.title}</Typography>
          </Stack>
          <Chip variant="outlined" label={`Source basis: ${label(data.source_basis)}`} sx={{ alignSelf: "flex-start" }} />
        </Stack>
        <Typography variant="h6" sx={{ mb: 0.75 }}>Executive summary</Typography>
        <Typography color="text.secondary">{briefing.executive_summary}</Typography>
      </Paper>

      <Section title="Highlights">
        <BulletList items={data.highlights} emptyText="No highlights were produced." />
      </Section>

      <Section title="Main signal">
        {data.main_signal ? (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography variant="h6">{data.main_signal.title}</Typography>
              <Chip size="small" color={confidenceColor(data.main_signal.confidence)} label={`${data.main_signal.confidence} confidence`} />
            </Stack>
            <Typography color="text.secondary">{data.main_signal.summary}</Typography>
            <TextBlock title="Why it matters">{data.main_signal.why_it_matters}</TextBlock>
            <TextBlock title="Supporting papers"><IdChips ids={data.main_signal.supporting_external_ids} /></TextBlock>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.4 }}>Caveats</Typography>
              <BulletList items={data.main_signal.caveats} emptyText="No caveats were reported." />
            </Box>
          </Stack>
        ) : <EmptyContent>No main signal was supported by this run.</EmptyContent>}
      </Section>

      <Section title="Papers to read">
        {selectedPapers.length === 0 ? (
          <EmptyContent>No papers were selected for the briefing.</EmptyContent>
        ) : (
          <Stack spacing={1.25}>
            {selectedPapers.map(({ id, category }) => {
              const paper = paperByExternalId.get(id);
              const sourceUrl = safeExternalUrl(paper?.url);
              return (
                <Box key={`${category}-${id}`}>
                  <Chip size="small" label={category} sx={{ mb: 0.5 }} />
                  <Typography fontWeight={700}>
                    {sourceUrl ? (
                      <Link href={sourceUrl} target="_blank" rel="noopener noreferrer" underline="hover">
                        {paper?.title ?? id}
                      </Link>
                    ) : paper?.title ?? id}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{id}</Typography>
                </Box>
              );
            })}
          </Stack>
        )}
      </Section>

      <Section title="Recommended actions">
        {data.recommendations.length === 0 ? (
          <EmptyContent>No actions were recommended.</EmptyContent>
        ) : (
          <Stack spacing={1.5} divider={<Divider flexItem />}>
            {data.recommendations.map((recommendation, index) => (
              <Box key={`${recommendation.action}-${index}`}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 0.4 }}>
                  <Typography fontWeight={700}>{recommendation.action}</Typography>
                  <Chip size="small" color={priorityColor(recommendation.priority)} label={recommendation.priority} />
                </Stack>
                <Typography color="text.secondary" sx={{ mb: recommendation.related_external_ids.length ? 1 : 0 }}>
                  {recommendation.reason}
                </Typography>
                {recommendation.related_external_ids.length > 0 && <IdChips ids={recommendation.related_external_ids} />}
              </Box>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Recommended next searches">
        <SearchList searches={data.recommended_next_searches} />
      </Section>

      <Section title="Transparency and quality">
        <Stack spacing={1.5}>
          <Typography color="text.secondary">{data.transparency_note}</Typography>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.4 }}>Quality warnings</Typography>
            <BulletList items={data.quality_warnings} emptyText="No quality warnings were reported." />
          </Box>
        </Stack>
      </Section>
    </Stack>
  );
}

export function TrendAnalysisResult({ run }: { run: DigestRunDetail }) {
  const analysis = run.trend_analysis;
  if (!analysis) {
    return <Alert severity="info">No trend analysis data was produced for this run.</Alert>;
  }
  const data = analysis.data;

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: 3 }}>
        <Stack direction="row" spacing={1.25} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1.25 }}>
          <InsightsRoundedIcon color="primary" />
          <Typography variant="h5">Trend overview</Typography>
          <Chip size="small" color={confidenceColor(data.overall_confidence)} label={`${data.overall_confidence} confidence`} />
        </Stack>
        <Typography color="text.secondary">{analysis.overview}</Typography>
      </Paper>

      <Section title="Analysis limitations">
        <BulletList items={data.analysis_limitations} emptyText="No analysis limitations were reported." />
      </Section>

      <Section title="Themes">
        {data.themes.length === 0 ? <EmptyContent>No themes were identified.</EmptyContent> : (
          <Stack spacing={2} divider={<Divider flexItem />}>
            {data.themes.map((theme, index) => (
              <Stack key={`${theme.title}-${index}`} spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography variant="h6">{theme.title}</Typography>
                  <Chip size="small" variant="outlined" label={label(theme.evidence_type)} />
                  <Chip size="small" color={confidenceColor(theme.confidence)} label={`${theme.confidence} confidence`} />
                </Stack>
                <Typography color="text.secondary">{theme.summary}</Typography>
                <TextBlock title="Observed pattern">{theme.observed_pattern}</TextBlock>
                <TextBlock title="Interpretation">{theme.interpretation}</TextBlock>
                <TextBlock title="Audience relevance">{theme.relevance_to_audience}</TextBlock>
                <IdChips ids={theme.evidence_external_ids} />
                <BulletList items={theme.caveats} emptyText="No caveats were reported." />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Emerging items">
        {data.emerging_items.length === 0 ? <EmptyContent>No emerging items were identified.</EmptyContent> : (
          <Stack spacing={2} divider={<Divider flexItem />}>
            {data.emerging_items.map((item, index) => (
              <Stack key={`${item.name}-${index}`} spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography variant="h6">{item.name}</Typography>
                  <Chip size="small" variant="outlined" label={label(item.item_type)} />
                  <Chip size="small" label={label(item.maturity_level)} />
                  <Chip size="small" color={confidenceColor(item.confidence)} label={`${item.confidence} confidence`} />
                </Stack>
                <Typography color="text.secondary">{item.description}</Typography>
                <TextBlock title="Why it matters">{item.why_it_matters}</TextBlock>
                <IdChips ids={item.supporting_external_ids} />
                <BulletList items={item.caveats} emptyText="No caveats were reported." />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Repeated limitations and unresolved problems">
        {data.repeated_limitations_or_unresolved_problems.length === 0 ? (
          <EmptyContent>No repeated limitations or unresolved problems were identified.</EmptyContent>
        ) : (
          <Stack spacing={2} divider={<Divider flexItem />}>
            {data.repeated_limitations_or_unresolved_problems.map((problem, index) => (
              <Stack key={`${problem.name}-${index}`} spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography variant="h6">{problem.name}</Typography>
                  <Chip size="small" color={confidenceColor(problem.confidence)} label={`${problem.confidence} confidence`} />
                </Stack>
                <Typography color="text.secondary">{problem.description}</Typography>
                <TextBlock title="Why it matters">{problem.why_it_matters}</TextBlock>
                <TextBlock title="Affected methods or topics">
                  {problem.affected_methods_or_topics.length > 0 ? problem.affected_methods_or_topics.join(", ") : "Not specified."}
                </TextBlock>
                <IdChips ids={problem.supporting_external_ids} />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Contradictions and competing approaches">
        {data.contradictions_or_competing_approaches.length === 0 ? (
          <EmptyContent>No competing approaches were identified.</EmptyContent>
        ) : (
          <Stack spacing={2} divider={<Divider flexItem />}>
            {data.contradictions_or_competing_approaches.map((item, index) => (
              <Stack key={`${item.description}-${index}`} spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography variant="h6">{item.description}</Typography>
                  <Chip size="small" color={confidenceColor(item.confidence)} label={`${item.confidence} confidence`} />
                </Stack>
                <TextBlock title="Approach A">{item.approach_a}</TextBlock>
                <TextBlock title="Approach B">{item.approach_b}</TextBlock>
                <TextBlock title="Interpretation">{item.interpretation}</TextBlock>
                <IdChips ids={item.supporting_external_ids} />
                <BulletList items={item.caveats} emptyText="No caveats were reported." />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Weak signals">
        {data.weak_signals.length === 0 ? <EmptyContent>No weak signals were identified.</EmptyContent> : (
          <Stack spacing={2} divider={<Divider flexItem />}>
            {data.weak_signals.map((signal, index) => (
              <Stack key={`${signal.name}-${index}`} spacing={1}>
                <Typography variant="h6">{signal.name}</Typography>
                <Typography color="text.secondary">{signal.description}</Typography>
                <TextBlock title="Why it may matter">{signal.why_it_may_matter}</TextBlock>
                <TextBlock title="Why confidence is limited">{signal.why_confidence_is_limited}</TextBlock>
                <TextBlock title="Monitoring query">{signal.recommended_monitoring_query}</TextBlock>
                <IdChips ids={signal.supporting_external_ids} />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Changes since previous runs">
        {data.changes_vs_previous_digest.length === 0 ? (
          <EmptyContent>No supported historical changes were identified.</EmptyContent>
        ) : (
          <Stack spacing={2} divider={<Divider flexItem />}>
            {data.changes_vs_previous_digest.map((change, index) => (
              <Stack key={`${change.description}-${index}`} spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <Chip size="small" variant="outlined" label={label(change.change_type)} />
                  <Chip size="small" color={confidenceColor(change.confidence)} label={`${change.confidence} confidence`} />
                </Stack>
                <Typography color="text.secondary">{change.description}</Typography>
                <TextBlock title="Previous run reference">{change.previous_digest_reference}</TextBlock>
                <IdChips ids={change.supporting_external_ids} />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Practical implications">
        {data.practical_implications.length === 0 ? <EmptyContent>No practical implications were identified.</EmptyContent> : (
          <Stack spacing={2} divider={<Divider flexItem />}>
            {data.practical_implications.map((item, index) => (
              <Stack key={`${item.audience_segment}-${index}`} spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <Chip size="small" variant="outlined" label={label(item.audience_segment)} />
                  <Chip size="small" color={confidenceColor(item.confidence)} label={`${item.confidence} confidence`} />
                </Stack>
                <Typography color="text.secondary">{item.implication}</Typography>
                <TextBlock title="Recommended action">{item.recommended_action}</TextBlock>
                <IdChips ids={item.supporting_external_ids} />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Recommendations">
        <BulletList items={data.recommendations} emptyText="No recommendations were produced." />
      </Section>

      <Section title="Recommended next searches">
        <SearchList searches={data.recommended_next_searches} />
      </Section>
    </Stack>
  );
}

function PaperResult({ result }: { result: DigestRunPaper }) {
  const relevance = result.relevance_data;
  const summary = result.summary_data;
  const search = result.search_data;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Box sx={{ p: { xs: 2.25, sm: 3 } }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.75 }}>
              <ArticleRoundedIcon color="primary" sx={{ mt: 0.35 }} />
              <Typography variant="h5" component="h2">{result.paper.title}</Typography>
            </Stack>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              {result.paper.authors.length > 0 ? result.paper.authors.join(", ") : "Authors unavailable"}
            </Typography>
            <PaperLinks result={result} />
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}>
            <Chip color="primary" label={`${Math.round(result.relevance_score)} relevance`} />
            <Chip variant="outlined" label={`Rank ${result.rank}`} />
          </Stack>
        </Stack>
      </Box>

      <Divider />
      <Accordion disableGutters elevation={0} defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
          <Typography fontWeight={700}>Summary</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {summary ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                <Chip size="small" label={label(summary.paper_type)} />
                <Chip size="small" variant="outlined" label={label(summary.summary_basis)} />
                <Chip size="small" variant="outlined" label={`${summary.confidence_score}/10 confidence`} />
              </Stack>
              <Typography color="text.secondary">{summary.concise_summary}</Typography>
              <TextBlock title="Digest-ready bullet">{summary.suggested_digest_bullet}</TextBlock>
              <Box><Typography variant="subtitle2">Why this paper matters</Typography><BulletList items={summary.why_this_paper_matters} /></Box>
              <Box><Typography variant="subtitle2">Key findings</Typography><BulletList items={summary.key_findings} emptyText="No findings were verified." /></Box>
              <Box><Typography variant="subtitle2">Methods</Typography><BulletList items={summary.methods} emptyText="Methods were not available." /></Box>
              <Box><Typography variant="subtitle2">Limitations</Typography><BulletList items={summary.limitations} emptyText="No limitations were reported." /></Box>
              <Box><Typography variant="subtitle2">Implications</Typography><BulletList items={summary.implications} emptyText="No implications were identified." /></Box>
              <Box><Typography variant="subtitle2">Recommendations</Typography><BulletList items={summary.recommendations} emptyText="No recommendations were produced." /></Box>
              <Box><Typography variant="subtitle2">Follow-up questions</Typography><BulletList items={summary.follow_up_questions} emptyText="No follow-up questions were produced." /></Box>
              <Box><Typography variant="subtitle2">Related search terms</Typography><BulletList items={summary.related_search_terms} emptyText="No related search terms were produced." /></Box>
              <Box><Typography variant="subtitle2">Summary warnings</Typography><BulletList items={summary.warnings} emptyText="No summary warnings were reported." /></Box>
            </Stack>
          ) : (
            <Alert severity="info">
              {relevance.recommended_status === "archive" || relevance.recommended_status === "reject"
                ? "This paper was assessed but was not selected for summarization."
                : "This paper was selected, but its summary has not completed."}
            </Alert>
          )}
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters elevation={0}>
        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
          <Typography fontWeight={700}>Relevance assessment</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              <Chip size="small" label={`Topic ${relevance.topic_relevance_score}/10`} />
              <Chip size="small" label={`Novelty ${relevance.novelty_signal_score}/10`} />
              <Chip size="small" label={`Practical value ${relevance.practical_value_score}/10`} />
              <Chip size="small" variant="outlined" label={`Confidence ${relevance.confidence_score}/10`} />
              <Chip size="small" variant="outlined" label={label(relevance.recommended_status)} />
              <Chip size="small" variant="outlined" label={label(relevance.best_digest_placement)} />
            </Stack>
            <TextBlock title="Rationale">{relevance.rationale}</TextBlock>
            <TextBlock title="Audience value">{relevance.potential_value_for_audience}</TextBlock>
            <Box><Typography variant="subtitle2">Criteria</Typography><BulletList items={relevance.criteria} /></Box>
            <Box><Typography variant="subtitle2">Evidence used</Typography><BulletList items={relevance.evidence_used} /></Box>
            <Box><Typography variant="subtitle2">Caveats</Typography><BulletList items={relevance.caveats} emptyText="No caveats were reported." /></Box>
            <Box><Typography variant="subtitle2">Next steps</Typography><BulletList items={relevance.next_step_recommendations} emptyText="No next steps were recommended." /></Box>
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters elevation={0}>
        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
          <Typography fontWeight={700}>Discovery and source details</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              <Chip size="small" label={result.paper.source_name} />
              <Chip size="small" variant="outlined" label={label(search.access_status)} />
              <Chip size="small" variant="outlined" label={search.full_text_available ? "Full text available" : "Full text unavailable"} />
            </Stack>
            <TextBlock title="External ID">{result.paper.external_id}</TextBlock>
            <TextBlock title="Published">{result.paper.published_date ?? "Unknown"}</TextBlock>
            <TextBlock title="Updated">{search.updated_date ?? "Unknown"}</TextBlock>
            <TextBlock title="Venue or source">{search.venue_or_source ?? "Unknown"}</TextBlock>
            <TextBlock title="DOI">{result.paper.doi ?? "Not available"}</TextBlock>
            <TextBlock title="License">{search.license ?? "Unknown"}</TextBlock>
            <TextBlock title="Discovery reason">{search.discovery_reason}</TextBlock>
            <TextBlock title="Factual note">{search.factual_note}</TextBlock>
            <TextBlock title="Possible duplicate of">{search.possible_duplicate_of ?? "No duplicate identified"}</TextBlock>
            <Box><Typography variant="subtitle2">Matched keywords</Typography><BulletList items={search.matched_keywords} emptyText="No configured keywords were matched." /></Box>
            <Box><Typography variant="subtitle2">Search warnings</Typography><BulletList items={search.warnings} emptyText="No search warnings were reported." /></Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Citations</Typography>
              {search.citations.length === 0 ? <EmptyContent>No citations were returned.</EmptyContent> : (
                <Stack spacing={0.75}>
                  {search.citations.map((citation, index) => {
                    const url = safeExternalUrl(citation.url);
                    return url ? (
                      <Link key={`${citation.url}-${index}`} href={url} target="_blank" rel="noopener noreferrer" underline="hover">
                        {citation.title}
                      </Link>
                    ) : <Typography key={`${citation.title}-${index}`} color="text.secondary">{citation.title}</Typography>;
                  })}
                </Stack>
              )}
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
}

export function PaperSummariesResult({ run }: { run: DigestRunDetail }) {
  return (
    <Stack spacing={2}>
      <Section title="Search coverage">
        {run.search_data ? (
          <Stack spacing={2}>
            <TextBlock title="Queries">{run.search_data.queries.length > 0 ? run.search_data.queries.join(" · ") : "No queries were recorded."}</TextBlock>
            <TextBlock title="Sources">{run.search_data.sources_used.length > 0 ? run.search_data.sources_used.join(", ") : "No sources were recorded."}</TextBlock>
            <Box><Typography variant="subtitle2">Coverage notes</Typography><BulletList items={run.search_data.coverage_notes} emptyText="No coverage notes were reported." /></Box>
            <Box><Typography variant="subtitle2">Deduplication notes</Typography><BulletList items={run.search_data.deduplication_notes} emptyText="No deduplication issues were reported." /></Box>
            <Box><Typography variant="subtitle2">Search next steps</Typography><BulletList items={run.search_data.next_step_recommendations} emptyText="No search next steps were recommended." /></Box>
          </Stack>
        ) : <EmptyContent>No search-stage data was produced.</EmptyContent>}
      </Section>

      <Section title="Relevance methodology">
        {run.relevance_data ? (
          <Stack spacing={2}>
            <Typography color="text.secondary">{run.relevance_data.methodology}</Typography>
            <Box><Typography variant="subtitle2">Overall recommendations</Typography><BulletList items={run.relevance_data.recommendations} emptyText="No overall recommendations were produced." /></Box>
            <Box><Typography variant="subtitle2">Quality warnings</Typography><BulletList items={run.relevance_data.quality_warnings} emptyText="No relevance-quality warnings were reported." /></Box>
          </Stack>
        ) : <EmptyContent>No relevance-stage data was produced.</EmptyContent>}
      </Section>

      {run.paper_results.length === 0 ? (
        <Alert severity="info">No qualifying papers were returned for this run.</Alert>
      ) : run.paper_results.map((result) => <PaperResult key={result.paper.id} result={result} />)}
    </Stack>
  );
}
