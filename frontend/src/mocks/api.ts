import type {
  Appeal,
  Batch,
  Checklist,
  Conversation,
  Correction,
  CqaApi,
  Scope,
} from '../shared/api/types';
import { checklistErrors, validAnswer } from '../shared/api/validation';
import {
  checklist,
  makeConversation,
  operators,
  ratingFixtures,
  simulatedEvaluation,
} from './fixtures';

export function createMockApi(): CqaApi {
  const conversations: Conversation[] = Array.from({ length: 6 }, (_, i) =>
    makeConversation(`demo-${String(i + 1).padStart(3, '0')}`, i),
  );
  conversations[5].status = 'FAILED';
  conversations[5].error =
    'Смоделированная ошибка AI. Нажмите «Повторить», чтобы оценить диалог заново.';
  const versions: Checklist[] = [structuredClone(checklist)];
  const appeals: Appeal[] = [];
  const corrections: Correction[] = [];
  const batches = new Map<string, { batch: Batch; ids: string[] }>();
  const pending = new Map<string, { due: number; template: Checklist }>();
  const failedOnce = new Set<string>();
  let nextId = 1;
  const copy = <T>(value: T): T => structuredClone(value);
  const requireOkk = (scope: Scope) => {
    if (scope.role !== 'OKK') throw new Error('Действие доступно только ОКК.');
  };
  function findConversation(id: string, scope: Scope) {
    const c = conversations.find((c) => c.id === id);
    if (!c || (scope.role === 'OPERATOR' && c.operatorId !== scope.operatorId))
      throw new Error('Диалог не найден или недоступен выбранному оператору.');
    const task = pending.get(id);
    if (task && Date.now() >= task.due) {
      if (c.groupId === 'BATCH_FAIL' && !failedOnce.has(id)) {
        c.status = 'FAILED';
        c.error = 'Симуляция сбоя AI. Повторная оценка доступна.';
        failedOnce.add(id);
        pending.delete(id);
        return c;
      }
      c.evaluation = simulatedEvaluation(c.id + `-run-${nextId++}`, task.template);
      c.status = 'DONE';
      c.finalScore = c.evaluation.finalScore;
      c.grossError = c.evaluation.grossError;
      c.reviewed = false;
      pending.delete(id);
    }
    return c;
  }
  function start(id: string, scope: Scope) {
    requireOkk(scope);
    const c = findConversation(id, scope);
    if (c.openAppeals)
      throw new Error(
        'Сначала рассмотрите открытые апелляции. Правило переоценки ожидает согласования.',
      );
    if (c.status === 'PENDING') throw new Error('Оценка уже запущена.');
    c.status = 'PENDING';
    c.error = null;
    pending.set(id, { due: Date.now() + 2800, template: copy(versions.find((v) => v.active)!) });
  }
  return {
    async operators() {
      return copy(operators);
    },
    async conversations(scope, filters = {}) {
      let items = conversations
        .map((c) => findConversation(c.id, { role: 'OKK' }))
        .filter((c) => scope.role === 'OKK' || c.operatorId === scope.operatorId);
      items = items.filter(
        (c) =>
          (!filters.search ||
            `${c.id} ${c.operatorName} ${c.groupId}`
              .toLowerCase()
              .includes(filters.search.toLowerCase())) &&
          (!filters.status || c.status === filters.status) &&
          (!filters.channel || c.channel === filters.channel) &&
          (!filters.language || c.language === filters.language) &&
          (!filters.from || c.dateRaw.slice(0, 10) >= filters.from) &&
          (!filters.to || c.dateRaw.slice(0, 10) <= filters.to) &&
          (!filters.minScore ||
            (c.finalScore !== null && c.finalScore >= Number(filters.minScore))) &&
          (!filters.maxScore ||
            (c.finalScore !== null && c.finalScore <= Number(filters.maxScore))),
      );
      const page = filters.page ?? 0,
        size = filters.size ?? 10;
      return copy({
        items: items
          .slice(page * size, (page + 1) * size)
          .map(({ messages: _m, evaluation: _e, operatorStartSeq: _s, ...c }) => c),
        total: items.length,
        page,
        size,
      });
    },
    async conversation(id, scope) {
      return copy(findConversation(id, scope));
    },
    async importGroup(groupId, scope) {
      requireOkk(scope);
      if (!groupId.trim()) throw new Error('Введите groupId.');
      if (groupId === 'FAIL')
        throw new Error('Симуляция ошибки импорта. Попробуйте другой groupId.');
      if (conversations.some((c) => c.groupId === groupId))
        return { groupId, imported: 0, skipped: 3 };
      for (let i = 0; i < 3; i++) {
        const c = makeConversation(`import-${nextId++}`, i, groupId);
        c.evaluation = null;
        c.status = 'NOT_EVALUATED';
        c.finalScore = null;
        c.grossError = false;
        conversations.push(c);
      }
      return { groupId, imported: 3, skipped: 0 };
    },
    async evaluate(id, scope) {
      start(id, scope);
    },
    async startBatch(ids, scope) {
      requireOkk(scope);
      if (!ids.length) throw new Error('Выберите диалоги.');
      const unique = [...new Set(ids)];
      const eligible = unique.map((id) => findConversation(id, scope));
      if (eligible.some((c) => c.openAppeals || c.status === 'PENDING'))
        throw new Error('Уберите диалоги с открытыми апелляциями или запущенной оценкой.');
      unique.forEach((id) => start(id, scope));
      const batch: Batch = {
        id: `batch-${nextId++}`,
        status: 'PENDING',
        done: 0,
        total: unique.length,
        failed: 0,
        errors: [],
      };
      batches.set(batch.id, { batch, ids: unique });
      return copy(batch);
    },
    async batch(id, scope) {
      requireOkk(scope);
      const entry = batches.get(id);
      if (!entry) throw new Error('Пакет не найден.');
      entry.batch.done = entry.ids.filter(
        (id) => findConversation(id, scope).status === 'DONE',
      ).length;
      entry.batch.errors = entry.ids
        .map((id) => findConversation(id, scope))
        .filter((c) => c.status === 'FAILED')
        .map((c) => ({ conversationId: c.id, message: c.error ?? 'Ошибка оценки' }));
      entry.batch.failed = entry.batch.errors.length;
      if (entry.batch.done + entry.batch.failed === entry.batch.total)
        entry.batch.status = entry.batch.failed ? 'FAILED' : 'DONE';
      return copy(entry.batch);
    },
    async checklists() {
      return copy(versions);
    },
    async saveChecklist(input, scope) {
      requireOkk(scope);
      const errors = checklistErrors(input.criteria);
      if (!input.name.trim()) errors.push('Введите название версии.');
      if (errors.length) throw new Error(errors.join(' '));
      const version: Checklist = {
        ...copy(input),
        id: `checklist-${nextId++}-${versions.length + 1}`,
        version: versions.length + 1,
        active: false,
        createdAtLabel: 'Только что · демо',
      };
      versions.push(version);
      return copy(version);
    },
    async activateChecklist(id, scope) {
      requireOkk(scope);
      if (!versions.some((v) => v.id === id)) throw new Error('Версия не найдена.');
      versions.forEach((v) => {
        v.active = v.id === id;
      });
    },
    async appeals(scope, status) {
      return copy(
        appeals.filter(
          (a) =>
            (scope.role === 'OKK' || a.operatorId === scope.operatorId) &&
            (!status || a.status === status),
        ),
      );
    },
    async createAppeal(resultId, input, scope) {
      if (scope.role !== 'OPERATOR') throw new Error('Апелляции подаёт оператор.');
      const c = conversations.find((c) => c.evaluation?.results.some((r) => r.id === resultId));
      if (!c) throw new Error('Оценка не найдена.');
      findConversation(c.id, scope);
      if (c.status !== 'DONE') throw new Error('Дождитесь завершения оценки.');
      const result = c.evaluation!.results.find((r) => r.id === resultId)!;
      if (!input.comment.trim()) throw new Error('Добавьте комментарий.');
      if (input.desired && !validAnswer(input.desired, result.criterion))
        throw new Error('Недопустимое значение критерия.');
      if (appeals.some((a) => a.criterionResultId === resultId && a.status === 'OPEN'))
        throw new Error('По этому критерию уже есть открытая апелляция.');
      const appeal: Appeal = {
        id: `appeal-${nextId++}`,
        conversationId: c.id,
        criterionResultId: resultId,
        criterionTitle: result.criterion.title,
        operatorId: c.operatorId,
        operatorName: c.operatorName,
        comment: input.comment.trim(),
        desired: copy(input.desired),
        status: 'OPEN',
        createdAtLabel: 'Только что · демо',
        reason: null,
        original: copy(result.original),
        corrected: null,
      };
      appeals.push(appeal);
      c.openAppeals++;
      return copy(appeal);
    },
    async decide(id, input, scope) {
      requireOkk(scope);
      const appeal = appeals.find((a) => a.id === id);
      if (!appeal || appeal.status !== 'OPEN')
        throw new Error('Апелляция уже рассмотрена или не найдена.');
      const c = findConversation(appeal.conversationId, scope);
      const result = c.evaluation?.results.find((r) => r.id === appeal.criterionResultId);
      if (!result) throw new Error('Версия оценки изменилась; обновите страницу.');
      if (!input.reason.trim()) throw new Error('Укажите причину решения.');
      if (
        input.status === 'ACCEPTED' &&
        (!input.newValue || !validAnswer(input.newValue, result.criterion))
      )
        throw new Error('Выберите допустимое новое значение.');
      appeal.status = input.status;
      appeal.reason = input.reason.trim();
      appeal.corrected = input.status === 'ACCEPTED' ? copy(input.newValue) : null;
      result.decision = { status: input.status, reason: appeal.reason, value: appeal.corrected };
      if (appeal.corrected) {
        result.final = { ...appeal.corrected, points: null, maxPoints: result.original.maxPoints };
        // No scoring formula. Only the documented, authored N/A scenario has a fixture total.
        const fixtureScenario =
          result.criterion.code === 'identification' &&
          appeal.corrected.isNa &&
          c.evaluation!.checklistId === 'checklist-1' &&
          c.evaluation!.originalScore === 70 &&
          c.evaluation!.results.filter((r) => r.decision?.status === 'ACCEPTED').length === 1;
        c.evaluation!.finalScore = fixtureScenario ? 87.5 : null;
        c.evaluation!.scoreNote = fixtureScenario
          ? '87.50 — фиксированный итог сценария N/A, не вычисление frontend.'
          : 'Для произвольной правки мок не рассчитывает итог. Нужен ответ backend.';
        c.evaluation!.sections.forEach((s) => {
          s.finalScore = null;
        });
        if (input.addToExamples)
          corrections.push({
            id: `correction-${nextId++}`,
            criterionTitle: result.criterion.title,
            language: c.language,
            originalLabel: result.original.isNa ? 'N/A' : String(result.original.value),
            correctedLabel: appeal.corrected.isNa ? 'N/A' : String(appeal.corrected.value),
            reason: appeal.reason,
            snippet: c.messages[1].text,
            active: true,
          });
      }
      c.finalScore = c.evaluation!.finalScore;
      c.reviewed = true;
      c.openAppeals--;
      return copy(appeal);
    },
    async audio(id, scope) {
      findConversation(id, scope);
      return { streamUrl: null, expiresAt: null, audioPageUrl: null };
    },
    async analytics(scope) {
      requireOkk(scope);
      return {
        averageScore: 78.4,
        evaluated: conversations.filter((c) => c.status === 'DONE').length,
        total: conversations.length,
        grossErrors: conversations.filter((c) => c.grossError).length,
        openAppeals: appeals.filter((a) => a.status === 'OPEN').length,
        acceptedAppealRate: null,
        distribution: [
          { label: '85–100', count: 12 },
          { label: '60–84', count: 8 },
          { label: '0–59', count: 3 },
        ],
        weakCriteria: [
          { title: 'Идентификация клиента', label: 'Требует внимания' },
          { title: 'Полнота ответа', label: 'Требует внимания' },
        ],
        simulated: true,
      };
    },
    async leaderboard() {
      return copy(ratingFixtures);
    },
    async corrections(scope) {
      requireOkk(scope);
      return copy(corrections);
    },
    async updateCorrection(id, active, scope) {
      requireOkk(scope);
      const item = corrections.find((c) => c.id === id);
      if (!item) throw new Error('Пример не найден.');
      item.active = active;
    },
  };
}
