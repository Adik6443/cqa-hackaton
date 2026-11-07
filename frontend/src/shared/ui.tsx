import type { ReactNode } from 'react';
import { AlertCircle, ArrowRight, LoaderCircle } from 'lucide-react';
import type { Answer, Criterion, EvaluationStatus } from './api/types';

export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Score({ value, large = false }: { value: number | null; large?: boolean }) {
  return (
    <span
      className={`score ${large ? 'large' : ''} ${value === null ? 'neutral' : value >= 85 ? 'good' : value >= 60 ? 'warn' : 'bad'}`}
    >
      {value === null ? '—' : value.toFixed(2)}
      {large && value !== null && <small> / 100</small>}
    </span>
  );
}
export const statusLabels: Record<EvaluationStatus, string> = {
  DONE: 'Оценено',
  PENDING: 'Оценивается',
  FAILED: 'Ошибка',
  NOT_EVALUATED: 'Без оценки',
};
export function Status({ value }: { value: EvaluationStatus }) {
  return (
    <Badge
      tone={
        value === 'DONE' ? 'green' : value === 'FAILED' ? 'red' : value === 'PENDING' ? 'amber' : ''
      }
    >
      {value === 'PENDING' && <LoaderCircle size={12} className="spin" />}
      {statusLabels[value]}
    </Badge>
  );
}
export function ErrorBox({ message, retry }: { message?: string; retry?: () => void }) {
  return message ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry && <button onClick={retry}>Повторить</button>}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" />
      Загружаем данные…
    </div>
  );
}
export function Empty({ children = 'Здесь пока нет данных.' }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function AnswerSelect({
  criterion,
  value,
  onChange,
  optional = false,
  label = 'Новое значение',
}: {
  criterion: Criterion;
  value: Answer | null;
  onChange: (v: Answer | null) => void;
  optional?: boolean;
  label?: string;
}) {
  return (
    <label className="field">
      {label}
      <select
        required={!optional}
        value={value === null ? '' : value.isNa ? 'na' : String(value.value)}
        onChange={(e) =>
          onChange(
            e.target.value === ''
              ? null
              : e.target.value === 'na'
                ? { value: null, isNa: true }
                : { value: Number(e.target.value), isNa: false },
          )
        }
      >
        <option value="">{optional ? 'Не указывать' : 'Выберите значение'}</option>
        {criterion.answerType === 'SCALE' ? (
          criterion.steps.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value} · {s.label}
            </option>
          ))
        ) : (
          <>
            <option value="1">Да</option>
            <option value="0">Нет</option>
          </>
        )}
        {criterion.allowNa && <option value="na">N/A · Не применимо</option>}
      </select>
    </label>
  );
}
export function answerLabel(answer: Answer, criterion: Criterion) {
  return answer.isNa
    ? 'N/A'
    : answer.value === null
      ? '—'
      : criterion.answerType === 'SCALE'
        ? `${answer.value} · ${criterion.steps.find((s) => s.value === answer.value)?.label ?? ''}`
        : answer.value === 1
          ? 'Да'
          : 'Нет';
}
export function FlowArrow() {
  return <ArrowRight size={18} className="muted" />;
}
