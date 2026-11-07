# Proposed CQA API contract — teammate approval required

**Status: unapproved.** `docs/API_CONTRACT.md` was absent. The source `docs/BACKEND_SPEC.docx` describes endpoint intent and several fields, but explicitly labels the API a draft. This proposal lives inside `frontend/` to preserve the frontend-only scope. Nothing here asserts that Java already implements these shapes.

## Specified versus proposed

Specified: REST/JSON under `/api`; no authentication; operator filtering by `operatorId`; two demo roles; `NOT_EVALUATED | PENDING | DONE | FAILED`; `OPEN | REJECTED | ACCEPTED`; numeric `value`, `isNa`, `points`, `maxPoints`; versioned checklists; evidence sequences; `timestampRaw`, `offsetSec`, `timeLabel`, `operatorStartSeq`; batch done/total/failed; audio `streamUrl`/`expiresAt`; original AI result retained.

Proposed additions: string IDs throughout; `role=OKK|OPERATOR` query parameter; `CHAT|VOICE` and `BOOLEAN|SCALE|FLAG` enums; zero-based pagination; full nested response DTOs; criterion snapshots; HTTP success/error status codes; active version handling; media fallback placement; dashboard/rating payloads. **These require agreement before live mode.**

The exact provisional DTO definitions are [types.ts](../src/shared/api/types.ts). The centralized path mapping is [client.ts](../src/shared/api/client.ts); both the HTTP and mock adapters implement `CqaApi`.

## Proposed requests and responses

All paths below are relative to `/api`. For operations with a scope, the current client appends `role` and, for Operator only, `operatorId`. These fields are demo identity hints, not authorization credentials. Array responses are plain arrays except the paginated conversation list.

| Method and path                           | Request                                                                   | Success response                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /operators`                          | none                                                                      | `Operator[]` with id/name/fictional                                                                                                             |
| `POST /import?groupId=DEV`                | no body; OKK scope                                                        | `200 ImportResult { imported, skipped, groupId }`                                                                                               |
| `GET /conversations`                      | scope; search/status/channel/language/from/to/minScore/maxScore/page/size | `Page<ConversationSummary> { items, total, page, size }`                                                                                        |
| `GET /conversations/{id}`                 | scope                                                                     | `Conversation`, including messages and latest nullable evaluation                                                                               |
| `POST /conversations/{id}/evaluate`       | no body; OKK scope                                                        | `204`; subsequent detail shows PENDING then DONE/FAILED                                                                                         |
| `POST /evaluations/batch`                 | `{ conversationIds: string[] }`; OKK scope                                | `202 Batch` containing id/status/done/total/failed/errors                                                                                       |
| `GET /evaluations/batch/{batchId}`        | OKK scope                                                                 | `Batch`; poll every two seconds                                                                                                                 |
| `GET /checklists/versions`                | none                                                                      | `Checklist[]`, **including full criteria**, not summaries                                                                                       |
| `GET /checklists/active`                  | none                                                                      | specified in source, not needed by current client if versions contain full detail                                                               |
| `POST /checklists/versions`               | `{ name, criteria: Criterion[] }`; OKK scope                              | `201 Checklist`, new inactive immutable version                                                                                                 |
| `POST /checklists/versions/{id}/activate` | no body; OKK scope                                                        | `204`; exactly one active version                                                                                                               |
| `POST /criterion-results/{id}/appeals`    | `{ comment, desired: Answer                                               | null }`; Operator scope                                                                                                                         | `201 Appeal`            |
| `GET /appeals`                            | scope and optional status                                                 | `Appeal[]` including comment/desired/original/corrected/reviewer reason                                                                         |
| `GET /appeals/{id}`                       | source specifies this operation                                           | current prototype resolves an appeal from the list and opens shared conversation review; use detail endpoint when list DTO/pagination is agreed |
| `POST /appeals/{id}/decision`             | `DecisionInput`; OKK scope                                                | `200 Appeal`; frontend then refetches conversation for totals                                                                                   |
| `GET /conversations/{id}/audio`           | scope                                                                     | `AudioSource { streamUrl: string                                                                                                                | null, expiresAt: string | null, audioPageUrl: string | null }` |
| `GET /analytics/summary`                  | OKK scope                                                                 | `Analytics` with backend-calculated values                                                                                                      |
| `GET /operators/leaderboard`              | scope                                                                     | `Rating[]`, currently including own detail/trend/bonus fields                                                                                   |
| `GET /operators/{id}/rating?from=&to=`    | source specifies this operation                                           | integration deferred until separate rating DTO is agreed; prototype uses full leaderboard fixture                                               |
| `GET /ai-corrections`                     | OKK scope                                                                 | `Correction[]`                                                                                                                                  |
| `PATCH /ai-corrections/{id}`              | `{ active: boolean }`; OKK scope                                          | `204`                                                                                                                                           |

### Value/evidence conventions

```ts
type Answer = { value: number | null; isNa: boolean };
// Yes: { value: 1, isNa: false }; No: { value: 0, isNa: false }
// N/A: { value: null, isNa: true }, allowed only by criterion.allowNa
// Scale: value must equal one of criterion.steps[].value (decimals supported)
type Evidence = { messageSeq: number; offsetSec: number | null };
type DecisionInput = {
  status: 'ACCEPTED' | 'REJECTED';
  reason: string;
  newValue: Answer | null; // mandatory for ACCEPTED, null for REJECTED
  addToExamples: boolean;
};
```

`CriterionResult` contains its immutable criterion snapshot, `original` and `final` answers/points, explanation, confidence, evidence array and nullable reviewer decision. `Evaluation` separately supplies `originalScore`, `finalScore`, nullable `scoreNote`, section totals, `grossError`, `simulated`, `correctionsUsed`, checklist ID/version and results. Frontend only formats these numbers. Missing totals are null, never zero by substitution. `points` are also nullable for incomplete mock scenarios.

Evidence sequences must be unique within a conversation and must match transcript sequences exactly, including system messages. Ranges such as #6–9 are currently represented as four evidence entries. `operatorStartSeq=null` means no known boundary; the UI leaves messages expanded. Raw timestamps are opaque strings. `timeLabel` and conversation `dateLabel` are displayed verbatim; date filters are submitted as YYYY-MM-DD without frontend timezone conversion.

## Decisions requiring teammate agreement

1. **Pagination and filtering:** page/size envelope, maximum size, date timezone/inclusivity, supported score filters, search semantics and whether sort is needed. Prototype lists use source order. Appeals/operators/corrections currently assume unpaginated arrays.
2. **Identity:** whether `role` should be a query parameter, and stable operator IDs. The frontend initially selects the first demo operator, then uses the returned list. Decide where assignments are stored and whether all responses mark them fictional.
3. **Evaluation history:** detail includes latest evaluation in the source, but the exact shape is unspecified. Agree on criterion snapshots, stable result IDs, histories and final versus original gross-error flags. Prototype retains originals within an evaluation and blocks reevaluation with open appeals; old evaluation history after a new run is not browsable.
4. **Batch behavior:** source says start returns `batchId`, while prototype expects a full `Batch` with `id`. Agree on response shape, failed item details, terminal statuses, partial failure, cancel/retry, selection caps and whether a server-side evaluate-all-by-filter operation is preferable. Current UI gathers eligible IDs across list pages (up to 10,000) and excludes pending/open-appeal items.
5. **Import lifecycle:** synchronous counts versus an asynchronous import job, idempotence/deduplication, legal groupId values, organizer timeouts/rate limits. Demo imports are synchronous and repeat groups are skipped.
6. **Checklist rules:** source asks to show sum 100; prototype enforces 100 before save. Confirm exact requirement, precision, negative/zero weights, N/A for flags, identifier/code preservation, replacing a criterion, section ordering and whether a version name is required. `versions` must return full criteria or needs a version-detail endpoint.
7. **Apply semantics:** prototype activates a saved version and opens conversation selection; evaluation is a separate explicit click. It does not silently reevaluate historical conversations. Confirm whether activation and batch launch should be atomic.
8. **Appeal decisions:** source says decision returns a new total, while prototype returns an `Appeal` then refreshes conversation. Agree on an atomic response containing appeal/evaluation/summary, concurrency versions, repeat decisions, re-appeal after closure and duplicate-open error code. Frontend currently expects only the latest decision per criterion plus appeal records for history.
9. **Errors/concurrency:** proposed JSON `{ code, message, fieldErrors?, requestId? }`; 400/422 validation, 404 missing, 409 stale/conflict/duplicate, 5xx failure. Current UI presents `message` and offers retry; inline mapping of `fieldErrors` awaits a stable schema. No automatic mutation retries.
10. **Audio:** source returns streamUrl/expiresAt but separately names audioPageUrl. Prototype proposes all three from `/audio`. Agree on proxy versus short-lived signed stream, cookie/CORS/range-request behavior, absolute expiry format and fallback availability. URLs must be runtime data, never source fixtures or environment secrets. One automatic refresh avoids infinite failure loops.
11. **Analytics/rating:** definitions, period/date filters, accepted-appeal rate denominator, gross-error consequences, rank eligibility, thresholds and bonus decisions are backend-owned. Source separates leaderboard from own rating; prototype uses a richer shared response only in mocks. Fixed mock metrics do not update scores/ranks after arbitrary edits.
12. **AI corrections:** active field name (`active` versus `isActive`), stable criterion identity across versions, how correctionsUsed is reported, excerpt redaction and filtering by language. Mocks create examples but do not claim that an LLM has learned from them.

## Integration gate

Keep `VITE_USE_MOCKS=true` until Java returns approved payload fixtures/OpenAPI. Reconcile the decisions above, update the DTOs/adapters, add runtime response validation for the agreed schema, and run the same workflow tests against a controlled backend. Set `VITE_API_BASE_URL` to an approved public API origin or configure a development proxy. Tokens/organizer keys are never Vite environment variables; all organizer access belongs to Java.

The demo role selector is not production authorization. A production rollout requires server-enforced identity and permissions outside this hackathon contract.
