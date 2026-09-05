import { Autocomplete, Chip, TextField } from "@mui/material";

interface KeywordInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  helperText: string;
}

export function KeywordInput({ label, value, onChange, helperText }: KeywordInputProps) {
  return (
    <Autocomplete
      multiple
      freeSolo
      options={[]}
      value={value}
      onChange={(_event, nextValue) => {
        const normalized = nextValue
          .map((keyword) => keyword.trim())
          .filter((keyword, index, keywords) => keyword && keywords.indexOf(keyword) === index);
        onChange(normalized);
      }}
      renderTags={(keywords, getTagProps) =>
        keywords.map((keyword, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return <Chip key={key} label={keyword} size="small" {...tagProps} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          helperText={helperText}
          placeholder={value.length === 0 ? "Type and press Enter" : undefined}
          slotProps={{ htmlInput: { ...params.inputProps, maxLength: 48 } }}
        />
      )}
    />
  );
}
