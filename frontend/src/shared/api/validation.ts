import type { Answer, Criterion } from './types';
export function validAnswer(answer: Answer, criterion: Criterion): boolean {
  if (answer.isNa) return criterion.allowNa && answer.value === null;
  if (answer.value === null || !Number.isFinite(answer.value)) return false;
  return criterion.answerType === 'SCALE'
    ? criterion.steps.some((s) => s.value === answer.value)
    : answer.value === 0 || answer.value === 1;
}
export function checklistErrors(criteria: Criterion[]): string[] {
  const errors: string[] = [];
  if (!criteria.length) errors.push('Добавьте хотя бы один критерий.');
  if (new Set(criteria.map((c) => c.code.trim())).size !== criteria.length)
    errors.push('Коды критериев должны быть уникальными.');
  criteria.forEach((c, i) => {
    const prefix = `Критерий ${i + 1}: `;
    if (![c.code, c.title, c.section, c.instruction].every((s) => s.trim()))
      errors.push(prefix + 'заполните код, название, секцию и инструкцию.');
    if (!Number.isFinite(c.weight) || c.weight < 0 || (c.answerType === 'FLAG' && c.weight !== 0))
      errors.push(prefix + 'проверьте вес.');
    if (c.allowNa && !c.naCondition.trim()) errors.push(prefix + 'укажите условие N/A.');
    if (
      c.answerType === 'SCALE' &&
      (c.steps.length < 2 ||
        c.steps.some((s) => !Number.isFinite(s.value) || !s.label.trim()) ||
        new Set(c.steps.map((s) => s.value)).size !== c.steps.length)
    )
      errors.push(prefix + 'нужны минимум две уникальные числовые ступени с описаниями.');
  });
  // Weight validation is template validation, never an evaluation scoring formula.
  if (Math.abs(criteria.reduce((sum, c) => sum + c.weight, 0) - 100) > 0.001)
    errors.push('Сумма весов должна быть 100 (предложенное правило для демо).');
  return errors;
}
