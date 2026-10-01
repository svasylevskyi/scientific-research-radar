import { Box, Tab, Tabs } from "@mui/material";
import { useId, type PropsWithChildren } from "react";

// Presentation labels must not change the existing billing API values.
const intervals = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Yearly" },
] as const;
export type BillingInterval = (typeof intervals)[number]["value"];

type Props = PropsWithChildren<{
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
}>;

export function BillingIntervalTabs({ value, onChange, children }: Props) {
  const id = useId();
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ my: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={value}
          onChange={(_, next: BillingInterval) => onChange(next)}
          aria-label="Billing interval"
          selectionFollowsFocus
          variant="fullWidth"
          sx={{ width: { xs: "100%", sm: 320 }, maxWidth: "100%" }}
        >
          {intervals.map((option) => (
            <Tab
              key={option.value}
              value={option.value}
              label={option.label}
              id={`${id}-tab-${option.value}`}
              aria-controls={`${id}-panel-${option.value}`}
              sx={{ minHeight: 48, "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}
            />
          ))}
        </Tabs>
      </Box>
      {intervals.map((option) => (
        <Box
          key={option.value}
          role="tabpanel"
          id={`${id}-panel-${option.value}`}
          aria-labelledby={`${id}-tab-${option.value}`}
          hidden={value !== option.value}
          tabIndex={0}
          sx={{ minWidth: 0, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
        >
          {value === option.value ? children : null}
        </Box>
      ))}
    </Box>
  );
}
