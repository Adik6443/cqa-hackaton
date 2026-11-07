import { Fragment, useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  AlertTriangle, ArrowLeft, Bot, ChevronDown, ChevronUp, Clock, ExternalLink, FlaskConical, Headphones, Info, MessageSquare,
  Play, RefreshCw, Scale, ShieldAlert, User, UserRound, Volume2,
} from 'lucide-react';
import { api, type AudioSource, type Conversation, type CriterionResult, type Message } from '../api';
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

  const [highlight, setHighlight] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'danger' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const evaluate = async () => {
    try { await api.evaluate(id); setToast({ text: 'Оценка запущена' }); conv.reload(); }
    catch (e) { setToast({ text: (e as Error).message, tone: 'danger' }); }
  };

  const jump = (seq: number, offset: number | null) => {
    setHighlight(seq);
    document.getElementById(`msg-${seq}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (audioRef.current && offset !== null) { audioRef.current.currentTime = offset; }
  };

  if (conv.error) return <><BackLink /><ErrorBox message={conv.error} onRetry={conv.reload} /></>;
  if (!conv.data) return <Loading />;
  const c = conv.data;
  const ev = c.evaluation;

  return (
    <>
      <BackLink />
      <div className="conv-header card">
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
                  title={c.openAppeals > 0 ? 'Сначала рассмотрите открытые апелляции' : undefined}>
            {c.status === 'NOT_EVALUATED' ? <><Play size={18} />Оценить</> : <><RefreshCw size={18} />Переоценить</>}
          </button>
        )}
      </div>

      <div className="conv-grid">
        <div className="conv-left">
          {!ev && c.status === 'NOT_EVALUATED' && (
            <div className="card notice"><Info size={20} />Диалог ещё не оценён. {okk ? 'Нажмите «Оценить» — результат появится через несколько секунд.' : 'Оценка появится после запуска отделом качества.'}</div>
          )}
          {pending && <div className="card notice"><RefreshCw size={20} className="spin" />AI оценивает диалог. Страница обновится сама.</div>}
          {ev?.status === 'FAILED' && <ErrorBox message={ev.error ?? 'Оценка не удалась'} onRetry={okk ? evaluate : undefined} />}
          {ev?.status === 'DONE' && (
            <>
              <ScorePanel c={c} />
              {ev.sections.map((s) => (
                <Fragment key={s.title}>
                  <h2 className="section-title">{s.title}<span className="muted">{fmtScore(s.finalScore)}%</span></h2>
                  {ev.results.filter((r) => r.criterion.section === s.title).map((r) => (
                    <CriterionCard key={r.id} r={r} c={c} onJump={jump}
                                   onChanged={(t) => { setToast({ text: t }); conv.reload(); refresh(); }}
                                   onError={(t) => setToast({ text: t, tone: 'danger' })} />
                  ))}
                </Fragment>
              ))}
              {ev.results.filter((r) => !ev.sections.some((s) => s.title === r.criterion.section)).map((r) => (
                <CriterionCard key={r.id} r={r} c={c} onJump={jump}
                               onChanged={(t) => { setToast({ text: t }); conv.reload(); refresh(); }}
                               onError={(t) => setToast({ text: t, tone: 'danger' })} />
              ))}
            </>
          )}
        </div>
        <div className="conv-right">
          <Transcript c={c} highlight={highlight} audioRef={audioRef} />
        </div>
      </div>
      {toast && <Toast text={toast.text} tone={toast.tone} onClose={closeToast} />}
    </>
  );
}

function BackLink() {
  return <Link to="/conversations" className="back"><ArrowLeft size={18} />К списку диалогов</Link>;
}

function ScorePanel({ c }: { c: Conversation }) {
  const ev = c.evaluation!;
  const changed = ev.originalScore !== ev.finalScore;
  return (
    <div className="card score-panel">
      <div className="score-main">
        <span className="label">Итоговый балл</span>
        {ev.finalScore === null ? <span className="muted">{ev.scoreNote ?? 'Не рассчитывается'}</span> : <ScoreBadge value={ev.finalScore} large />}
        {changed && <span className="muted small">Оценка AI: {fmtScore(ev.originalScore)} · изменено после апелляции</span>}
      </div>
      <div className="score-side">
        {ev.grossError ? (
          <div className="alert alert-danger compact"><ShieldAlert size={20} /><div><strong>Грубая ошибка.</strong> Подробности в критерии «Грубые ошибки».</div></div>
        ) : (
          <div className="alert alert-ok compact"><ShieldAlert size={20} />Грубых нарушений не найдено</div>
        )}
        {ev.simulated && <div className="alert alert-warn compact"><FlaskConical size={20} />Демо-оценка без AI (MOCK). Подключите модель в «Модели AI».</div>}
        <div className="muted small">Модель: {ev.provider} / {ev.model} · чек-лист v{ev.checklistVersion}{ev.correctionsUsed > 0 && ` · учтено прошлых ошибок AI: ${ev.correctionsUsed}`}</div>
      </div>
    </div>
  );
}

function CriterionCard({ r, c, onJump, onChanged, onError }: {
  r: CriterionResult; c: Conversation; onJump: (seq: number, offset: number | null) => void;
  onChanged: (t: string) => void; onError: (t: string) => void;
}) {
  const { role, operatorId } = useSession();
  const [form, setForm] = useState(false);
  const cr = r.criterion;
  const changed = r.original.isNa !== r.final.isNa || r.original.value !== r.final.value;
  const flag = cr.answerType === 'FLAG';
  const failed = flag ? (r.final.value ?? 0) > 0 : !r.final.isNa && r.final.value === 0;
  return (
    <article className={`card crit${failed ? ' crit-fail' : ''}`}>
      <header className="crit-head">
        <div>
          <h3>{cr.title}</h3>
          <span className="muted small">{flag ? 'Отмечается отдельно, без баллов' : `Вес ${fmtScore(cr.weight)}`}</span>
        </div>
        <div className="crit-result">
          <AnswerTag c={cr} a={r.final} />
          {!flag && <span className="points">{r.final.isNa ? 'не учитывается' : `${fmtScore(r.final.points)} из ${fmtScore(r.final.maxPoints)}`}</span>}
        </div>
      </header>
      <p className="crit-text">{r.explanation}</p>
      {r.evidence.length > 0 && (
        <div className="evidence">
          <span className="muted small">Основание:</span>
          {r.evidence.map((e) => (
            <button key={e.messageSeq} className="ev-chip" onClick={() => onJump(e.messageSeq, e.offsetSec)} title={e.quote ?? ''}>
              реплика #{e.messageSeq}
            </button>
          ))}
        </div>
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
        {r.confidence !== null && <span className="muted small">Уверенность AI: {Math.round(r.confidence * 100)}%</span>}
        {r.openAppealId ? (
          role === 'OKK'
            ? <Link className="btn btn-sm" to={`/appeals?open=${r.openAppealId}`}><Scale size={16} />Рассмотреть апелляцию</Link>
            : <span className="tag tag-info">Апелляция на рассмотрении</span>
        ) : role === 'OPERATOR' && (
          <button className="btn btn-sm" onClick={() => setForm(!form)}><Scale size={16} />Не согласен — оспорить</button>
        )}
      </footer>
      {form && <AppealForm r={r} operatorId={operatorId ?? c.operatorId ?? undefined}
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

function Transcript({ c, highlight, audioRef }: { c: Conversation; highlight: number | null; audioRef: MutableRefObject<HTMLAudioElement | null> }) {
  const start = c.operatorStartSeq;
  const hiddenCount = start ? c.messages.filter((m) => m.seq < start).length : 0;
  const [showBot, setShowBot] = useState(false);
  useEffect(() => { if (highlight !== null && start && highlight < start) setShowBot(true); }, [highlight, start]);
  const visible = c.messages.filter((m) => showBot || !start || m.seq >= start);
  return (
    <section className="card transcript">
      <header className="transcript-head">
        <h2>Стенограмма</h2>
        <span className="muted small">{c.messages.length} реплик</span>
      </header>
      {c.channel === 'VOICE' && <AudioPlayer id={c.id} audioRef={audioRef} />}
      <div className="messages">
        {hiddenCount > 0 && (
          <button className="collapse-btn" onClick={() => setShowBot(!showBot)}>
            {showBot ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showBot ? 'Скрыть' : 'Показать'} часть до подключения оператора ({hiddenCount} реплик бота и клиента)
          </button>
        )}
        {visible.map((m) => (
          <div key={m.seq} id={`msg-${m.seq}`} className={`msg msg-${m.role}${highlight === m.seq ? ' msg-hl' : ''}${m.seq === start ? ' msg-start' : ''}`}>
            {m.seq === start && <div className="start-line">Оператор подключился</div>}
            <div className="msg-meta">{ROLE[m.role].icon}<strong>{ROLE[m.role].label}</strong><span>#{m.seq} · {m.timeLabel}</span></div>
            <div className="msg-text">{withMasks(m.text)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AudioPlayer({ id, audioRef }: { id: string; audioRef: MutableRefObject<HTMLAudioElement | null> }) {
  const [src, setSrc] = useState<AudioSource | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const load = async () => {
    setState('loading');
    try { setSrc(await api.audio(id)); setState('idle'); } catch { setState('error'); }
  };
  if (!src) {
    return (
      <div className="audio-box">
        <button className="btn btn-sm" onClick={load} disabled={state === 'loading'}><Volume2 size={16} />{state === 'loading' ? 'Получаем запись…' : 'Прослушать запись'}</button>
        {state === 'error' && <span className="text-danger small"><AlertTriangle size={14} />Запись недоступна</span>}
      </div>
    );
  }
  return (
    <div className="audio-box">
      {src.streamUrl ? (
        <audio ref={audioRef} controls preload="metadata" src={src.streamUrl} onError={() => { setSrc(null); }} />
      ) : <span className="muted small">Плеер недоступен.</span>}
      {src.audioPageUrl && <a className="small" href={src.audioPageUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Открыть запись в новой вкладке</a>}
      <span className="muted small">Нажмите «реплика #N» в критерии — запись перемотается к этому месту.</span>
    </div>
  );
}
