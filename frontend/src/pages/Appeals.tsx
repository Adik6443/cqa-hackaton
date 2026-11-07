import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, Check, ExternalLink, Scale, X } from 'lucide-react';
import { api, type Appeal, type Criterion } from '../api';
import { useSession } from '../App';
import { Empty, ErrorBox, Loading, PageHeader, Toast, answerOptions, fmtScore, useLoad } from '../ui';

const TABS = [
  { key: 'OPEN', label: 'Ждут решения' },
  { key: 'ACCEPTED', label: 'Приняты' },
  { key: 'REJECTED', label: 'Отклонены' },
  { key: 'ALL', label: 'Все' },
];

export function AppealsPage() {
  const { role, operatorId, refresh } = useSession();
  const okk = role === 'OKK';
  const [params, setParams] = useSearchParams();
  const tab = params.get('status') ?? 'OPEN';
  const openId = params.get('open');
  const list = useLoad(() => api.appeals(tab === 'ALL' ? undefined : tab, okk ? undefined : operatorId ?? undefined), [tab, okk, operatorId]);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'danger' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  return (
    <>
      <PageHeader title={okk ? 'Апелляции' : 'Мои апелляции'}
                  subtitle={okk ? 'Операторы не согласны с оценкой AI. Проверьте диалог и примите или отклоните с причиной.' : 'Статус ваших апелляций и решение отдела качества.'} />
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setParams(t.key === 'OPEN' ? {} : { status: t.key }, { replace: true })}>{t.label}</button>
        ))}
      </div>
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {!list.data && list.loading && <Loading />}
      {list.data && list.data.length === 0 && (
        <Empty title={tab === 'OPEN' ? 'Нет апелляций, ожидающих решения' : 'Апелляций нет'} icon={<Scale size={36} />}>
          {okk ? 'Когда оператор оспорит оценку, она появится здесь.' : 'Чтобы оспорить оценку, откройте диалог и нажмите «Не согласен — оспорить» у нужного критерия.'}
        </Empty>
      )}
      <div className="appeal-list">
        {list.data?.map((a) => (
          <AppealCard key={a.id} a={a} okk={okk} startOpen={a.id === openId}
                      onDecided={(t) => { setToast({ text: t }); list.reload(); refresh(); }}
                      onError={(t) => setToast({ text: t, tone: 'danger' })} />
        ))}
      </div>
      {toast && <Toast text={toast.text} tone={toast.tone} onClose={closeToast} />}
    </>
  );
}

function valueText(a: { value: number | null; isNa: boolean } | null) {
  if (!a) return '—';
  if (a.isNa) return 'N/A';
  if (a.value === null) return '—';
  return a.value === 1 ? 'Да' : a.value === 0 ? 'Нет (0)' : fmtScore(a.value);
}

function AppealCard({ a, okk, startOpen, onDecided, onError }: { a: Appeal; okk: boolean; startOpen: boolean; onDecided: (t: string) => void; onError: (t: string) => void }) {
  const [open, setOpen] = useState(startOpen);
  useEffect(() => { if (startOpen) document.getElementById(`appeal-${a.id}`)?.scrollIntoView({ block: 'center' }); }, [startOpen, a.id]);
  return (
    <article id={`appeal-${a.id}`} className={`card appeal appeal-${a.status.toLowerCase()}`}>
      <header className="appeal-head">
        <div>
          <h3>{a.criterionTitle}</h3>
          <div className="meta-line">
            <Link to={`/conversations/${encodeURIComponent(a.conversationId)}`} className="mono"><ExternalLink size={14} />{a.conversationId}</Link>
            <span>{a.operatorName ?? '—'}</span>
            <span>{a.createdAtLabel}</span>
          </div>
        </div>
        <span className={`tag tag-${a.status === 'OPEN' ? 'info' : a.status === 'ACCEPTED' ? 'ok' : 'danger'}`}>
          {a.status === 'OPEN' ? 'Ждёт решения' : a.status === 'ACCEPTED' ? 'Принята' : 'Отклонена'}
        </span>
      </header>
      <div className="appeal-body">
        <div className="appeal-values">
          <div><span className="label">Оценка AI</span><strong>{valueText(a.original)}</strong></div>
          <ArrowRight size={18} className="muted" />
          <div><span className="label">Оператор считает</span><strong>{valueText(a.desired)}</strong></div>
          {a.corrected && <><ArrowRight size={18} className="muted" /><div><span className="label">Решение ОКК</span><strong>{valueText(a.corrected)}</strong></div></>}
        </div>
        <blockquote>«{a.comment}»</blockquote>
        {a.reason && <p className="decision-reason"><strong>Причина решения:</strong> {a.reason}</p>}
      </div>
      {okk && a.status === 'OPEN' && (
        open ? <DecisionForm a={a} onDone={onDecided} onError={onError} onCancel={() => setOpen(false)} />
             : <div className="row-end"><button className="btn btn-primary" onClick={() => setOpen(true)}>Рассмотреть</button></div>
      )}
    </article>
  );
}

function DecisionForm({ a, onDone, onError, onCancel }: { a: Appeal; onDone: (t: string) => void; onError: (t: string) => void; onCancel: () => void }) {
  // the criterion definition (steps, N/A) comes from the conversation card
  const conv = useLoad(() => api.conversation(a.conversationId), [a.conversationId]);
  const criterion: Criterion | undefined = conv.data?.evaluation?.results.find((r) => r.id === a.criterionResultId)?.criterion;
  const [decision, setDecision] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [aiMistake, setAiMistake] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!criterion || value) return;
    const d = a.desired;
    setValue(d ? (d.isNa ? 'na' : String(d.value)) : '');
  }, [criterion, a.desired, value]);

  if (conv.error) return <ErrorBox message={conv.error} />;
  if (!criterion) return <Loading text="Загрузка критерия…" />;
  const opts = answerOptions(criterion);
  const submit = async () => {
    setBusy(true);
    try {
      const newValue = decision === 'ACCEPTED' ? opts.find((o) => o.key === value)?.answer ?? null : null;
      await api.decide(a.id, { status: decision, reason: reason.trim(), newValue, addToExamples: decision === 'ACCEPTED' && aiMistake });
      onDone(decision === 'ACCEPTED' ? 'Апелляция принята, балл пересчитан' : 'Апелляция отклонена');
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  const valid = reason.trim() && (decision === 'REJECTED' || value);
  return (
    <div className="inline-form">
      <div className="segmented">
        <button className={decision === 'ACCEPTED' ? 'on ok' : ''} onClick={() => setDecision('ACCEPTED')}><Check size={16} />Принять</button>
        <button className={decision === 'REJECTED' ? 'on no' : ''} onClick={() => setDecision('REJECTED')}><X size={16} />Отклонить</button>
      </div>
      {decision === 'ACCEPTED' && (
        <label className="field">Правильная оценка
          <select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Выберите…</option>
            {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      )}
      <label className="field">Причина решения <span className="muted">(увидит оператор)</span>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {decision === 'ACCEPTED' && (
        <label className="check"><input type="checkbox" checked={aiMistake} onChange={(e) => setAiMistake(e.target.checked)} />
          Это ошибка AI — запомнить как пример, чтобы AI учитывал его в следующих оценках</label>
      )}
      <div className="row-end">
        <button className="btn" onClick={onCancel}>Отмена</button>
        <button className="btn btn-primary" disabled={busy || !valid} onClick={submit}>{busy ? 'Сохранение…' : 'Сохранить решение'}</button>
      </div>
    </div>
  );
}
