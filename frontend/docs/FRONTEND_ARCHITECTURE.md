# Freedom Broker CQA frontend architecture

## Inspection and source of truth

The starting repository contained only the previous proposal in `frontend/`; there were no components, dependencies, or application code to preserve. `docs/BACKEND_SPEC.md` and `docs/API_CONTRACT.md` were absent. The supplied specification was read from **`docs/BACKEND_SPEC.docx`**, dated 7 November 2026. All changes are confined to `frontend/`; the source specification and backend were not modified.

The implementation uses React, TypeScript, Vite, Tailwind CSS, React Router and Lucide. Mock mode is the default. The backend document explicitly calls its API list a draft: implemented DTOs and HTTP mappings are **proposals awaiting teammate approval**, not an agreed contract. See [API_CONTRACT_PROPOSAL.md](API_CONTRACT_PROPOSAL.md).

## Changes from the first architecture

| Previous assumption                                     | Synchronized implementation                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication/session and role guards to be determined | No authentication for the hackathon. Header selects Operator or OKK plus a fictional operator identity. Demo role filtering is not security.            |
| Separate evaluation GET endpoint                        | Conversation detail includes latest evaluation, transcript and criterion snapshots. Single evaluation is a POST; detail is polled while PENDING.        |
| PUT updates a checklist                                 | POST creates a new immutable version; activation is a separate POST. Existing evaluations keep their snapshots.                                         |
| Conversation-wide appeal                                | Appeal belongs to a criterion-result ID, one OPEN appeal per result.                                                                                    |
| `/appeals/{id}/decisions`                               | Draft specification uses singular `/appeals/{id}/decision`.                                                                                             |
| `/api/dashboard`                                        | Draft specification uses `/api/analytics/summary`.                                                                                                      |
| Generic transcript IDs                                  | Evidence uses exact message sequence numbers, `id="msg-{seq}"`, backend offsets and raw/formatted timestamp fields.                                     |
| Import and audio out of scope pending clarification     | groupId import, single/batch evaluation, audio refresh and external-player fallback are included.                                                       |
| api.js and organizer JSON suggested by backend document | User requirements take precedence: TypeScript DTOs/client and newly authored synthetic fixtures only. No organizer URL, key or customer data is copied. |

## Structure

```text
frontend/
  docs/                          architecture, proposed API, validation notes
  src/
    app/                         routes, application shell, demo role/identity context
    pages/                       list, shared review, appeals, checklist, analytics
    features/
      conversations/             transcript, evidence navigation, audio lifecycle
      appeals/                   appeal dialog and reviewer decision panel
    shared/
      api/types.ts               provisional transport DTOs and CqaApi interface
      api/client.ts              centralized HTTP mapping and default mock adapter
      api/validation.ts          allowed answer/template validation; no scoring
      hooks.ts                   async query/action state, bounded polling
      ui.tsx                     accessible status, score, form and state primitives
    mocks/                       synthetic fixtures, in-memory stateful API, workflow tests
    styles/index.css             Tailwind entry, layout and design tokens
    main.tsx
  .env.example                   public configuration only
  package.json / package-lock.json
```

Pages compose domain components. `shared/api/client.ts` is the only HTTP access point. Both mock and live adapters implement `CqaApi`; pages do not depend directly on fixtures. Business calculations belong to Java. The mock adapter has authored scenario values, not a scoring engine.

## Screens and role behavior

| Route                | Operator                                            | Quality Control (OKK)                                                      |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| `/conversations`     | Own assignments, scores and filters                 | All conversations, groupId import, selection and batch evaluation          |
| `/conversations/:id` | Shared transcript/evaluation UI; appeal a criterion | Same UI; evaluate/re-evaluate, inspect low confidence, decide appeals      |
| `/appeals`           | Own appeals and reviewer responses                  | Queue with status filter and open count in navigation                      |
| `/appeals/:id`       | Resolve authorized appeal to shared review          | Same route links the disputed criterion and its evidence                   |
| `/checklists`        | Redirect to own conversations                       | Edit draft, add/remove/reorder criteria, save version, activate/apply      |
| `/dashboard`         | Redirect to own conversations                       | Quality summary, distribution, weak criteria, errors and appeal statistics |
| `/operators`         | Own rating card plus fictional leaderboard          | Fictional leaderboard and bonus levels                                     |
| `/corrections`       | Redirect to own conversations                       | Inspect accepted corrections and toggle use as examples                    |

The Russian UI supports RU/KZ/EN transcripts with system fonts. List filters are URL-backed; dates and numeric score filters are available alongside channel/language/status/search. Empty/error/loading states, retry actions, keyboard focus, native modal dialog, semantic forms and responsive layouts are included. The checklist has drag reordering and keyboard-accessible up/down buttons.

## Data flow and state

1. The session context contains only demo role, selected operator and a mutation revision. Changing role/identity remounts the page and removes stale privileged content. There are no credentials or login flows.
2. Route parameters and list query parameters feed typed API operations. Query keys include identity and filters. Stale requests cannot update a different query; unmounted query results are ignored. HTTP requests have a 20-second timeout; they are not canceled merely by changing routes.
3. Evaluation detail/list and batch progress poll every two seconds while pending. Polling stops on terminal state/unmount or after 150 attempts, with a visible retry action. Batch progress is page-local; a hard reload resets the entire in-memory demo.
4. Forms keep drafts locally, validate allowed values, prevent double submission and preserve text after a failed request. Successful mutations refresh dependent data through the revision. Template weight validation is not evaluation score calculation.
5. Evaluations contain a checklist snapshot/version, original and final totals, criterion-level original/final values, evidence, confidence and separate reviewer decisions. N/A uses `isNa: true, value: null`; `0` is a valid answer. A null score is displayed as unavailable with the backend/mock explanatory note.
6. Selecting evidence expands pre-operator context, scrolls to the exact message and highlights it; voice evidence seeks to backend `offsetSec`. Bot/client/operator/system messages each retain their sequence and timestamp. The UI displays `timeLabel` verbatim and exposes `timestampRaw` on hover, without deriving time labels.
7. Audio URLs are fetched at runtime and held only in component memory. One automatic refresh is attempted after failure/expiry, then manual retry and the backend-provided external player remain available. No organizer/player URLs or recordings are included in fixtures. Media readiness/seek/fallback behavior is covered by component tests; real playback remains unverified.

## Mock scope and limitations

The demo uses five fictional operators and six synthetic conversations. Import adds three synthetic conversations per new groupId; `FAIL` simulates an import error. Evaluations complete after a short simulated delay. The authored identification-to-N/A scenario changes 70.00 to 87.50 while preserving the original. Other accepted changes and newly edited templates return a null total with a clear explanation; the frontend does not invent a formula. Fixed dashboard/rating values are explicitly separate demo scenarios and do not recalculate after appeals.

Accepted appeals can create/toggle correction examples. The mock does not simulate LLM learning, rank updates or financial bonus calculation. Real backend evaluation history, concurrent conflicts, pagination schemas, media authorization and analytics contracts remain approval items. UI role restrictions are convenience only.

See [VALIDATION.md](VALIDATION.md) for checks and remaining verification limits, and [../README.md](../README.md) for running the project.
