# Frontend validation

## Automated checks

- `npm run typecheck`: strict TypeScript compilation.
- `npm run build`: TypeScript plus production Vite build.
- `npm test`: 14 workflow/component integration tests with Vitest and Testing Library, including real UI batch polling and checklist save/activation.
- `npm audit`: dependency audit; test runner upgraded after the initial install, with no remaining advisories at validation time.
- Local Vite server responds HTTP 200.

Tests cover operator data isolation and OKK-only mutations, import deduplication, batch completion, duplicate/stale appeal prevention, original score preservation, accepted N/A and rejected decisions, allowed numeric/N/A values, immutable checklist snapshots, missing totals for new templates, exact evidence targeting inside collapsed context, raw/formatted timestamps, redaction chips, audio seeking/refresh/fallback, unsafe media URLs, and the complete role-switching appeal-to-decision interaction.

## Verification limits

Browser visual inspection was attempted using the available Computer Use tool. The browser access host was unavailable. The native Chrome fallback could not capture the minimized window. Therefore desktop/mobile appearance has **not** been visually verified; the responsive CSS and component behavior are implemented but require a manual browser pass.

Java integration, real audio playback, CORS/range requests, live scoring, concurrent decisions, real evaluation failures and production authorization have not been exercised. The contract is proposed only. Demo role controls are not an authentication system.

## Manual acceptance checklist

1. At desktop and mobile widths, verify the list, review columns/stack, header role controls, checklist forms and Russian/Kazakh text. Tables should scroll horizontally without stretching the page.
2. Import `DEV`; verify repeat import skips duplicates. Import `FAIL` and recover with another groupId. Run selected/all-filtered evaluation and check progress/disabled actions.
3. Select a system/bot/client evidence message; verify exact highlight and auto-expansion. In live mode verify offset seeking, active-message highlight, expiry refresh and external fallback.
4. Appeal one criterion as its assigned operator. Check another operator cannot access it. Accept/reject as OKK; verify original/decision/final separation and duplicate-submit prevention.
5. Edit boolean/scale/flag criteria, N/A conditions, codes, weights and order. Save and activate a version; old evaluated snapshots must remain unchanged until reevaluation.
6. Confirm loading, empty, failure/retry, null-score and pending states with backend fixtures; inspect behavior when polling reaches its limit. Verify a failed save keeps form text.
7. Confirm all demo assignments/scores are labeled; no real customer data or organizer access credentials belong in the frontend.
