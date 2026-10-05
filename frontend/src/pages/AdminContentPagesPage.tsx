import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { AdminPageHeading } from "../components/AdminSupport";
import { aboutDefaultContent } from "./AboutPage";
import { legalDefaultContent } from "./LegalPage";
import {
  loadAdminContent,
  publishAdminContent,
  type PublicContentRevision,
  type PublicContentSlug,
} from "../content/publicContent";

type Draft = {
  revision: number;
  title: string;
  body: string;
  changeNote: string;
  loaded: boolean;
  savedTitle: string;
  savedBody: string;
  metadata: PublicContentRevision | null;
};

const slugs: PublicContentSlug[] = ["about", "privacy", "terms"];
const labels: Record<PublicContentSlug, string> = {
  about: "About",
  privacy: "Privacy",
  terms: "Terms",
};
const publicPaths: Record<PublicContentSlug, string> = {
  about: "/about",
  privacy: "/privacy",
  terms: "/terms",
};

function fallback(slug: PublicContentSlug) {
  return slug === "about" ? aboutDefaultContent : legalDefaultContent(slug);
}

function emptyDraft(slug: PublicContentSlug): Draft {
  const value = fallback(slug);
  return {
    revision: 0,
    title: value.title,
    body: value.body_markdown,
    changeNote: "",
    loaded: false,
    savedTitle: value.title,
    savedBody: value.body_markdown,
    metadata: null,
  };
}

export function AdminContentPagesPage() {
  const [active, setActive] = useState<PublicContentSlug>("about");
  const [drafts, setDrafts] = useState<Record<PublicContentSlug, Draft>>(() => ({
    about: emptyDraft("about"),
    privacy: emptyDraft("privacy"),
    terms: emptyDraft("terms"),
  }));
  const [loading, setLoading] = useState<PublicContentSlug | null>("about");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ severity: "success" | "error"; message: string } | null>(null);
  const draft = drafts[active];
  const dirty = draft.title !== draft.savedTitle || draft.body !== draft.savedBody || Boolean(draft.changeNote.trim());

  const dirtyPages = useMemo(
    () => slugs.filter((slug) => {
      const value = drafts[slug];
      return value.title !== value.savedTitle || value.body !== value.savedBody || Boolean(value.changeNote.trim());
    }),
    [drafts],
  );

  useEffect(() => {
    if (drafts[active].loaded) {
      setLoading(null);
      return;
    }
    const controller = new AbortController();
    setLoading(active);
    setNotice(null);
    loadAdminContent(active, controller.signal).then((value) => {
      setDrafts((current) => {
        const previous = current[active];
        const source = value ?? null;
        const builtIn = fallback(active);
        const title = source?.title ?? builtIn.title;
        const body = source?.body_markdown ?? builtIn.body_markdown;
        return {
          ...current,
          [active]: {
            ...previous,
            revision: source?.revision ?? 0,
            title,
            body,
            savedTitle: title,
            savedBody: body,
            metadata: source,
            loaded: true,
          },
        };
      });
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice({ severity: "error", message: error instanceof Error ? error.message : "Could not load this page." });
    }).finally(() => setLoading((slug) => slug === active ? null : slug));
    return () => controller.abort();
  }, [active, drafts]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyPages.length) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyPages.length]);

  function update(changes: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [active]: { ...current[active], ...changes } }));
    setNotice(null);
  }

  async function save() {
    if (!draft.title.trim() || !draft.body.trim() || !draft.changeNote.trim()) {
      setNotice({ severity: "error", message: "Title, content, and change note are required." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const saved = await publishAdminContent(active, {
        expected_revision: draft.revision,
        title: draft.title.trim(),
        body_markdown: draft.body.trim(),
        change_note: draft.changeNote.trim(),
      });
      setDrafts((current) => ({
        ...current,
        [active]: {
          revision: saved.revision,
          title: saved.title,
          body: saved.body_markdown,
          changeNote: "",
          loaded: true,
          savedTitle: saved.title,
          savedBody: saved.body_markdown,
          metadata: saved,
        },
      }));
      setNotice({ severity: "success", message: `${labels[active]} published as revision ${saved.revision}. The public page now uses this content.` });
    } catch (error) {
      const message = error instanceof ApiError && error.status === 409
        ? "This page changed after you opened it. Copy any unsaved text you need, then reload before publishing."
        : error instanceof Error ? error.message : "Could not publish this page.";
      setNotice({ severity: "error", message });
    } finally {
      setSaving(false);
    }
  }

  function discardAndReload() {
    setDrafts((current) => ({ ...current, [active]: { ...emptyDraft(active), loaded: false } }));
    setLoading(active);
    setNotice(null);
  }

  return <Box>
    <AppHeader />
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
      <AdminPageHeading
        title="Site content"
        icon={<ArticleRoundedIcon color="primary" />}
        description="Edit the public About, Privacy, and Terms pages. Publishing creates an immutable revision and updates the public page immediately; no application redeploy is needed."
      />

      <Alert severity="warning" sx={{ mb: 3 }}>
        Privacy and Terms are legal documents. Publish only reviewed wording. Saved revisions are retained for audit, but this screen does not replace legal approval or customer-notification requirements.
      </Alert>

      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        <Tabs value={active} onChange={(_, value: PublicContentSlug) => setActive(value)}
          aria-label="Public content pages" variant="scrollable" allowScrollButtonsMobile>
          {slugs.map((slug) => <Tab key={slug} value={slug}
            label={dirtyPages.includes(slug) ? `${labels[slug]} *` : labels[slug]} />)}
        </Tabs>
        <Divider />
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          {loading === active && !draft.loaded ? (
            <Box role="status" aria-label={`Loading ${labels[active]} content`}
              sx={{ py: 8, display: "grid", placeItems: "center" }}>
              <CircularProgress size={34} />
            </Box>
          ) : (
            <Stack spacing={2.5}>
              {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.message}</Alert>}

              <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}
                justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }}>
                <Box>
                  <Typography fontWeight={750}>
                    {draft.revision ? `Published revision ${draft.revision}` : "Using built-in deployed content"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {draft.metadata
                      ? `Last published by ${draft.metadata.created_by_name} on ${new Date(draft.metadata.created_at).toLocaleString()}.`
                      : "The first publish stores the current text as revision 1."}
                  </Typography>
                </Box>
                <Button component={Link} to={publicPaths[active]} target="_blank" rel="noreferrer"
                  endIcon={<OpenInNewRoundedIcon />}>Open public page</Button>
              </Stack>

              <TextField label="Page title" value={draft.title}
                onChange={(event) => update({ title: event.target.value })}
                inputProps={{ maxLength: 160 }} required fullWidth />

              <Box>
                <TextField
                  label="Page content"
                  value={draft.body}
                  onChange={(event) => update({ body: event.target.value })}
                  multiline
                  minRows={20}
                  required
                  fullWidth
                  inputProps={{ maxLength: 60000 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Basic formatting: <strong>## Heading</strong>, <strong>### Subheading</strong>, <strong>- list item</strong>,
                  <strong> 1. numbered item</strong>, <strong>**bold**</strong>, <strong>&gt; note</strong>, and
                  <strong> [link text](https://example.com)</strong>. Raw HTML is displayed as text and never executed.
                </Typography>
              </Box>

              <TextField label="Change note" value={draft.changeNote}
                onChange={(event) => update({ changeNote: event.target.value })}
                helperText="Required for the revision history; describe why the public wording changed."
                inputProps={{ maxLength: 500 }} required fullWidth />

              <Stack direction="row" gap={1.5} useFlexGap flexWrap="wrap">
                <Button variant="contained" disabled={!dirty || saving} onClick={() => void save()}>
                  {saving ? "Publishing…" : "Save & publish"}
                </Button>
                <Button disabled={!dirty || saving} onClick={discardAndReload}>Discard & reload</Button>
              </Stack>
            </Stack>
          )}
        </Box>
      </Paper>
    </Container>
  </Box>;
}
