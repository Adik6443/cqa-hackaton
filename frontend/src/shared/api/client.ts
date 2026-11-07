import type { CqaApi, Scope } from './types';
import { createMockApi } from '../../mocks/api';

export const mockMode = import.meta.env.VITE_USE_MOCKS !== 'false';
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
function query(values: object): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.size ? `?${params}` : '';
}
export async function request<T>(
  path: string,
  scope?: Scope,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 20000);
  try {
    const suffix = scope ? query(scope).replace('?', path.includes('?') ? '&' : '?') : '';
    const response = await fetch(`${baseUrl}${path}${suffix}`, {
      method,
      signal: timeout.signal,
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const error: { message?: string; code?: string } = await response.json().catch(() => ({}));
      throw new ApiError(
        error.message || `Запрос не выполнен (${response.status})`,
        response.status,
        error.code,
      );
    }
    if (response.status === 204) return undefined as T;
    // Shapes remain provisional; validate against approved OpenAPI before enabling live mode.
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error('Превышено время ожидания. Повторите запрос.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const key = encodeURIComponent;
const liveApi: CqaApi = {
  operators: () => request('/operators'),
  conversations: (scope, filters = {}) => request(`/conversations${query(filters)}`, scope),
  conversation: (id, scope) => request(`/conversations/${key(id)}`, scope),
  importGroup: (groupId, scope) => request(`/import${query({ groupId })}`, scope, 'POST'),
  evaluate: (id, scope) => request(`/conversations/${key(id)}/evaluate`, scope, 'POST'),
  startBatch: (conversationIds, scope) =>
    request('/evaluations/batch', scope, 'POST', { conversationIds }),
  batch: (id, scope) => request(`/evaluations/batch/${key(id)}`, scope),
  checklists: () => request('/checklists/versions'),
  saveChecklist: (input, scope) => request('/checklists/versions', scope, 'POST', input),
  activateChecklist: (id, scope) =>
    request(`/checklists/versions/${key(id)}/activate`, scope, 'POST'),
  appeals: (scope, status) => request(`/appeals${query({ status })}`, scope),
  createAppeal: (id, input, scope) =>
    request(`/criterion-results/${key(id)}/appeals`, scope, 'POST', input),
  decide: (id, input, scope) => request(`/appeals/${key(id)}/decision`, scope, 'POST', input),
  audio: (id, scope) => request(`/conversations/${key(id)}/audio`, scope),
  analytics: (scope) => request('/analytics/summary', scope),
  leaderboard: (scope) => request('/operators/leaderboard', scope),
  corrections: (scope) => request('/ai-corrections', scope),
  updateCorrection: (id, active, scope) =>
    request(`/ai-corrections/${key(id)}`, scope, 'PATCH', { active }),
};
export const api: CqaApi = mockMode ? createMockApi() : liveApi;
