import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  CalendarDays, ChevronLeft, ChevronRight, CircleSlash, CloudDownload, Headphones, Loader2, MessageSquare, Play, Scale, Search, X,
} from 'lucide-react';
import { api, type Batch, type BatchTarget, type Filters, type Preview, type Provider } from '../api';
import { useSession } from '../App';
import { CHANNELS, Empty, ErrorBox, GrossMark, LANGS, Loading, PageHeader, ScoreBadge, StatusBadge, Toast, useLoad, usePoll } from '../ui';

const SCORE_BUCKETS = [
  { key: '0-49', label: '0–49', tone: 'bad' },
  { key: '50-69', label: '50–69', tone: 'warn' },
  { key: '70-84', label: '70–84', tone: 'mid' },
  { key: '85-100', label: '85–100', tone: 'good' },
];
const DURATIONS = [
  { key: 'lt3', label: 'до 3 мин' }, { key: '3-10', label: '3–10' }, { key: '10-20', label: '10–20' }, { key: 'gt20', label: 'больше 20' },
];
const STATUSES: Record<string, string> = { NOT_EVALUATED: 'Не оценён', PENDING: 'Оценивается', DONE: 'Оценён', FAILED: 'Ошибка' };
const FILTER_KEYS = ['search', 'status', 'channel', 'language', 'from', 'to', 'scoreBucket', 'durationBucket', 'grossError', 'hasOpenAppeal', 'groupId'] as const;
const PAGE_SIZE = 25;

const fmtDay = (iso: string) => iso.split('-').reverse().slice(0, 2).join('.');

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

  // checkboxes: selection survives paging and filter changes, cleared explicitly or after a run
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pageIds = list.data?.items.map((c) => c.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = () => setSelected((s) => { const n = new Set(s); pageIds.forEach((id) => (allOnPage ? n.delete(id) : n.add(id))); return n; });

  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'danger' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  // chips that show what is filtered, each with its own ×
  const chips: { k: string; label: string; value: string; dot?: string }[] = [];
  if (params.get('language')) chips.push({ k: 'language', label: 'Язык', value: LANGS[params.get('language')!] ?? params.get('language')! });
  if (params.get('channel')) chips.push({ k: 'channel', label: 'Канал', value: CHANNELS[params.get('channel')!] });
  if (params.get('status')) chips.push({ k: 'status', label: 'Статус', value: STATUSES[params.get('status')!] });
  if (params.get('from')) chips.push({ k: 'from', label: 'С', value: fmtDay(params.get('from')!) });
  if (params.get('to')) chips.push({ k: 'to', label: 'По', value: fmtDay(params.get('to')!) });
  if (params.get('durationBucket')) chips.push({ k: 'durationBucket', label: 'Длительность', value: DURATIONS.find((d) => d.key === params.get('durationBucket'))?.label ?? '' });
  const sb = SCORE_BUCKETS.find((b) => b.key === params.get('scoreBucket'));
  if (sb) chips.push({ k: 'scoreBucket', label: 'Балл', value: sb.label, dot: sb.tone });
  if (params.get('grossError')) chips.push({ k: 'grossError', label: '', value: 'Грубые ошибки' });
  if (params.get('hasOpenAppeal')) chips.push({ k: 'hasOpenAppeal', label: '', value: 'С открытой апелляцией' });
  if (params.get('search')) chips.push({ k: 'search', label: 'Поиск', value: params.get('search')! });

  return (
    <>
      <PageHeader
        title={okk ? 'Диалоги' : 'Мои диалоги'}
        subtitle={okk ? 'Чаты и звонки операторов. Откройте строку, чтобы увидеть оценку и стенограмму.' : 'Ваши оценённые диалоги. Не согласны с оценкой — откройте диалог и оспорьте критерий.'}
        actions={okk && <ImportButton onDone={(t) => { setToast({ text: t }); list.reload(); refresh(); }} onError={(t) => setToast({ text: t, tone: 'danger' })} />}
      />

      <section className="card filters">
        <div className="filters-top">
          <div className="filter-row">
            <label className="search">
              <Search size={18} />
              <input key={params.get('search') ?? ''} placeholder="Поиск по ID или тексту диалога" defaultValue={params.get('search') ?? ''} aria-label="Поиск"
                     onKeyDown={(e) => { if (e.key === 'Enter') setFilter('search', (e.target as HTMLInputElement).value.trim()); }}
                     onBlur={(e) => setFilter('search', e.target.value.trim())} />
            </label>
            <SelectFilter label="Язык" value={params.get('language')} options={LANGS} onChange={(v) => setFilter('language', v)} />
            <SelectFilter label="Канал" value={params.get('channel')} options={CHANNELS} onChange={(v) => setFilter('channel', v)} />
            <SelectFilter label="Статус" value={params.get('status')} options={STATUSES} onChange={(v) => setFilter('status', v)} />
            <label className={`sel${params.get('from') || params.get('to') ? ' act' : ''}`}>
              <CalendarDays size={16} />
              <input type="date" value={params.get('from') ?? ''} onChange={(e) => setFilter('from', e.target.value)} aria-label="Дата с" />
              <span className="muted">–</span>
              <input type="date" value={params.get('to') ?? ''} onChange={(e) => setFilter('to', e.target.value)} aria-label="Дата по" />
            </label>
          </div>
          {chips.length > 0 && (
            <div className="filter-row">
              <span className="small muted">Выбрано:</span>
              {chips.map((c) => (
                <span key={c.k} className="fchip">
                  {c.dot && <span className={`dot d-${c.dot}`} />}
                  {c.label && <span className="k">{c.label}</span>}{c.value}
                  <button className="xb" aria-label={`Убрать фильтр ${c.label || c.value}`} onClick={() => setFilter(c.k, null)}><X size={14} /></button>
                </span>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Сбросить всё</button>
            </div>
          )}
        </div>
        <div className="filters-groups">
          <div className="fgroup">
            <span className="fgroup-label">Длительность</span>
            <div className="tog-row">
              {DURATIONS.map((d) => <button key={d.key} className={`tog${params.get('durationBucket') === d.key ? ' on' : ''}`} onClick={() => toggle('durationBucket', d.key)}>{d.label}</button>)}
            </div>
          </div>
          <div className="fgroup">
            <span className="fgroup-label">Балл</span>
            <div className="tog-row">
              {SCORE_BUCKETS.map((b) => (
                <button key={b.key} className={`tog${params.get('scoreBucket') === b.key ? ' on' : ''}`} onClick={() => toggle('scoreBucket', b.key)}>
                  <span className={`dot d-${b.tone}`} />{b.label}
                </button>
              ))}
            </div>
          </div>
          <div className="fgroup">
            <span className="fgroup-label">Отметки</span>
            <div className="tog-row">
              <button className={`tog${params.get('grossError') === 'true' ? ' on' : ''}`} onClick={() => toggle('grossError', 'true')}><CircleSlash size={15} />Грубые ошибки</button>
              <button className={`tog${params.get('hasOpenAppeal') === 'true' ? ' on' : ''}`} onClick={() => toggle('hasOpenAppeal', 'true')}><Scale size={15} />С открытой апелляцией</button>
            </div>
          </div>
        </div>
      </section>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {!list.data && list.loading && <Loading />}
      {list.data && list.data.total === 0 && (
        activeCount > 0 ? (
          <Empty title="Ничего не найдено">Попробуйте убрать часть фильтров.</Empty>
        ) : okk ? (
          <Empty title="Диалогов пока нет" icon={<CloudDownload size={28} />}>
            Нажмите <strong>«Загрузить диалоги»</strong> вверху справа: система заберёт набор у организаторов (группа DEV).
          </Empty>
        ) : (
          <Empty title="У вас пока нет диалогов">Выберите другого оператора вверху или дождитесь загрузки.</Empty>
        )
      )}
      {list.data && list.data.total > 0 && (
        <section className="card table-card">
          {okk ? (
            <EvaluateBar total={list.data.total} filters={filters} selected={[...selected]}
                         onClear={() => setSelected(new Set())}
                         onStarted={() => { setSelected(new Set()); list.reload(); }}
                         onDone={() => { list.reload(); refresh(); }} />
          ) : (
            <div className="table-meta"><strong className="num">{list.data.total}</strong> <span className="muted">диалогов</span></div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {okk && <th className="cb"><input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Выбрать все на странице" /></th>}
                  <th>ID</th><th>Оператор</th><th>Канал</th><th>Дата</th><th>Длительность</th><th>Статус</th>
                  <th className="num">Балл</th><th>Отметки</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
                  <tr key={c.id} className={`clickable${selected.has(c.id) ? ' selected' : ''}`} onClick={() => navigate(`/conversations/${encodeURIComponent(c.id)}`)}>
                    {okk && (
                      <td className="cb" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} aria-label={`Выбрать ${c.id}`} />
                      </td>
                    )}
                    <td><Link to={`/conversations/${encodeURIComponent(c.id)}`} className="mono" onClick={(e) => e.stopPropagation()}>{c.id}</Link></td>
                    <td>{c.operatorName ?? <span className="muted">—</span>}</td>
                    <td><span className="channel">{c.channel === 'VOICE' ? <Headphones size={16} className="muted" /> : <MessageSquare size={16} className="muted" />}{CHANNELS[c.channel]}<span className="tag tag-outline">{c.language}</span></span></td>
                    <td className="num-text">{c.dateLabel}</td>
                    <td className="num-text">{c.durationLabel ?? '—'}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="num"><ScoreBadge value={c.finalScore} /></td>
                    <td><div className="marks">
                      {c.grossError && <GrossMark />}
                      {c.openAppeals > 0 && <span className="tag tag-info"><Scale size={14} />Апелляция</span>}
                      {c.status === 'FAILED' && c.error && <span className="muted small" title={c.error}>наведите — причина</span>}
                      {!c.grossError && c.openAppeals === 0 && c.status !== 'FAILED' && <span className="muted">—</span>}
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

function SelectFilter({ label, value, options, onChange }: { label: string; value: string | null; options: Record<string, string>; onChange: (v: string | null) => void }) {
  return (
    <label className={`sel${value ? ' act' : ''}`}>
      <span className="k">{label}:</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label={label}>
        <option value="">Все</option>
        {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <span className="small muted">{page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} из {total}</span>
      <div className="pg">
        <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Назад"><ChevronLeft size={16} /></button>
        {Array.from({ length: pages }, (_, i) => i).filter((i) => Math.abs(i - page) <= 2 || i === 0 || i === pages - 1).map((i, idx, arr) => (
          <span key={i} className="pg-item">
            {idx > 0 && i - arr[idx - 1] > 1 && <span className="muted">…</span>}
            <button className={i === page ? 'on' : ''} onClick={() => onPage(i)}>{i + 1}</button>
          </span>
        ))}
        <button className="btn btn-ghost btn-sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Вперёд"><ChevronRight size={16} /></button>
      </div>
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
        <div className="popover" role="dialog" aria-label="Загрузка диалогов">
          <h2 className="popover-title">Загрузить диалоги</h2>
          <p className="hint">Сервер заберёт диалоги из API организаторов и сохранит их в базу. Потом их можно оценить.</p>
          <label className="field">Код набора (group_id)<input className="mono" value={group} onChange={(e) => setGroup(e.target.value)} /></label>
          <p className="hint">DEV — набор для разработки (65 диалогов). Для контрольного часа организаторы сообщат другой код.</p>
          <label className="field">Дата для чатов <span className="muted">— необязательно</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <p className="hint">У чатов нет даты, только время от начала. Дата нужна для аналитики по дням; пусто — сегодня. У звонков дата из стенограммы.</p>
          <p className="hint">Уже загруженные диалоги пропускаются, повторять загрузку безопасно.</p>
          <div className="row-end">
            <button className="btn" onClick={() => setOpen(false)}>Отмена</button>
            <button className="btn btn-primary" disabled={busy || !group.trim()} onClick={run}>{busy ? 'Загрузка…' : 'Загрузить'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Top bar of the table: what will be evaluated (checked rows, or everything matching the filters),
 * which model, preview count, run, and the progress of the running batch.
 */
function EvaluateBar({ total, filters, selected, onClear, onStarted, onDone }: {
  total: number; filters: Filters; selected: string[]; onClear: () => void; onStarted: () => void; onDone: () => void;
}) {
  const [onlyNew, setOnlyNew] = useState(true);
  const [model, setModel] = useState('');          // '' = route by language; 'OPENAI' etc = that provider's default model
  const [preview, setPreview] = useState<Preview | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const providers = useLoad(() => api.providers(), []);
  const available = (providers.data ?? []).filter((p: Provider) => p.available && p.provider !== 'MOCK');

  const bySelection = selected.length > 0;
  const target: BatchTarget = useMemo(() => (bySelection ? { ids: selected } : { filters, onlyNotEvaluated: onlyNew }), [bySelection, selected, filters, onlyNew]);
  const targetKey = JSON.stringify(target);
  useEffect(() => { setPreview(null); }, [targetKey]);

  const check = async () => {
    setError(null); setBusy(true);
    try { setPreview(await api.previewBatch(target)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const start = async () => {
    setError(null); setBusy(true);
    try {
      setBatch(await api.startBatch(target, model || undefined));
      setPreview(null);
      onStarted();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const poll = useCallback(async () => {
    if (!batch) return;
    const b = await api.batch(batch.id);
    setBatch(b);
    if (b.status !== 'PENDING') onDone();
  }, [batch, onDone]);
  usePoll(poll, batch?.status === 'PENDING');
  const running = batch?.status === 'PENDING';

  return (
    <>
      <div className="evalbar">
        <div className="evalbar-left">
          {bySelection ? (
            <>
              <span><strong className="num">{selected.length}</strong> <span className="muted">выбрано</span></span>
              <button className="btn btn-ghost btn-sm" onClick={onClear}><X size={15} />Снять выбор</button>
            </>
          ) : (
            <>
              <span><strong className="num">{total}</strong> <span className="muted">диалогов</span></span>
              <label className="check small"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />Только ещё не оценённые</label>
            </>
          )}
        </div>
        <div className="evalbar-right">
          <label className="sel sel-sm" title="Какой моделью оценить. «По языку» — как настроено на странице «Модели AI»">
            <span className="k">Модель:</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Модель для оценки">
              <option value="">по языку</option>
              {available.map((p) => <option key={p.provider} value={p.provider}>{p.provider} · {p.defaultModel}</option>)}
            </select>
          </label>
          {!preview && <button className="btn btn-sm" disabled={busy || running} onClick={check}>{bySelection ? 'Проверить выбранные' : 'Посчитать'}</button>}
          {preview && (
            preview.count === 0
              ? <span className="small muted">Нечего оценивать{preview.skipped.length > 0 && ` (${preview.skipped.length} заняты: идёт оценка или открыта апелляция)`}</span>
              : <>
                  <span className="small">Будет оценено: <strong className="num">{preview.count}</strong>{preview.skipped.length > 0 && <span className="muted"> · пропущено {preview.skipped.length}</span>}</span>
                  <button className="btn btn-primary btn-sm" disabled={busy || running} onClick={start}><Play size={15} />{bySelection ? 'Оценить выбранные' : 'Запустить оценку'}</button>
                </>
          )}
        </div>
      </div>
      {bySelection && !preview && <div className="evalbar-hint small muted">Уже оценённые диалоги из выбранных будут переоценены, прошлая оценка сохранится в истории карточки.</div>}
      {batch && (
        <div className={`progress-strip${running ? '' : batch.failed > 0 ? ' warn' : ' done'}`}>
          {running ? <Loader2 size={16} className="spin" /> : null}
          <span className="small strong">{running ? 'Идёт оценка' : batch.failed > 0 ? 'Завершено с ошибками' : 'Оценка завершена'}</span>
          <span className="bar"><span style={{ width: `${batch.total ? (batch.done / batch.total) * 100 : 0}%` }} /></span>
          <span className="small num"><strong>{batch.done}</strong> из {batch.total}{batch.failed > 0 && <span className="text-danger"> · ошибок {batch.failed}</span>}</span>
          {!running && <button className="btn btn-ghost btn-sm" onClick={() => setBatch(null)} aria-label="Скрыть"><X size={15} /></button>}
        </div>
      )}
      {batch && batch.errors.length > 0 && (
        <details className="batch-errors small"><summary>Почему ошибки ({batch.errors.length})</summary>
          {batch.errors.slice(0, 10).map((x) => <div key={x.conversationId}><span className="mono">{x.conversationId}</span>: {x.message}</div>)}
        </details>
      )}
      {error && <div className="evalbar-error"><ErrorBox message={error} /></div>}
    </>
  );
}
