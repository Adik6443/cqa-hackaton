# Freedom Broker CQA frontend

React + TypeScript + Vite + Tailwind CSS, React Router and Lucide. Russian UI with synthetic RU/KZ/EN conversation fixtures. No backend changes or external organizer calls.

```powershell
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Requirements: Node 22.12+ (validated with Node 26) and npm. The lockfile pins installed versions. Run `npm run typecheck`, `npm test`, and `npm run build` for validation. `npm run preview` serves the production build locally.

Mock mode is enabled unless `VITE_USE_MOCKS=false`. Copy `.env.example` to `.env.local` only if changing configuration. Do not disable mocks until the API proposal is approved. Do not add API keys, customer data, recordings or signed URLs to this project.

## Demo walkthrough

1. Start as **Контроль качества · ОКК**. Import `DEV`, select new conversations and run a batch. `FAIL` is a deliberate import error case; retry with another groupId. Import `BATCH_FAIL` to exercise failed batch items and then retry individual evaluations. `demo-006` starts with a retryable simulated evaluation failure.
2. Open `demo-001`. Click evidence **#2** under identification: the collapsed pre-operator context opens and the exact message is highlighted.
3. Switch the header to **Оператор**, Айгерим. Appeal **Идентификация клиента**, enter a reason, and propose **N/A**.
4. Switch to **ОКК**. Review the appeal in the same page or via the queue. Accept N/A with a reason and leave “Это ошибка AI” checked. Original 70.00 remains visible; the authored demo outcome is 87.50. Other changes intentionally show no invented total.
5. Open **Ошибки AI** and toggle the resulting example. This demonstrates example management, not actual model learning.
6. Open **Чек-листы**. Edit criteria/scale steps, maintain a weight sum of 100, save a new version and apply it. Select conversations for reevaluation. New-template mock scores are null because scoring belongs to Java.
7. `demo-003` is a synthetic voice conversation; mock mode explains that no real audio is available. Live mode supports backend stream URLs, expiry/failure refresh, timestamp seeking and an external-player link.

The in-memory demo resets on hard reload and has no persistence. Dashboard score distributions and operator ratings are labeled fixed demo fixtures, separate from the current conversation list. Open counts and list statuses reflect in-memory workflow state. For accepted decisions outside the authored N/A case, final totals await a backend implementation.

## Handoff

- [Architecture](docs/FRONTEND_ARCHITECTURE.md)
- [API proposal and unresolved decisions](docs/API_CONTRACT_PROPOSAL.md)
- [Validation and limits](docs/VALIDATION.md)

Framework wiring follows the official [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite) and [React Router declarative setup](https://reactrouter.com/start/declarative/installation). A host serving the built SPA must rewrite application paths to `index.html`.
