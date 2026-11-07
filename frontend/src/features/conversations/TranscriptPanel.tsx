import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Headphones, MessageSquare, RefreshCw } from 'lucide-react';
import type { AudioSource, Conversation, Evidence, Message, Scope } from '../../shared/api/types';
import { api } from '../../shared/api/client';
import { Badge, ErrorBox } from '../../shared/ui';

export function safeMediaUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return ['https:', 'http:'].includes(url.protocol) &&
      (url.protocol === 'https:' || url.origin === window.location.origin)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
const labels = { client: 'Клиент', operator: 'Оператор', bot: 'Бот', system: 'Система' };
function MessageText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\[(?:Имя скрыто|Персональные данные скрыты|Данные идентификации скрыты)\])/g)
        .map((part, i) =>
          /^\[.*скрыт/.test(part) ? (
            <span key={i} className="redacted" title={part}>
              скрыто
            </span>
          ) : (
            part
          ),
        )}
    </>
  );
}
export function TranscriptPanel({
  conversation,
  evidence,
  scope,
}: {
  conversation: Conversation;
  evidence: Evidence | null;
  scope: Scope;
}) {
  const [expanded, setExpanded] = useState(false);
  const [audioSource, setAudioSource] = useState<AudioSource | null>(null);
  const [audioError, setAudioError] = useState('');
  const [audioLoading, setAudioLoading] = useState(false);
  const [currentSeq, setCurrentSeq] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const automaticRetry = useRef(false);
  const pendingSeek = useRef<number | null>(null);
  const alive = useRef(true);
  const requestId = useRef(0);
  const before =
    conversation.operatorStartSeq === null
      ? []
      : conversation.messages.filter((m) => m.seq < conversation.operatorStartSeq!);
  const rest = conversation.messages.filter((m) => !before.includes(m));
  async function loadAudio() {
    const id = ++requestId.current;
    setAudioLoading(true);
    setAudioError('');
    try {
      const source = await api.audio(conversation.id, scope);
      if (alive.current && id === requestId.current) {
        setAudioSource(source);
        if (!safeMediaUrl(source.streamUrl))
          setAudioError('Аудиопоток недоступен. В моках реальных записей нет.');
      }
    } catch (e) {
      if (alive.current && id === requestId.current)
        setAudioError(e instanceof Error ? e.message : 'Не удалось загрузить аудио.');
    } finally {
      if (alive.current && id === requestId.current) setAudioLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    if (conversation.channel === 'VOICE') void loadAudio();
    return () => {
      alive.current = false;
      requestId.current++;
    };
  }, [conversation.id]);
  useEffect(() => {
    if (!evidence) return;
    if (before.some((m) => m.seq === evidence.messageSeq)) setExpanded(true);
    pendingSeek.current = evidence.offsetSec;
    if (audio.current && evidence.offsetSec !== null && audio.current.readyState >= 1) {
      audio.current.currentTime = evidence.offsetSec;
      pendingSeek.current = null;
    }
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`msg-${evidence.messageSeq}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [evidence, expanded]);
  function renderMessage(m: Message) {
    return (
      <article
        key={m.seq}
        id={`msg-${m.seq}`}
        tabIndex={-1}
        aria-label={`Реплика ${m.seq}, ${labels[m.role]}`}
        className={`message ${m.role} ${evidence?.messageSeq === m.seq ? 'highlighted' : ''} ${currentSeq === m.seq ? 'playing' : ''}`}
      >
        <div className="message-meta">
          <span>
            {labels[m.role]} <span className="muted">#{m.seq}</span>
          </span>
          <time title={m.timestampRaw}>{m.timeLabel}</time>
        </div>
        <p>
          <MessageText text={m.text} />
        </p>
      </article>
    );
  }
  const external = safeMediaUrl(audioSource?.audioPageUrl ?? null);
  return (
    <section className="panel transcript-panel">
      <div className="panel-top">
        <h2 className="row">
          {conversation.channel === 'VOICE' ? (
            <Headphones size={18} />
          ) : (
            <MessageSquare size={18} />
          )}
          Транскрипт
        </h2>
        <Badge>
          {conversation.messages.length} реплик · {conversation.language}
        </Badge>
      </div>
      {conversation.channel === 'VOICE' && (
        <div className="audio-panel">
          <div className="row between">
            <strong>Запись звонка</strong>
            <button
              className="text-button"
              disabled={audioLoading}
              onClick={() => {
                automaticRetry.current = false;
                void loadAudio();
              }}
            >
              <RefreshCw size={14} />
              Обновить запись
            </button>
          </div>
          {safeMediaUrl(audioSource?.streamUrl ?? null) && (
            <audio
              ref={audio}
              controls
              preload="metadata"
              src={safeMediaUrl(audioSource?.streamUrl ?? null)}
              onLoadedMetadata={() => {
                if (audio.current && pendingSeek.current !== null) {
                  audio.current.currentTime = pendingSeek.current;
                  pendingSeek.current = null;
                }
              }}
              onPlay={() => {
                if (
                  audioSource?.expiresAt &&
                  Date.parse(audioSource.expiresAt) <= Date.now() &&
                  !automaticRetry.current
                ) {
                  automaticRetry.current = true;
                  pendingSeek.current = audio.current?.currentTime ?? null;
                  void loadAudio();
                }
              }}
              onError={() => {
                if (!automaticRetry.current) {
                  automaticRetry.current = true;
                  pendingSeek.current = audio.current?.currentTime ?? null;
                  void loadAudio();
                } else
                  setAudioError(
                    'Запись не воспроизводится. Обновите ссылку или откройте внешний плеер.',
                  );
              }}
              onTimeUpdate={() => {
                const time = audio.current?.currentTime ?? 0;
                const active = conversation.messages
                  .filter((m) => m.offsetSec !== null && m.offsetSec <= time)
                  .at(-1);
                setCurrentSeq(active?.seq ?? null);
              }}
            >
              Ваш браузер не поддерживает аудио.
            </audio>
          )}
          <ErrorBox message={audioError} />
          {external && (
            <a
              className="button-link"
              href={external}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              <ExternalLink size={15} />
              Открыть запись
            </a>
          )}
          {!external && (
            <p className="muted text-sm">
              Внешний плеер появится, когда backend предоставит audioPageUrl.
            </p>
          )}
        </div>
      )}
      <div className="transcript-scroll">
        {before.length > 0 && (
          <div className="bot-context">
            <button
              className="context-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              Бот до подключения оператора · {before.length} реплик{' '}
              <span>{expanded ? 'Свернуть ↑' : 'Развернуть ↓'}</span>
            </button>
            {expanded && <div className="message-list">{before.map(renderMessage)}</div>}
          </div>
        )}
        <div className="message-list">{rest.map(renderMessage)}</div>
        <div className="transcript-end">Конец диалога</div>
      </div>
    </section>
  );
}
