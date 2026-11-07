// Types and calls for the Spring Boot backend (backend/README.md, section "API").
// Field names are exactly what the backend returns.

const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export type Role = 'OKK' | 'OPERATOR';
export type EvalStatus = 'NOT_EVALUATED' | 'PENDING' | 'DONE' | 'FAILED';
export type AppealStatus = 'OPEN' | 'REJECTED' | 'ACCEPTED';
export type AnswerType = 'BOOLEAN' | 'SCALE' | 'FLAG';

export interface Operator { id: string; name: string; fictional: boolean; source: string }

export interface ConversationSummary {
  id: string; groupId: string; operatorId: string | null; operatorName: string | null; fictionalAssignment: boolean;
  channel: 'CHAT' | 'VOICE'; language: string; dateRaw: string; dateLabel: string; status: EvalStatus;
  finalScore: number | null; aiScore: number | null; grossError: boolean; openAppeals: number; reviewed: boolean;
  error: string | null; durationSec: number | null; durationLabel: string | null; provider: string | null; model: string | null;
}
export interface Page<T> { items: T[]; total: number; page: number; size: number }

export interface Message { seq: number; role: 'client' | 'operator' | 'bot' | 'system'; text: string; timestampRaw: string; offsetSec: number | null; timeLabel: string }
export interface Step { value: number; label: string }
export interface Criterion {
  id?: string; code: string; title: string; section: string; instruction: string; answerType: AnswerType;
  weight: number; allowNa: boolean; naCondition: string; steps: Step[]; exportId: string;
}
export interface Answer { value: number | null; isNa: boolean }
export interface ResultValue extends Answer { points: number | null; maxPoints: number | null }
export interface Evidence { messageSeq: number; offsetSec: number | null; quote: string | null }
export interface CriterionResult {
  id: string; criterion: Criterion; original: ResultValue; final: ResultValue; confidence: number | null; explanation: string;
  evidence: Evidence[]; decision: { status: 'ACCEPTED' | 'REJECTED'; reason: string; value: Answer | null } | null; openAppealId: string | null;
}
export interface Evaluation {
  id: string; status: 'PENDING' | 'DONE' | 'FAILED'; checklistId: string; checklistVersion: number;
  originalScore: number | null; finalScore: number | null; scoreNote: string | null; grossError: boolean; simulated: boolean;
  correctionsUsed: number; provider: string; model: string; tokensIn: number | null; tokensOut: number | null; error: string | null;
  sections: { title: string; originalScore: number | null; finalScore: number | null }[]; results: CriterionResult[];
}
export interface Conversation extends ConversationSummary {
  operatorStartSeq: number | null; audioPageUrl: string | null; messages: Message[]; evaluation: Evaluation | null;
}
export interface Batch { id: string; status: 'PENDING' | 'DONE' | 'FAILED'; done: number; total: number; failed: number; errors: { conversationId: string; message: string }[] }
export interface Preview { count: number; conversationIds: string[]; skipped: string[] }
export interface ImportResult { imported: number; skipped: number; groupId: string; importRunId: string; businessDate: string }
export interface Checklist { id: string; version: number; name: string; active: boolean; createdAtLabel: string; criteria: Criterion[] }
export interface Appeal {
  id: string; conversationId: string; criterionResultId: string; criterionTitle: string; operatorId: string | null; operatorName: string | null;
  comment: string; desired: Answer | null; status: AppealStatus; createdAtLabel: string; reason: string | null; reviewerName: string | null;
  original: ResultValue; corrected: Answer | null;
}
export interface Analytics {
  averageScore: number | null; evaluated: number; total: number; grossErrors: number; openAppeals: number; acceptedAppealRate: number | null;
  distribution: { label: string; count: number }[]; weakCriteria: { title: string; label: string }[]; simulated: boolean;
}
export interface Group { key: string; label: string; total: number; evaluated: number; avgScore: number | null; grossErrors: number; grossErrorRate: number | null; lowShare: number | null; avgDurationSec: number | null }
export interface CriterionStat { code: string; title: string; flag: boolean; evaluated: number; naCount: number; failCount: number; avgPercent: number | null }
export interface Rating {
  operatorId: string; name: string; rank: number | null; score: number | null; conversations: number; grossErrors: number; level: string;
  bonusLabel: string; pointsToNext: number | null; eligible: boolean; badges: string[]; trend: { label: string; score: number }[]; weakCriteria: string[]; period: string;
}
export interface Provider { provider: string; available: boolean; defaultModel: string }
export interface Route { language: string; provider: string; model: string }
export interface Correction { id: string; criterionCode: string; criterionTitle: string; language: string; originalLabel: string; correctedLabel: string; reason: string; snippet: string; active: boolean; createdAtLabel: string }
export interface ExportReport { path: string | null; written: boolean; count: number; ok: number; errors: number; warnings: string[]; file: unknown }
export interface ImportRun { id: string; groupId: string; businessDate: string; status: string; total: number | null; imported: number | null; skipped: number | null; startedAtLabel: string; error: string | null }
export interface AudioSource { streamUrl: string | null; expiresAt: string | null; audioPageUrl: string | null }

export type Filters = Partial<Record<
  'search' | 'status' | 'channel' | 'language' | 'from' | 'to' | 'scoreBucket' | 'durationBucket' | 'operatorId' | 'grossError' | 'hasOpenAppeal' | 'groupId' | 'model',
  string>>;

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте, что бэкенд запущен (порт 8080).', 0);
  }
  if (!res.ok) {
    const err: { message?: string; code?: string } = await res.json().catch(() => ({}));
    throw new ApiError(err.message || `Ошибка сервера (${res.status})`, res.status, err.code);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const e = encodeURIComponent;

export const api = {
  operators: () => request<Operator[]>('/operators'),
  imports: () => request<ImportRun[]>('/imports'),
  importGroup: (groupId: string, date?: string) => request<ImportResult>(`/import${qs({ groupId, date })}`, 'POST'),

  conversations: (f: Filters, page = 0, size = 50) => request<Page<ConversationSummary>>(`/conversations${qs({ ...f, page, size })}`),
  conversation: (id: string) => request<Conversation>(`/conversations/${e(id)}`),
  audio: (id: string) => request<AudioSource>(`/conversations/${e(id)}/audio`),
  evaluate: (id: string, provider?: string) => request<{ evaluationId: string }>(`/conversations/${e(id)}/evaluate${qs({ provider })}`, 'POST'),

  previewBatch: (filter: Filters, onlyNotEvaluated: boolean) => request<Preview>('/evaluations/batch/preview', 'POST', { filter, onlyNotEvaluated }),
  startBatch: (filter: Filters, onlyNotEvaluated: boolean, provider?: string) =>
    request<Batch>('/evaluations/batch', 'POST', { filter, onlyNotEvaluated, provider: provider || null }),
  batch: (id: string) => request<Batch>(`/evaluations/batch/${e(id)}`),

  checklists: () => request<Checklist[]>('/checklists/versions'),
  saveChecklist: (name: string, criteria: Criterion[]) => request<Checklist>('/checklists/versions', 'POST', { name, criteria }),
  activateChecklist: (id: string) => request<void>(`/checklists/versions/${e(id)}/activate`, 'POST'),

  appeals: (status?: string, operatorId?: string) =>
    request<Appeal[]>(`/appeals${qs({ status, role: operatorId ? 'OPERATOR' : undefined, operatorId })}`),
  createAppeal: (resultId: string, comment: string, desired: Answer | null, operatorId?: string) =>
    request<Appeal>(`/criterion-results/${e(resultId)}/appeals${qs({ operatorId })}`, 'POST', { comment, desired }),
  decide: (id: string, body: { status: 'ACCEPTED' | 'REJECTED'; reason: string; newValue: Answer | null; addToExamples: boolean; reviewerName?: string }) =>
    request<Appeal>(`/appeals/${e(id)}/decision`, 'POST', body),

  summary: (f: Filters) => request<Analytics>(`/analytics/summary${qs(f)}`),
  breakdown: (by: string, f: Filters) => request<Group[]>(`/analytics/breakdown${qs({ by, ...f })}`),
  criteriaStats: (f: Filters) => request<CriterionStat[]>(`/analytics/criteria${qs(f)}`),
  leaderboard: () => request<Rating[]>('/operators/leaderboard'),
  rating: (id: string) => request<Rating>(`/operators/${e(id)}/rating`),

  providers: () => request<Provider[]>('/llm/providers'),
  routes: () => request<Route[]>('/llm/routes'),
  saveRoute: (language: string, provider: string, model: string) => request<Route>(`/llm/routes/${e(language)}`, 'PUT', { provider, model }),
  memo: () => request<{ text: string }>('/llm/memo'),
  saveMemo: (text: string) => request<{ text: string }>('/llm/memo', 'PUT', { text }),

  corrections: () => request<Correction[]>('/ai-corrections'),
  setCorrection: (id: string, active: boolean) => request<void>(`/ai-corrections/${e(id)}`, 'PATCH', { active }),

  exportResults: (groupId: string, set: 'dev' | 'prod', source: 'ai' | 'final', write: boolean, allowSimulated: boolean) =>
    request<ExportReport>(`/results/export${qs({ groupId, set, source, write, allowSimulated })}`, 'POST'),
};
