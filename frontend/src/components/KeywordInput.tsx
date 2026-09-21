import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Autocomplete, Button, Chip, Stack, TextField } from "@mui/material";
import { useRef, useState } from "react";

interface KeywordInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  helperText: string;
  error?: boolean;
}

export function KeywordInput({
  label,
  value,
  onChange,
  helperText,
  error = false,
}: KeywordInputProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function updateKeywords(keywords: string[]) {
    const normalized = keywords
      .map((keyword) => keyword.trim())
      .filter((keyword, index, all) => keyword && all.indexOf(keyword) === index);
    onChange(normalized);
  }

  function addKeyword() {
    if (!inputValue.trim()) return;
    updateKeywords([...value, inputValue]);
    setInputValue("");
    inputRef.current?.focus();
  }

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <Autocomplete
        sx={{ flex: 1, minWidth: 0 }}
        multiple
        freeSolo
        options={[]}
        value={value}
        inputValue={inputValue}
        onInputChange={(_event, nextInput) => setInputValue(nextInput)}
        onChange={(_event, nextValue) => updateKeywords(nextValue)}
        renderTags={(keywords, getTagProps) =>
          keywords.map((keyword, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            return <Chip key={key} label={keyword} size="small" {...tagProps} />;
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            inputRef={inputRef}
            label={label}
            error={error}
            helperText={error ? helperText : `${helperText} Tap Add or press Enter.`}
            placeholder={value.length === 0 ? "Type a keyword" : undefined}
            slotProps={{ htmlInput: { ...params.inputProps, maxLength: 48 } }}
          />
        )}
      />
      <Button
        type="button"
        variant="outlined"
        startIcon={<AddRoundedIcon />}
        aria-label={`Add to ${label.toLowerCase()}`}
        disabled={!inputValue.trim()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={addKeyword}
        sx={{ minHeight: 56, flexShrink: 0 }}
      >
        Add
      </Button>
    </Stack>
  );
}
