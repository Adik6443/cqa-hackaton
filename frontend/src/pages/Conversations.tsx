import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, CloudDownload, Headphones, MessageSquare, Play, Search, X } from 'lucide-react';
import { api, type Batch, type Filters, type Preview } from '../api';
import { useSession } from '../App';
import { CHANNELS, Empty, ErrorBox, GrossMark, LANGS, Loading, PageHeader, ScoreBadge, StatusBadge, Toast, useLoad, usePoll } from '../ui';

const SCORE_BUCKETS = [
  { key: '0-49', label: '0–49', tone: 'bad' },
  { key: '50-69', label: '50–69', tone: 'warn' },
  { key: '70-84', label: '70–84', tone: 'mid' },
  { key: '85-100', label: '85–100', tone: 'good' },
];
const DURATIONS = [
  { key: 'lt3', label: 'до 3 мин' }, { key: '3-10', label: '3–10 мин' }, { key: '10-20', label: '10–20 мин' }, { key: 'gt20', label: 'больше 20 мин' },
];
const FILTER_KEYS = ['search', 'status', 'channel', 'language', 'from', 'to', 'scoreBucket', 'durationBucket', 'grossError', 'hasOpenAppeal', 'groupId'] as const;
const PAGE_SIZE = 25;

export function ConversationsPage() {
  const { role, operatorId, refresh } = useSession();
  const okk = role === 'OKK';
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(params.get('page') || 0);

  const filters: Filters = {};
  FILTER_KEYS.forEach((k) => { const v = params.get(k); if (v) filters[k] = v; });
  if (!okk && operatorId) filters.operatorId = operatorId;
  const key = JSON.stringify(filters) + page;

  const list = useLoad(() => api.conversations(filters, page, PAGE_SIZE), [key]);
  const anyPending = !!list.data?.items.some((c) => c.status === 'PENDING');
  usePoll(list.reload, anyPending);

  const setFilter = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    next.delete('page');
    setParams(next, { replace: true });
  };
  const toggle = (k: string, v: string) => setFilter(k, params.get(k) === v ? null : v);
  const activeCount = FILTER_KEYS.filter((k) => params.get(k)).length;

  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'danger' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  return (
    <>
      <PageHeader
        title={okk ? 'Диалоги' : 'Мои диалоги'}
        subtitle={okk ? 'Все чаты и звонки. Нажмите на строку, чтобы открыть оценку и стенограмму.' : 'Ваши оценённые диалоги. Если не согласны с оценкой — откройте диалог и оспорьте критерий.'}
        actions={okk && <ImportButton onDone={(t) => { setToast({ text: t }); list.reload(); refresh(); }} onError={(t) => setToast({ text: t, tone: 'danger' })} />}
      />

      {okk && <EvaluatePanel filters={filters} onDone={() => { list.reload(); refresh(); }} />}

      <section className="card filters">
        <div className="filter-row">
          <label className="search">
            <Search size={18} />
            <input placeholder="Поиск по ID или тексту диалога" defaultValue={params.get('search') ?? ''}
                   onKeyDown={(e) => { if (e.key === 'Enter') setFilter('search', (e.target as HTMLInputElement).value.trim()); }}
                   onBlur={(e) => setFilter('search', e.target.value.trim())} />
          </label>
          <select value={params.get('language') ?? ''} onChange={(e) => setFilter('language', e.target.value)} aria-label="Язык">
            <option value="">Все языки</option>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={params.get('channel') ?? ''} onChange={(e) => setFilter('channel', e.target.value)} aria-label="Канал">
            <option value="">Чаты и звонки</option>
            <option value="CHAT">Только чаты</option>
            <option value="VOICE">Только звонки</option>
          </select>
          <select value={params.get('status') ?? ''} onChange={(e) => setFilter('status', e.target.value)} aria-label="Статус">
            <option value="">Любой статус</option>
            <option value="NOT_EVALUATED">Не оценён</option>
            <option value="PENDING">Оценивается</option>
            <option value="DONE">Оценён</option>
            <option value="FAILED">Ошибка</option>
          </select>
          <select value={params.get('durationBucket') ?? ''} onChange={(e) => setFilter('durationBucket', e.target.value)} aria-label="Длительность">
            <option value="">Любая длительность</option>
            {DURATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
        <div className="filter-row">
          <span className="filter-label">Дата:</span>
          <label className="date-field">С <input type="date" value={params.get('from') ?? ''} onChange={(e) => setFilter('from', e.target.value)} /></label>
          <label className="date-field">По <input type="date" value={params.get('to') ?? ''} onChange={(e) => setFilter('to', e.target.value)} /></label>
          <span className="filter-sep" />
          <span className="filter-label">Балл:</span>
          {SCORE_BUCKETS.map((b) => (
            <button key={b.key} className={`chip chip-${b.tone}${params.get('scoreBucket') === b.key ? ' on' : ''}`} onClick={() => toggle('scoreBucket', b.key)}>{b.label}</button>
          ))}
          <span className="filter-sep" />
          <button className={`chip chip-bad${params.get('grossError') === 'true' ? ' on' : ''}`} onClick={() => toggle('grossError', 'true')}>Грубые ошибки</button>
          <button className={`chip${params.get('hasOpenAppeal') === 'true' ? ' on' : ''}`} onClick={() => toggle('hasOpenAppeal', 'true')}>С открытой апелляцией</button>
          {activeCount > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}><X size={16} />Сбросить фильтры</button>}
        </div>
      </section>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {!list.data && list.loading && <Loading />}
      {list.data && list.data.total === 0 && (
        activeCount > 0 ? (
          <Empty title="Ничего не найдено">Попробуйте убрать часть фильтров.</Empty>
        ) : okk ? (
          <Empty title="Диалогов пока нет" icon={<CloudDownload size={36} />}>
            Нажмите <strong>«Загрузить диалоги»</strong> вверху справа: система заберёт набор у организаторов (группа DEV).
          </Empty>
        ) : (
          <Empty title="У вас пока нет диалогов">Выберите другого оператора вверху или дождитесь загрузки.</Empty>
        )
      )}
      {list.data && list.data.total > 0 && (
        <section className="card table-card">
          <div className="table-meta">
            Найдено: <strong>{list.data.total}</strong>
            {list.loading && <span className="muted"> · обновление…</span>}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Диалог</th><th>Оператор</th><th>Канал</th><th>Дата</th><th>Длительность</th><th>Статус</th>
                  <th className="num">Балл</th><th>Отметки</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/conversations/${encodeURIComponent(c.id)}`)}>
                    <td><Link to={`/conversations/${encodeURIComponent(c.id)}`} className="mono" onClick={(e) => e.stopPropagation()}>{c.id}</Link></td>
                    <td>{c.operatorName ?? '—'}</td>
                    <td><span className="channel">{c.channel === 'VOICE' ? <Headphones size={16} /> : <MessageSquare size={16} />}{CHANNELS[c.channel]} · {c.language}</span></td>
                    <td>{c.dateLabel}</td>
                    <td>{c.durationLabel ?? '—'}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="num"><ScoreBadge value={c.finalScore} /></td>
                    <td><div className="marks">
                      {c.grossError && <GrossMark />}
                      {c.openAppeals > 0 && <span className="tag tag-info">Апелляция</span>}
                      {c.status === 'FAILED' && c.error && <span className="muted small" title={c.error}>см. ошибку</span>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={list.data.total} onPage={(p) => { const n = new URLSearchParams(params); n.set('page', String(p)); setParams(n); }} />
        </section>
      )}
      {toast && <Toast text={toast.text} tone={toast.tone} onClose={closeToast} />}
    </>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={16} />Назад</button>
      <span>Страница {page + 1} из {pages}</span>
      <button className="btn btn-sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Вперёд<ChevronRight size={16} /></button>
    </div>
  );
}

function ImportButton({ onDone, onError }: { onDone: (t: string) => void; onError: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState('DEV');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.importGroup(group.trim(), date || undefined);
      onDone(`Загружено новых: ${r.imported}, уже были: ${r.skipped}`);
      setOpen(false);
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="popover-anchor">
      <button className="btn btn-primary" onClick={() => setOpen(!open)}><CloudDownload size={18} />Загрузить диалоги</button>
      {open && (
        <div className="popover">
          <h3>Загрузка от организаторов</h3>
          <label className="field">Группа (group_id)<input value={group} onChange={(e) => setGroup(e.target.value)} /></label>
          <label className="field">Дата для чатов <span className="muted">(необязательно)</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <p className="hint">Уже загруженные диалоги пропускаются, повторная загрузка безопасна.</p>
          <div className="row-end">
            <button className="btn" onClick={() => setOpen(false)}>Отмена</button>
            <button className="btn btn-primary" disabled={busy || !group.trim()} onClick={run}>{busy ? 'Загрузка…' : 'Загрузить'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Evaluate everything that matches the current filters" with a preview and a progress bar. */
function EvaluatePanel({ filters, onDone }: { filters: Filters; onDone: () => void }) {
  const [onlyNew, setOnlyNew] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setError(null); setBusy(true);
    try { setPreview(await api.previewBatch(filters, onlyNew)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const start = async () => {
    setError(null); setBusy(true);
    try { setBatch(await api.startBatch(filters, onlyNew)); setPreview(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const poll = useCallback(async () => {
    if (!batch) return;
    const b = await api.batch(batch.id);
    setBatch(b);
    if (b.status !== 'PENDING') onDone();
  }, [batch, onDone]);
  usePoll(poll, batch?.status === 'PENDING');

  return (
    <section className="card evaluate">
      <div className="evaluate-main">
        <Play size={20} className="accent" />
        <div>
          <strong>Оценить диалоги по текущим фильтрам</strong>
          <p className="muted small">Например: выберите язык и дату — и оцените всё за этот день одной кнопкой.</p>
        </div>
        <label className="check"><input type="checkbox" checked={onlyNew} onChange={(e) => { setOnlyNew(e.target.checked); setPreview(null); }} />Только ещё не оценённые</label>
        <button className="btn" disabled={busy || batch?.status === 'PENDING'} onClick={check}>Посчитать</button>
      </div>
      {preview && (
        <div className="evaluate-confirm">
          {preview.count === 0 ? <span>Нет диалогов для оценки по этим фильтрам.</span> : (
            <>
              <span>Будет оценено диалогов: <strong>{preview.count}</strong>{preview.skipped.length > 0 && <span className="muted"> (пропущено {preview.skipped.length}: идёт оценка или открыта апелляция)</span>}</span>
              <button className="btn btn-primary" disabled={busy} onClick={start}><Play size={16} />Запустить оценку</button>
            </>
          )}
        </div>
      )}
      {batch && (
        <div className="progress-block">
          <div className="progress-text">
            {batch.status === 'PENDING' ? 'Идёт оценка…' : batch.status === 'DONE' ? 'Оценка завершена' : 'Оценка завершилась с ошибками'}
            <span>{batch.done} из {batch.total}{batch.failed > 0 && <span className="text-danger"> · ошибок: {batch.failed}</span>}</span>
          </div>
          <div className="progress"><div style={{ width: `${batch.total ? (batch.done / batch.total) * 100 : 0}%` }} /></div>
          {batch.errors.length > 0 && <details className="small"><summary>Почему ошибки</summary>{batch.errors.slice(0, 10).map((x) => <div key={x.conversationId}><span className="mono">{x.conversationId}</span>: {x.message}</div>)}</details>}
        </div>
      )}
      {error && <ErrorBox message={error} />}
    </section>
  );
}
