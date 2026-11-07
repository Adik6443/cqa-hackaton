import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Inbox, Loader2, XCircle } from 'lucide-react';
import type { Answer, Criterion, EvalStatus } from './api';

/** Loads data, keeps loading/error state, reload() for refresh. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current;
    setLoading(true);
    load()
      .then((d) => { if (n === seq.current) { setData(d); setError(null); } })
      .catch((e: Error) => { if (n === seq.current) setError(e.message); })
      .finally(() => { if (n === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Calls fn every `ms` while `active` is true (used for PENDING evaluations and batches). */
export function usePoll(fn: () => void, active: boolean, ms = 2000) {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }, [fn, active, ms]);
}

export const fmtScore = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Number(v).toFixed(2).replace(/\.00$/, ''));

export function scoreTone(v: number | null | undefined): 'bad' | 'warn' | 'mid' | 'good' | 'none' {
  if (v === null || v === undefined) return 'none';
  if (v < 50) return 'bad';
  if (v < 70) return 'warn';
  if (v < 85) return 'mid';
  return 'good';
}

export function ScoreBadge({ value, large }: { value: number | null | undefined; large?: boolean }) {
  return <span className={`score score-${scoreTone(value)}${large ? ' score-lg' : ''}`}>{fmtScore(value)}</span>;
}

const STATUS: Record<EvalStatus, { label: string; icon: ReactNode; cls: string }> = {
  NOT_EVALUATED: { label: 'Не оценён', icon: <CircleDashed size={15} />, cls: 'neutral' },
  PENDING: { label: 'Оценивается', icon: <Loader2 size={15} className="spin" />, cls: 'info' },
  DONE: { label: 'Оценён', icon: <CheckCircle2 size={15} />, cls: 'ok' },
  FAILED: { label: 'Ошибка', icon: <XCircle size={15} />, cls: 'danger' },
};
export function StatusBadge({ status }: { status: EvalStatus }) {
  const s = STATUS[status];
  return <span className={`tag tag-${s.cls}`}>{s.icon}{s.label}</span>;
}

/** Human label for a criterion answer: Да / Нет / N/A / scale step. */
export function answerLabel(c: Criterion, a: Answer | null | undefined): string {
  if (!a) return '—';
  if (a.isNa) return 'N/A';
  if (a.value === null) return '—';
  if (c.answerType === 'SCALE') return `${fmtScore(a.value)} из ${Math.max(...c.steps.map((s) => s.value))}`;
  if (c.answerType === 'FLAG') return a.value > 0 ? 'Есть' : 'Нет';
  return a.value > 0 ? 'Да' : 'Нет';
}

export function AnswerTag({ c, a }: { c: Criterion; a: Answer | null | undefined }) {
  const label = answerLabel(c, a);
  let cls = 'neutral';
  if (a && !a.isNa && a.value !== null) {
    const max = Math.max(...c.steps.map((s) => s.value), 1);
    const good = c.answerType === 'FLAG' ? a.value === 0 : a.value / max >= 0.99;
    const bad = c.answerType === 'FLAG' ? a.value > 0 : a.value === 0;
    cls = good ? 'ok' : bad ? 'danger' : 'warn';
  }
  return <span className={`tag tag-${cls}`}>{label}</span>;
}

/** Options for choosing an answer (appeal / decision forms). */
export function answerOptions(c: Criterion): { key: string; label: string; answer: Answer }[] {
  const opts: { key: string; label: string; answer: Answer }[] = c.steps.map((s) => ({ key: String(s.value), label: answerLabel(c, { value: s.value, isNa: false }) + (c.answerType === 'SCALE' ? ` — ${s.label}` : ''), answer: { value: s.value, isNa: false } }));
  if (c.allowNa) opts.push({ key: 'na', label: 'N/A — неприменимо', answer: { value: null, isNa: true } });
  return opts;
}

export function Loading({ text = 'Загрузка…' }: { text?: string }) {
  return <div className="state"><Loader2 size={22} className="spin" />{text}</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-danger" role="alert">
      <AlertTriangle size={20} />
      <div><strong>Не получилось.</strong> {message}</div>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Повторить</button>}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={36} />}
      <h3>{title}</h3>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function GrossMark() {
  return <span className="tag tag-danger" title="Грубое нарушение"><CircleSlash size={15} />Грубая ошибка</span>;
}

export function Toast({ text, tone = 'ok', onClose }: { text: string; tone?: 'ok' | 'danger'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${tone}`} role="status">{tone === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}{text}</div>;
}

export const LANGS: Record<string, string> = { RU: 'Русский', KZ: 'Қазақша', EN: 'English' };
export const CHANNELS: Record<string, string> = { CHAT: 'Чат', VOICE: 'Звонок' };
