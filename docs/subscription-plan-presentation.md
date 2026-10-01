# Subscription Plans presentation

This frontend-only increment applies to the shared public, workspace and
registration plan-selection page. It does not change published catalogue data,
Stripe configuration, checkout eligibility, entitlement rules or saved revisions.

## Comparison layout

Cards retain catalogue order, names and complete descriptions. Each card contains
five sections: heading/current-plan badge, description, price, feature definition
list, and action. CSS row subgrids align these sections within each grid row without
fixed heights or truncation. A regular grid fallback keeps cards equal-height and
actions bottom-aligned in browsers without subgrid support. The existing fluid
page shell, responsive auto-fit columns and Monthly/Yearly tabs remain in place.

Feature rows display saved digests, papers per run, monthly paper and run totals,
manual runs within that total, scheduling frequencies and email delivery. Missing
scheduling/email are stated explicitly. Scheduling does not imply additional runs.

## Prices and existing billing flow

`planPresentation.ts` formats the actual monthly or yearly charge. In the Yearly
view, a secondary approximate monthly equivalent is rounded to the currency's
minor unit and explicitly labelled as billed yearly. A sub-cent equivalent is
omitted. Savings are displayed as an amount, not a rounded-up percentage, only
when the yearly charge is less than twelve monthly charges for that plan.
Comparisons use integer minor units for the supported EUR/USD/GBP/PLN currencies.
Free plans never show savings or a yearly equivalent; missing yearly prices say
“Yearly billing not available”, not zero. Invalid display data does not invent a
price. All purchase checks remain server-controlled.

The actual checkout amount/confirmation, `monthly`/`annual` API values, pinned
selection/revision, Free registration, sign-in, resume, management, and error
recovery paths are unchanged. Current-plan detection uses the existing helper.
No “most popular” badges, fabricated audience labels, hardcoded plan prices,
trial claims or catalogue mutations are introduced.

Routine explanation is ordinary text. Sandbox warnings, actionable billing
restrictions and load/action errors stay prominent. Monthly resets, non-rollover,
renewal/upgrade timing and purchased-revision details are available in a native,
keyboard-operable “How billing and plan changes work” disclosure.

## Verification

Run `node --test tests/*.test.mjs` and `npm run build` from `frontend`.
`plan-presentation.test.mjs` covers helper arithmetic/localization, Free and
unavailable prices, structural alignment, complete catalogue copy, semantic rows,
registration/subscriber states, snapshots, errors and duplicate-confirmation gates.
Its component tests use React/MUI doubles; they are not browser layout tests.

Before production, review 320/375/768/1200/1440/1920px widths and browser zoom.
Compare card price/action alignment with long names/descriptions and with/without
yearly pricing. Test tabs, the disclosure and radio selection by keyboard. Use
sandbox for any payment-flow acceptance; this increment needs no live payment.
