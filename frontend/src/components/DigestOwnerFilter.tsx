import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { Autocomplete, Box, Button, CircularProgress, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { adminApi } from "../api/admin";
import type { User } from "../types/auth";

type OwnerOption = { kind: "user"; user: Pick<User, "id" | "full_name" | "email"> } | { kind: "query"; query: string };
const label = (option: OwnerOption | string) => typeof option === "string" ? option
  : option.kind === "query" ? option.query : option.user.full_name || option.user.email;

export function DigestOwnerFilter({ ownerId, query, onChange }: {
  ownerId: string; query: string; onChange: (filter: { ownerId?: string; query?: string }) => void;
}) {
  const [input, setInput] = useState(query);
  const [selected, setSelected] = useState<OwnerOption | null>(query ? { kind: "query", query }
    : ownerId ? { kind: "user", user: { id: ownerId, full_name: "Selected owner", email: "" } } : null);
  const [matches, setMatches] = useState<OwnerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const edited = useRef(false);
  const term = input.trim().slice(0, 120);

  useEffect(() => {
    if (!ownerId) return;
    const controller = new AbortController();
    adminApi.getUser(ownerId, controller.signal).then(user => {
      if (controller.signal.aborted) return;
      setSelected({ kind: "user", user });
      if (!edited.current) setInput(label({ kind: "user", user }));
    }).catch(() => {
      if (!controller.signal.aborted && !edited.current) setInput("Selected owner");
    });
    return () => controller.abort();
  }, [ownerId]);

  useEffect(() => {
    setMatches([]); setError("");
    if (!open || term.length < 3 || (selected?.kind === "user" && input === label(selected))) {
      setLoading(false); return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      adminApi.listUsers({ offset: 0, limit: 5, query: term, sort: "name", signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setMatches(result.items.map(user => ({ kind: "user", user }))); })
        .catch(() => { if (!controller.signal.aborted) setError("Suggestions unavailable. Press Enter to search all matching owners."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [input, open, selected, term]);

  const options: OwnerOption[] = term.length >= 3 ? [...matches, { kind: "query", query: term }] : [];
  const search = () => { setOpen(false); setInput(term); setSelected(term ? { kind: "query", query: term } : null); onChange(term ? { query: term } : {}); };
  return <Stack direction="row" spacing={1} sx={{ width: { xs: "100%", sm: 420 }, maxWidth: "100%", alignItems: "flex-start" }}>
    <Autocomplete<OwnerOption, false, false, true>
    freeSolo selectOnFocus clearOnBlur={false} open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}
    value={selected} inputValue={input} options={options} loading={loading} filterOptions={values => values}
    getOptionLabel={label} getOptionKey={option => typeof option === "string" ? `text:${option}`
      : option.kind === "user" ? option.user.id : `query:${option.query}`}
    isOptionEqualToValue={(option, value) => option.kind === value.kind && (option.kind === "user" && value.kind === "user"
      ? option.user.id === value.user.id : option.kind === "query" && value.kind === "query" && option.query === value.query)}
    onInputChange={(_, value, reason) => {
      if (reason === "input" || reason === "clear") { edited.current = true; setInput(value); }
    }}
    onChange={(_, value) => {
      setOpen(false);
      if (value === null) { setInput(""); setSelected(null); onChange({}); }
      else if (typeof value === "string" || value.kind === "query") {
        const query = (typeof value === "string" ? value : value.query).trim().slice(0, 120);
        setInput(query); onChange(query ? { query } : {});
      } else { setInput(label(value)); onChange({ ownerId: value.user.id }); }
    }}
    renderOption={(props, option) => {
      const { key, ...attributes } = props;
      return <Box component="li" key={key} {...attributes} sx={{ display: "block !important", overflowWrap: "anywhere",
        ...(option.kind === "query" ? { borderTop: 1, borderColor: "divider" } : {}) }}>
        {option.kind === "user" ? <><Typography>{option.user.full_name}</Typography>
          <Typography variant="body2" color="text.secondary">{option.user.email}</Typography></>
          : <Typography>Search all owners matching “{option.query}”</Typography>}
      </Box>;
    }}
    renderInput={params => <TextField {...params} size="small" placeholder="Digest owner"
      helperText={error || "Search name or email"}
      slotProps={{ htmlInput: { ...params.inputProps, "aria-label": "Digest owner", maxLength: 120 }, input: { ...params.InputProps,
        startAdornment: <><InputAdornment position="start"><SearchRoundedIcon /></InputAdornment>{params.InputProps.startAdornment}</>,
        endAdornment: <>{loading && <CircularProgress size={16} aria-label="Loading owner suggestions" />}{params.InputProps.endAdornment}</> } }} />}
    sx={{ flex: 1, minWidth: 0 }}
  />
    <Button variant="contained" onClick={search} sx={{ minHeight: 40 }}>Search</Button>
  </Stack>;
}
