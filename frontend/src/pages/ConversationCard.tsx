import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  AlertTriangle, ArrowLeft, Bot, CheckCircle2, ChevronDown, ChevronUp, Clock, Cpu, ExternalLink, Eye, FlaskConical, Gauge, Headphones, History,
  Info, Loader2, MessageSquare, MessageSquareText, MinusCircle, Pause, Play, RefreshCw, Scale, ShieldAlert, ShieldCheck, User, UserRound, Volume2, XCircle,
} from 'lucide-react';
import { api, type AudioSource, type Conversation, type CriterionResult, type Evaluation, type HistoryItem, type Message } from '../api';
import { useSession } from '../App';
import {
  AnswerTag, CHANNELS, ErrorBox, LANGS, Loading, ScoreBadge, StatusBadge, Toast, answerLabel, answerOptions, fmtScore, useLoad, usePoll,
} from '../ui';

export function ConversationPage() {
  const { id = '' } = useParams();
  const { role, refresh } = useSession();
  const okk = role === 'OKK';
  const conv = useLoad(() => api.conversation(id), [id]);
  const pending = conv.data?.status === 'PENDING';
  usePoll(conv.reload, pending);

  // history of evaluations: re-evaluation never deletes the previous one
  const currentEvalId = conv.data?.evaluation?.id ?? '';
  const history = useLoad(() => api.history(id), [id, currentEvalId, conv.data?.status]);
  const [viewId, setViewId] = useState<string | null>(null);
  useEffect(() => { setViewId(null); }, [id, currentEvalId]);
  const past = useLoad(() => (viewId ? api.pastEvaluation(id, viewId) : Promise.resolve(null)), [id, viewId]);

  const [highlight, setHighlight] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'danger' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const span = conv.data ? Math.max(0, ...conv.data.messages.map((m) => m.offsetSec ?? 0)) : 0;
  const audio = useAudio(id, span);

  const evaluate = async () => {
    try { await api.evaluate(id); setToast({ text: 'Оценка запущена. Прошлая оценка сохранится в истории.' }); conv.reload(); }
    catch (e) { setToast({ text: (e as Error).message, tone: 'danger' }); }
  };

  /** Evidence link: scroll to the message; for a call also play that fragment of the recording. */
  const jump = (seq: number) => {
    setHighlight(seq);
    document.getElementById(`msg-${seq}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (conv.data?.channel === 'VOICE') audio.playMessage(conv.data.messages, seq);
  };

  if (conv.error) return <><BackLink /><ErrorBox message={conv.error} onRetry={conv.reload} /></>;
  if (!conv.data) return <Loading />;
  const c = conv.data;
  const current = c.evaluation;
  const archived = viewId !== null && past.data ? past.data : null;
  const ev = archived ?? current;
  const archivedItem = archived ? history.data?.find((h) => h.id === archived.id) : undefined;
  const currentById = new Map((current?.results ?? []).map((r) => [r.criterion.code, r]));
  const onChanged = (t: string) => { setToast({ text: t }); conv.reload(); refresh(); };
  const onError = (t: string) => setToast({ text: t, tone: 'danger' });

  return (
    <>
      <BackLink />
      <div className="conv-header">
        <div className="conv-title">
          <h1 className="mono">{c.id}</h1>
          <div className="meta-line">
            <span>{c.channel === 'VOICE' ? <Headphones size={16} /> : <MessageSquare size={16} />}{CHANNELS[c.channel]}</span>
            <span>{LANGS[c.language] ?? c.language}</span>
            <span><UserRound size={16} />{c.operatorName ?? 'Оператор не определён'}</span>
            <span>{c.dateLabel}</span>
            {c.durationLabel && <span><Clock size={16} />{c.durationLabel}</span>}
            <StatusBadge status={c.status} />
          </div>
        </div>
        {okk && (
          <button className="btn btn-primary" onClick={evaluate} disabled={pending || c.openAppeals > 0}
                  title={c.openAppeals > 0 ? 'Сначала рассмотрите открытые апелляции' : 'Новая оценка. Прошлая останется в истории'}>
            {c.status === 'NOT_EVALUATED' ? <><Play size={18} />Оценить</> : <><RefreshCw size={18} />Переоценить</>}
          </button>
        )}
      </div>

      <div className="conv-grid">
        <div className="conv-left">
          {!current && c.status === 'NOT_EVALUATED' && (
            <div className="alert alert-info"><Info size={20} /><div>Диалог ещё не оценён. {okk ? 'Нажмите «Оценить» — результат появится через несколько секунд.' : 'Оценка появится после запуска отделом качества.'}</div></div>
          )}
          {pending && <div className="alert alert-info"><RefreshCw size={20} className="spin" /><div>AI оценивает диалог. Страница обновится сама.{history.data && history.data.length > 1 && ' Пока можно открыть прошлую оценку в истории ниже.'}</div></div>}
          {archived && (
            <div className="alert alert-warn archive-banner">
              <History size={20} />
              <div><strong>Архивная оценка</strong> от {archivedItem?.createdAt ?? '—'} · {archived.provider} / {archived.model} · чек-лист v{archived.checklistVersion}.
                Только просмотр: апелляции подаются к текущей оценке. Где ответ отличается от текущего, это отмечено.</div>
              <button className="btn btn-sm" onClick={() => setViewId(null)}><ArrowLeft size={16} />К текущей</button>
            </div>
          )}
          {ev?.status === 'FAILED' && <ErrorBox message={ev.error ?? 'Оценка не удалась'} onRetry={okk && !archived ? evaluate : undefined} />}
          {ev?.status === 'DONE' && (
            <>
              <ScorePanel ev={ev} archived={!!archived} />
              {ev.sections.map((s) => (
                <Fragment key={s.title}>
                  <h2 className="section-title">{s.title}<span className="tag tag-neutral">раздел {fmtScore(s.finalScore)}</span></h2>
                  {ev.results.filter((r) => r.criterion.section === s.title).map((r) => (
                    <CriterionCard key={r.id} r={r} c={c} onJump={jump} onChanged={onChanged} onError={onError}
                                   archived={!!archived} currentResult={archived ? currentById.get(r.criterion.code) : undefined} />
                  ))}
                </Fragment>
              ))}
              {ev.results.filter((r) => !ev.sections.some((s) => s.title === r.criterion.section)).map((r) => (
                <CriterionCard key={r.id} r={r} c={c} onJump={jump} onChanged={onChanged} onError={onError}
                               archived={!!archived} currentResult={archived ? currentById.get(r.criterion.code) : undefined} />
              ))}
            </>
          )}
          {history.data && history.data.length > 0 && (
            <HistoryCard items={history.data} viewId={archived?.id ?? null} loadingId={past.loading ? viewId : null}
                         onOpen={(hid, latest) => setViewId(latest ? null : hid)} />
          )}
        </div>
        <div className="conv-right">
          <Transcript c={c} highlight={highlight} audio={audio} />
        </div>
      </div>
      {toast && <Toast text={toast.text} tone={toast.tone} onClose={closeToast} />}
    </>
  );
}

function BackLink() {
  return <Link to="/conversations" className="back"><ArrowLeft size={18} />К списку диалогов</Link>;
}

const fmtUsd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`);

/** Every evaluation of this dialog, newest first. Lets OKK compare a re-evaluation with the previous result. */
function HistoryCard({ items, viewId, loadingId, onOpen }: {
  items: HistoryItem[]; viewId: string | null; loadingId: string | null; onOpen: (id: string, latest: boolean) => void;
}) {
  return (
    <section className="card history">
      <header className="card-head pad-head">
        <h2><History size={18} />История оценок</h2>
        <span className="muted small">{items.length === 1 ? 'Пока одна оценка' : `${items.length} оценки · новые сверху`}</span>
      </header>
      <div className="table-wrap">
        <table className="table compact">
          <thead><tr><th>Когда</th><th>Модель</th><th>Чек-лист</th><th className="num">AI</th><th className="num">Итог</th><th className="num">Стоимость</th><th /></tr></thead>
          <tbody>
            {items.map((h, i) => {
              const prev = items[i + 1];
              const delta = h.finalScore !== null && prev?.finalScore !== null && prev?.finalScore !== undefined ? h.finalScore - prev.finalScore : null;
              const viewing = viewId ? viewId === h.id : h.latest;
              return (
                <tr key={h.id} className={viewing ? 'selected' : ''}>
                  <td>
                    <div className="strong">{h.createdAt}</div>
                    <div className="small muted">{h.latest ? 'текущая' : 'архив'}{h.appeals > 0 && ` · апелляций: ${h.appeals}`}</div>
                  </td>
                  <td><div>{h.model}</div><div className="small muted">{h.provider}{h.simulated && ' · демо'}</div></td>
                  <td>v{h.checklistVersion}</td>
                  <td className="num">{h.status === 'DONE' ? <ScoreBadge value={h.originalScore} /> : h.status === 'FAILED' ? <span className="tag tag-danger">ошибка</span> : <span className="tag tag-info">идёт</span>}</td>
                  <td className="num">
                    {h.status === 'DONE' && <ScoreBadge value={h.finalScore} />}
                    {delta !== null && delta !== 0 && <div className={`small ${delta > 0 ? 'tone-good' : 'tone-bad'}`}>{delta > 0 ? '+' : ''}{fmtScore(delta)} к прошлой</div>}
                  </td>
                  <td className="num small">{fmtUsd(h.costUsd)}{h.tokensIn !== null && <div className="muted">{h.tokensIn + (h.tokensOut ?? 0)} ток.</div>}</td>
                  <td className="num">
                    {viewing ? <span className="small muted">открыта</span> : (
                      <button className="btn btn-sm" disabled={h.status === 'PENDING' || loadingId === h.id} onClick={() => onOpen(h.id, h.latest)}>
                        {loadingId === h.id ? <Loader2 size={15} className="spin" /> : <Eye size={15} />}Открыть
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScorePanel({ ev, archived }: { ev: Evaluation; archived: boolean }) {
  const changed = ev.originalScore !== ev.finalScore;
  return (
    <div className="card score-panel">
      <div className="score-main">
        {ev.finalScore === null ? <span className="muted">{ev.scoreNote ?? 'Не рассчитывается'}</span> : <ScoreBadge value={ev.finalScore} large />}
        <div>
          <span className="label">{archived ? 'Итог архивной оценки' : 'Итоговый балл'}</span>
          {changed && <div className="small">Оценка AI: <strong>{fmtScore(ev.originalScore)}</strong> · изменено после апелляции</div>}
          <div className="small muted"><Cpu size={14} />{ev.provider} / {ev.model} · чек-лист v{ev.checklistVersion}{ev.correctionsUsed > 0 && ` · учтено ошибок AI: ${ev.correctionsUsed}`}</div>
        </div>
      </div>
      {ev.grossError ? (
        <div className="alert alert-danger compact"><ShieldAlert size={20} /><div><strong>Грубая ошибка.</strong> Подробности в критерии «Грубые ошибки».</div></div>
      ) : (
        <div className="alert alert-ok compact"><ShieldCheck size={20} /><div>Грубых нарушений не найдено</div></div>
      )}
      {ev.simulated && <div className="alert alert-warn compact"><FlaskConical size={20} /><div>Демо-оценка без AI (MOCK). Подключите модель в «Модели AI».</div></div>}
    </div>
  );
}

function CriterionCard({ r, c, onJump, onChanged, onError, archived, currentResult }: {
  r: CriterionResult; c: Conversation; onJump: (seq: number) => void;
  onChanged: (t: string) => void; onError: (t: string) => void; archived: boolean; currentResult?: CriterionResult;
}) {
  const { role, operatorId } = useSession();
  const [form, setForm] = useState(false);
  const cr = r.criterion;
  const changed = r.original.isNa !== r.final.isNa || r.original.value !== r.final.value;
  const flag = cr.answerType === 'FLAG';
  const failed = flag ? (r.final.value ?? 0) > 0 : !r.final.isNa && r.final.value === 0;
  const differsFromCurrent = archived && currentResult
    && (currentResult.final.isNa !== r.final.isNa || currentResult.final.value !== r.final.value);
  return (
    <article className={`card crit${failed ? ' crit-fail' : ''}${differsFromCurrent ? ' crit-diff' : ''}`}>
      <header className="crit-head">
        <div className="crit-title">
          {failed ? <XCircle size={18} className="tone-bad" /> : r.final.isNa ? <MinusCircle size={18} className="muted" /> : <CheckCircle2 size={18} className="tone-good" />}
          <div>
            <h3>{cr.title}</h3>
            <span className="muted small">{flag ? 'Отмечается отдельно, без баллов' : `Вес ${fmtScore(cr.weight)}`}</span>
          </div>
        </div>
        <div className="crit-result">
          <AnswerTag c={cr} a={r.final} />
          {!flag && <span className="points">{r.final.isNa ? 'не учитывается' : `${fmtScore(r.final.points)} из ${fmtScore(r.final.maxPoints)} баллов`}</span>}
        </div>
      </header>
      <p className="crit-text">{r.explanation}</p>
      {r.evidence.length > 0 && (
        <div className="evidence">
          {r.evidence.map((e) => (
            <button key={e.messageSeq} className="ev-chip" onClick={() => onJump(e.messageSeq)} title={e.quote ?? ''}>
              {c.channel === 'VOICE' ? <Play size={13} /> : <MessageSquareText size={13} />}реплика #{e.messageSeq}
            </button>
          ))}
        </div>
      )}
      {differsFromCurrent && currentResult && (
        <div className="changed"><History size={15} />В архиве: <strong>{answerLabel(cr, r.final)}</strong> → в текущей оценке: <strong>{answerLabel(cr, currentResult.final)}</strong></div>
      )}
      {changed && (
        <div className="changed">AI поставил: <strong>{answerLabel(cr, r.original)}</strong> → после апелляции: <strong>{answerLabel(cr, r.final)}</strong></div>
      )}
      {r.decision && (
        <div className={`decision decision-${r.decision.status === 'ACCEPTED' ? 'ok' : 'no'}`}>
          <Scale size={16} />Апелляция {r.decision.status === 'ACCEPTED' ? 'принята' : 'отклонена'}: {r.decision.reason}
        </div>
      )}
      <footer className="crit-foot">
        {r.confidence !== null ? <span className="muted small"><Gauge size={14} />Уверенность AI: {Math.round(r.confidence * 100)}%</span> : <span />}
        {!archived && (r.openAppealId ? (
          role === 'OKK'
            ? <Link className="btn btn-sm" to={`/appeals?open=${r.openAppealId}`}><Scale size={16} />Рассмотреть апелляцию</Link>
            : <span className="tag tag-info">Апелляция на рассмотрении</span>
        ) : role === 'OPERATOR' && (
          <button className="btn btn-sm" onClick={() => setForm(!form)}><Scale size={16} />Не согласен — оспорить</button>
        ))}
      </footer>
      {form && !archived && <AppealForm r={r} operatorId={operatorId ?? c.operatorId ?? undefined}
                                        onDone={() => { setForm(false); onChanged('Апелляция отправлена в отдел качества'); }} onError={onError} />}
    </article>
  );
}

function AppealForm({ r, operatorId, onDone, onError }: { r: CriterionResult; operatorId?: string; onDone: () => void; onError: (t: string) => void }) {
  const opts = answerOptions(r.criterion);
  const [comment, setComment] = useState('');
  const [desired, setDesired] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const d = opts.find((o) => o.key === desired)?.answer ?? null;
      await api.createAppeal(r.id, comment.trim(), d, operatorId);
      onDone();
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="inline-form">
      <label className="field">Почему вы не согласны?
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: клиент спрашивал про общий тариф, идентификация не требовалась" />
      </label>
      <label className="field">Какая оценка, по-вашему, правильная? <span className="muted">(необязательно)</span>
        <select value={desired} onChange={(e) => setDesired(e.target.value)}>
          <option value="">Не указывать</option>
          {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
      <div className="row-end">
        <button className="btn btn-primary" disabled={busy || !comment.trim()} onClick={send}>{busy ? 'Отправка…' : 'Отправить апелляцию'}</button>
      </div>
    </div>
  );
}

// ---------- transcript ----------
const MASK = /(\[[^\]]*скрыт[^\]]*\])/gi;
const IS_MASK = /^\[[^\]]*скрыт[^\]]*\]$/i;
function withMasks(text: string) {
  return text.split(MASK).map((part, i) => (IS_MASK.test(part) ? <span key={i} className="mask">{part.replace(/[[\]]/g, '')}</span> : <Fragment key={i}>{part}</Fragment>));
}
const ROLE: Record<Message['role'], { label: string; icon: ReactNode }> = {
  client: { label: 'Клиент', icon: <User size={15} /> },
  operator: { label: 'Оператор', icon: <UserRound size={15} /> },
  bot: { label: 'Бот', icon: <Bot size={15} /> },
  system: { label: 'Система', icon: <Info size={15} /> },
};

/* ---------- Audio: play the fragment of a call that belongs to one message ---------- */

const LEAD = 1;   // start a bit earlier so the first word is not cut
const TAIL = 0.5;

type AudioCtl = ReturnType<typeof useAudio>;

/**
 * Call messages have real timestamps (ISO); the backend stores offset_sec = seconds since the first message.
 * The mp3 is usually a few seconds shorter than the transcript, so when the transcript is longer
 * we map transcript time to audio time proportionally (offset × duration / transcript span).
 */
function useAudio(id: string, transcriptSpan: number) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<AudioSource | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState<number | null>(null);   // current position in transcript seconds
  const stopAt = useRef<number | null>(null);               // audio seconds where the fragment ends
  const pending = useRef<{ from: number; to: number | null } | null>(null);
  const spanRef = useRef(transcriptSpan);
  spanRef.current = transcriptSpan;

  const ratio = () => {
    const d = ref.current?.duration;
    if (!d || !Number.isFinite(d) || spanRef.current <= d) return 1;
    return d / spanRef.current;
  };

  const load = useCallback(async () => {
    setState('loading');
    try {
      const s = await api.audio(id);
      setSrc(s);
      setState(s.streamUrl ? 'idle' : 'error');
    } catch { setState('error'); }
  }, [id]);

  const start = (from: number, to: number | null) => {
    const a = ref.current;
    if (!a) return;
    const k = ratio();
    a.currentTime = Math.max(0, from * k - LEAD);
    stopAt.current = to === null ? null : to * k + TAIL;
    void a.play().catch(() => undefined);
  };

  /** Play transcript seconds [from, to). Loads the recording first if needed. */
  const playRange = (from: number, to: number | null) => {
    if (ref.current && ref.current.readyState >= 1) start(from, to);
    else {
      pending.current = { from, to };
      if (!src || !src.streamUrl) void load();
    }
  };

  const playMessage = (messages: Message[], seq: number) => {
    const i = messages.findIndex((m) => m.seq === seq);
    const m = messages[i];
    if (!m || m.offsetSec === null) return;
    const from = m.offsetSec;
    const next = messages.slice(i + 1).find((n) => n.offsetSec !== null && n.offsetSec > from);
    playRange(from, next?.offsetSec ?? null);
  };

  const stop = () => { stopAt.current = null; ref.current?.pause(); };

  const events = {
    onLoadedMetadata: () => {
      const p = pending.current;
      pending.current = null;
      if (p) start(p.from, p.to);
    },
    onTimeUpdate: () => {
      const a = ref.current;
      if (!a) return;
      setTime(a.currentTime / ratio());
      if (stopAt.current !== null && a.currentTime >= stopAt.current) { a.pause(); stopAt.current = null; }
    },
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onError: () => { setSrc(null); setState('error'); setPlaying(false); },   // link expired: next click asks again
  };

  return { ref, src, state, playing, time, load, playMessage, stop, events };
}

const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function Transcript({ c, highlight, audio }: { c: Conversation; highlight: number | null; audio: AudioCtl }) {
  const start = c.operatorStartSeq;
  const voice = c.channel === 'VOICE';
  const hiddenCount = start ? c.messages.filter((m) => m.seq < start).length : 0;
  const [showBot, setShowBot] = useState(false);
  useEffect(() => { if (highlight !== null && start && highlight < start) setShowBot(true); }, [highlight, start]);

  // message that is being played right now (last one whose offset is <= current time;
  // + LEAD so the clicked message lights up at once, not after the 1-second lead-in)
  let nowSeq: number | null = null;
  if (voice && audio.playing && audio.time !== null) {
    for (const m of c.messages) if (m.offsetSec !== null && m.offsetSec <= audio.time + LEAD + 0.05) nowSeq = m.seq;
  }
  useEffect(() => { if (nowSeq !== null && start && nowSeq < start) setShowBot(true); }, [nowSeq, start]);

  const visible = c.messages.filter((m) => showBot || !start || m.seq >= start);

  const onMessageClick = (m: Message) => {
    if (!voice || m.offsetSec === null) return;
    if (window.getSelection()?.toString()) return;            // user is selecting text, not clicking
    if (audio.playing && nowSeq === m.seq) audio.stop();
    else audio.playMessage(c.messages, m.seq);
  };

  return (
    <section className="card transcript">
      <header className="transcript-head">
        <h2>Стенограмма</h2>
        <span className="muted small">{c.messages.length} реплик</span>
      </header>
      {voice && <AudioPlayer audio={audio} />}
      <div className="messages">
        {hiddenCount > 0 && (
          <button className="collapse-btn" onClick={() => setShowBot(!showBot)}>
            {showBot ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showBot ? 'Скрыть' : 'Показать'} часть до подключения оператора ({hiddenCount} реплик бота и клиента)
          </button>
        )}
        {visible.map((m) => {
          const playable = voice && m.offsetSec !== null;
          const isNow = nowSeq === m.seq;
          return (
            <div key={m.seq} id={`msg-${m.seq}`} onClick={() => onMessageClick(m)}
                 className={`msg msg-${m.role}${highlight === m.seq ? ' msg-hl' : ''}${m.seq === start ? ' msg-start' : ''}${playable ? ' msg-playable' : ''}${isNow ? ' msg-now' : ''}`}>
              {m.seq === start && <div className="start-line">Оператор подключился</div>}
              <div className="msg-meta">
                {ROLE[m.role].icon}<strong>{ROLE[m.role].label}</strong>
                <span>#{m.seq} · {playable ? fmtClock(m.offsetSec!) : m.timeLabel}</span>
                {playable && (
                  <button className="msg-play" aria-label={isNow ? 'Остановить' : `Прослушать реплику #${m.seq}`}
                          onClick={(e) => { e.stopPropagation(); onMessageClick(m); }}>
                    {isNow ? <Pause size={15} /> : <Play size={15} />}{isNow ? 'Стоп' : 'Слушать'}
                  </button>
                )}
              </div>
              <div className="msg-text">{withMasks(m.text)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AudioPlayer({ audio }: { audio: AudioCtl }) {
  const { src, state } = audio;
  return (
    <div className="audio-box">
      {src?.streamUrl ? (
        <audio ref={audio.ref} controls preload="metadata" src={src.streamUrl} {...audio.events} />
      ) : (
        <button className="btn btn-sm" onClick={() => void audio.load()} disabled={state === 'loading'}>
          <Volume2 size={16} />{state === 'loading' ? 'Получаем запись…' : 'Загрузить запись звонка'}
        </button>
      )}
      {state === 'error' && <span className="text-danger small"><AlertTriangle size={14} />Запись недоступна, попробуйте ещё раз</span>}
      {src?.audioPageUrl && <a className="small" href={src.audioPageUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Открыть запись в новой вкладке</a>}
      <span className="muted small">Нажмите на реплику — прозвучит именно этот фрагмент. То, что звучит сейчас, подсвечивается.</span>
    </div>
  );
}
