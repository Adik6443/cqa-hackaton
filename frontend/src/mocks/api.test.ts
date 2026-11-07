import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from './api';
import { checklist } from './fixtures';
import { checklistErrors } from '../shared/api/validation';
import type { Scope } from '../shared/api/types';
const okk: Scope = { role: 'OKK' },
  operator: Scope = { role: 'OPERATOR', operatorId: 'demo-op-1' };
afterEach(() => vi.useRealTimers());

describe('CQA workflow invariants', () => {
  it('scopes operator reads and denies OKK mutations', async () => {
    const api = createMockApi();
    const page = await api.conversations(operator);
    expect(page.items.every((c) => c.operatorId === operator.operatorId)).toBe(true);
    await expect(api.conversation('demo-002', operator)).rejects.toThrow('недоступен');
    await expect(api.importGroup('DEV', operator)).rejects.toThrow('ОКК');
  });
  it('imports once and advances a batch from pending to done', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    expect((await api.importGroup('DEV', okk)).imported).toBe(3);
    expect((await api.importGroup('DEV', okk)).imported).toBe(0);
    const list = await api.conversations(okk, { status: 'NOT_EVALUATED' });
    const batch = await api.startBatch(
      list.items.map((c) => c.id),
      okk,
    );
    expect(batch.status).toBe('PENDING');
    vi.advanceTimersByTime(3000);
    const completed = await api.batch(batch.id, okk);
    expect(completed.done).toBe(batch.total);
    expect(completed.status).toBe('DONE');
  });
  it('rejects duplicate appeals, preserves the original and applies the authored N/A outcome', async () => {
    const api = createMockApi();
    const before = await api.conversation('demo-001', operator);
    const result = before.evaluation!.results[1];
    const appeal = await api.createAppeal(
      result.id,
      {
        comment: 'Общий вопрос, идентификация не требуется.',
        desired: { value: null, isNa: true },
      },
      operator,
    );
    await expect(
      api.createAppeal(result.id, { comment: 'Повтор', desired: null }, operator),
    ).rejects.toThrow('уже есть');
    await expect(api.evaluate(before.id, okk)).rejects.toThrow('апелляции');
    await api.decide(
      appeal.id,
      {
        status: 'ACCEPTED',
        newValue: { value: null, isNa: true },
        reason: 'Общая информация.',
        addToExamples: true,
      },
      okk,
    );
    const after = await api.conversation(before.id, okk);
    expect(after.evaluation!.originalScore).toBe(before.evaluation!.originalScore);
    expect(after.evaluation!.results[1].original).toEqual(result.original);
    expect(after.evaluation!.results[1].final.isNa).toBe(true);
    expect(after.evaluation!.finalScore).toBe(87.5);
    expect(after.openAppeals).toBe(0);
    expect(await api.corrections(okk)).toHaveLength(1);
    await expect(
      api.decide(
        appeal.id,
        { status: 'REJECTED', reason: 'Повтор', newValue: null, addToExamples: false },
        okk,
      ),
    ).rejects.toThrow('уже рассмотрена');
  });
  it('rejects an appeal without changing score or creating an AI correction', async () => {
    const api = createMockApi();
    const before = await api.conversation('demo-001', operator);
    const appeal = await api.createAppeal(
      before.evaluation!.results[0].id,
      { comment: 'Проверить', desired: null },
      operator,
    );
    await api.decide(
      appeal.id,
      { status: 'REJECTED', reason: 'Правило соблюдено.', newValue: null, addToExamples: true },
      okk,
    );
    const after = await api.conversation(before.id, okk);
    expect(after.evaluation!.finalScore).toBe(before.evaluation!.finalScore);
    expect(await api.corrections(okk)).toHaveLength(0);
  });
  it('validates allowed N/A and numeric scale steps', async () => {
    const api = createMockApi();
    const c = await api.conversation('demo-001', operator);
    await expect(
      api.createAppeal(
        c.evaluation!.results[0].id,
        { comment: 'Нет', desired: { value: null, isNa: true } },
        operator,
      ),
    ).rejects.toThrow('Недопустимое');
    await expect(
      api.createAppeal(
        c.evaluation!.results[3].id,
        { comment: 'Нет', desired: { value: 99, isNa: false } },
        operator,
      ),
    ).rejects.toThrow('Недопустимое');
  });
  it('creates immutable versions and never invents a score for a new template', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    const before = await api.conversation('demo-001', okk);
    const draft = structuredClone(checklist);
    draft.criteria[0].title = 'Новое правило';
    const saved = await api.saveChecklist(draft, okk);
    await api.activateChecklist(saved.id, okk);
    expect((await api.conversation(before.id, okk)).evaluation).toEqual(before.evaluation);
    await api.evaluate(before.id, okk);
    vi.advanceTimersByTime(3000);
    const after = await api.conversation(before.id, okk);
    expect(after.evaluation!.checklistVersion).toBe(2);
    expect(after.evaluation!.finalScore).toBeNull();
    expect((await api.checklists())[0].criteria[0].title).toBe('Приветствие');
  });
  it('checks invalid template weights and duplicate scale values', () => {
    const draft = structuredClone(checklist.criteria);
    draft[0].weight = -5;
    draft[3].steps[1].value = 0;
    expect(checklistErrors(draft).length).toBeGreaterThanOrEqual(3);
  });
  it('reports failed batch items and supports single-evaluation retry', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    await api.importGroup('BATCH_FAIL', okk);
    const list = await api.conversations(okk, { search: 'BATCH_FAIL' });
    const id = list.items[0].id;
    const job = await api.startBatch([id], okk);
    vi.advanceTimersByTime(3000);
    const failed = await api.batch(job.id, okk);
    expect(failed.failed).toBe(1);
    expect(failed.status).toBe('FAILED');
    expect(failed.errors[0].conversationId).toBe(id);
    await api.evaluate(id, okk);
    vi.advanceTimersByTime(3000);
    expect((await api.conversation(id, okk)).status).toBe('DONE');
  });
});
