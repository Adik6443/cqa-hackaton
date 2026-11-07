import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Headphones,
  MessageSquare,
  Play,
  Search,
} from 'lucide-react';
import { useSession } from '../app/Session';
import { api } from '../shared/api/client';
import type { Batch, ConversationSummary, Filters } from '../shared/api/types';
import { useAction, useQuery } from '../shared/hooks';
import {
  Badge,
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
  Score,
  Status,
  statusLabels,
} from '../shared/ui';

export function ConversationsPage() {
  const { scope, revision, refresh } = useSession();
  const okk = scope.role === 'OKK';
  const [params, setParams] = useSearchParams();
  const [groupId, setGroupId] = useState('DEV');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [listPoll, setListPoll] = useState(0);
  const action = useAction();
  const filters: Filters = {
    ...Object.fromEntries(params),
    page: Math.max(0, Number(params.get('page')) || 0),
    size: 10,
  };
  const query = useQuery(
    `list-${JSON.stringify(scope)}-${params}-${revision}`,
    () => api.conversations(scope, filters),
    listPoll,
  );
  useEffect(() => {
    setListPoll(query.data?.items.some((c) => c.status === 'PENDING') ? 2000 : 0);
  }, [query.data]);
  const progress = useQuery(
    `batch-${batch?.id ?? ''}`,
    async () => (batch ? api.batch(batch.id, scope) : null),
    batch?.status === 'PENDING' ? 2000 : 0,
  );
  useEffect(() => {
    if (progress.data) {
      setBatch(progress.data);
      if (progress.data.status !== 'PENDING') refresh();
    }
  }, [progress.data]);
  function filter(name: string, value: string) {
    const next = new URLSearchParams(params);
    value ? next.set(name, value) : next.delete(name);
    next.delete('page');
    setParams(next);
    setSelected([]);
  }
  function eligible(c: ConversationSummary) {
    return c.openAppeals === 0 && c.status !== 'PENDING';
  }
  async function evaluateAll() {
    const all: string[] = [];
    let page = 0;
    do {
      const result = await api.conversations(scope, { ...filters, page, size: 100 });
      all.push(...result.items.filter(eligible).map((c) => c.id));
      if ((page + 1) * 100 >= result.total) break;
      page++;
      if (page >= 100)
        throw new Error('Слишком много диалогов. Сузьте фильтры для пакетной оценки.');
    } while (page < 100);
    setBatch(await api.startBatch(all, scope));
    setSelected([]);
    refresh();
  }
  return (
    <>
      <PageTitle
        eyebrow="КОНТРОЛЬ КАЧЕСТВА / ДИАЛОГИ"
        title={okk ? 'Каждый диалог — в фокусе' : 'Мои оценки'}
        description={
          okk
            ? 'Оценивайте коммуникацию, проверяйте контекст и помогайте команде расти.'
            : 'Разбирайте обратную связь и оспаривайте оценки с учётом контекста.'
        }
        actions={
          <Badge tone="green">
            <span className="status-dot" />
            Рабочее пространство
          </Badge>
        }
      />
      {okk && (
        <section className="import-panel">
          <div className="import-icon">
            <ArrowDownToLine size={23} />
          </div>
          <div>
            <h2>Загрузить диалоги</h2>
            <p>Импорт группы через backend · в демо создаются 3 вымышленных диалога</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                const result = await api.importGroup(groupId.trim(), scope);
                setNotice(`Импортировано: ${result.imported}. Пропущено: ${result.skipped}.`);
                refresh();
              });
            }}
          >
            <label className="sr-only" htmlFor="group-id">
              groupId
            </label>
            <input
              id="group-id"
              placeholder="groupId, например DEV"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              required
              maxLength={80}
            />
            <button className="primary" disabled={action.busy}>
              <ArrowDownToLine size={16} />
              Загрузить из API
            </button>
          </form>
        </section>
      )}
      {notice && (
        <div className="success-note" role="status">
          {notice}
        </div>
      )}
      <ErrorBox message={action.error} />
      {batch && (
        <section className="panel batch-panel" aria-live="polite">
          <div className="row between">
            <strong>{batch.status === 'PENDING' ? 'Оценка диалогов' : 'Пакет завершён'}</strong>
            <span>
              Оценено {batch.done} из {batch.total} · ошибок {batch.failed}
            </span>
          </div>
          <progress max={batch.total} value={batch.done + batch.failed} />
          <ErrorBox message={progress.error} retry={progress.reload} />
          {batch.errors.map((e) => (
            <p key={e.conversationId}>
              {e.conversationId}: {e.message}
            </p>
          ))}
        </section>
      )}
      <section className="panel">
        <div className="panel-top">
          <div className="row">
            <h2>{okk ? 'Все диалоги' : 'Назначенные мне'}</h2>
            <Badge>{query.data?.total ?? '…'}</Badge>
          </div>
          {okk && (
            <div className="actions">
              <button
                disabled={!selected.length || action.busy || batch?.status === 'PENDING'}
                onClick={() =>
                  void action.run(async () => {
                    setBatch(await api.startBatch(selected, scope));
                    setSelected([]);
                    refresh();
                  })
                }
              >
                <Play size={14} />
                Оценить выбранные{selected.length ? ` (${selected.length})` : ''}
              </button>
              <button
                className="primary"
                disabled={action.busy || batch?.status === 'PENDING' || !query.data?.total}
                onClick={() => void action.run(evaluateAll)}
              >
                Оценить все по фильтру
              </button>
            </div>
          )}
        </div>
        <div className="filters">
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="Поиск диалогов"
              placeholder="ID, оператор или группа"
              value={params.get('search') ?? ''}
              onChange={(e) => filter('search', e.target.value)}
            />
          </label>
          <select
            aria-label="Статус оценки"
            value={params.get('status') ?? ''}
            onChange={(e) => filter('status', e.target.value)}
          >
            <option value="">Все статусы</option>
            {Object.entries(statusLabels).map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
          <select
            aria-label="Канал"
            value={params.get('channel') ?? ''}
            onChange={(e) => filter('channel', e.target.value)}
          >
            <option value="">Все каналы</option>
            <option value="CHAT">Чат</option>
            <option value="VOICE">Звонок</option>
          </select>
          <select
            aria-label="Язык"
            value={params.get('language') ?? ''}
            onChange={(e) => filter('language', e.target.value)}
          >
            <option value="">Все языки</option>
            {['RU', 'KZ', 'EN'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <details className="extra-filters">
            <summary>Дата и балл</summary>
            <div>
              <label className="field">
                С
                <input
                  type="date"
                  value={params.get('from') ?? ''}
                  onChange={(e) => filter('from', e.target.value)}
                />
              </label>
              <label className="field">
                По
                <input
                  type="date"
                  value={params.get('to') ?? ''}
                  onChange={(e) => filter('to', e.target.value)}
                />
              </label>
              <label className="field">
                Балл от
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={params.get('minScore') ?? ''}
                  onChange={(e) => filter('minScore', e.target.value)}
                />
              </label>
              <label className="field">
                Балл до
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={params.get('maxScore') ?? ''}
                  onChange={(e) => filter('maxScore', e.target.value)}
                />
              </label>
            </div>
          </details>
          {params.size > 0 && (
            <button
              className="text-button"
              onClick={() => {
                setParams({});
                setSelected([]);
              }}
            >
              Сбросить
            </button>
          )}
        </div>
        <ErrorBox message={query.error} retry={query.reload} />
        {query.loading && !query.data ? (
          <Loading />
        ) : query.data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {okk && (
                    <th>
                      <input
                        aria-label="Выбрать доступные диалоги страницы"
                        type="checkbox"
                        checked={
                          query.data.items.filter(eligible).length > 0 &&
                          query.data.items.filter(eligible).every((c) => selected.includes(c.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? query.data!.items.filter(eligible).map((c) => c.id)
                              : [],
                          )
                        }
                      />
                    </th>
                  )}
                  <th>Диалог / дата</th>
                  {okk && <th>Оператор</th>}
                  <th>Канал</th>
                  <th>Язык</th>
                  <th>Статус</th>
                  <th>Итоговый балл</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((c) => (
                  <tr key={c.id}>
                    {okk && (
                      <td>
                        <input
                          aria-label={`Выбрать ${c.id}`}
                          type="checkbox"
                          disabled={!eligible(c)}
                          checked={selected.includes(c.id)}
                          onChange={(e) =>
                            setSelected((ids) =>
                              e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td>
                      <Link
                        className="strong-link"
                        to={`/conversations/${encodeURIComponent(c.id)}`}
                      >
                        {c.id}
                      </Link>
                      <small className="cell-sub" title={c.dateRaw}>
                        {c.dateLabel}
                      </small>
                    </td>
                    {okk && (
                      <td>
                        <div className="row">
                          <span className="mini-avatar">{c.operatorName.slice(0, 1)}</span>
                          <div>
                            {c.operatorName}
                            <small className="cell-sub">
                              {c.fictionalAssignment ? 'Демо-назначение' : ''}
                            </small>
                          </div>
                        </div>
                      </td>
                    )}
                    <td>
                      <span className="row">
                        {c.channel === 'VOICE' ? (
                          <Headphones size={16} />
                        ) : (
                          <MessageSquare size={16} />
                        )}{' '}
                        {c.channel === 'VOICE' ? 'Звонок' : 'Чат'}
                      </span>
                    </td>
                    <td>
                      <span className="language">{c.language}</span>
                    </td>
                    <td>
                      <Status value={c.status} />
                      {c.openAppeals > 0 && (
                        <small className="cell-sub amber-text">Апелляция на рассмотрении</small>
                      )}
                      {c.reviewed && <small className="cell-sub">Пересмотрено ОКК</small>}
                      {c.grossError && <small className="cell-sub red-text">Грубая ошибка</small>}
                    </td>
                    <td>
                      <Score value={c.finalScore} />
                      {c.status === 'DONE' && c.finalScore === null && (
                        <small className="cell-sub">Итог не рассчитывается</small>
                      )}
                    </td>
                    <td>
                      <Link
                        aria-label={`Открыть ${c.id}`}
                        to={`/conversations/${encodeURIComponent(c.id)}`}
                      >
                        <ArrowUpRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Диалоги не найдены. Измените фильтры или загрузите группу.</Empty>
        )}
        <div className="table-footer">
          <span>
            {query.data?.total ?? 0} диалогов · страница {(filters.page ?? 0) + 1}
          </span>
          <div className="actions">
            <button
              disabled={!filters.page}
              onClick={() =>
                setParams((p) => {
                  p.set('page', String((filters.page ?? 0) - 1));
                  return p;
                })
              }
            >
              Назад
            </button>
            <button
              disabled={!query.data || ((filters.page ?? 0) + 1) * 10 >= query.data.total}
              onClick={() =>
                setParams((p) => {
                  p.set('page', String((filters.page ?? 0) + 1));
                  return p;
                })
              }
            >
              Далее
            </button>
          </div>
        </div>
      </section>
      <p className="footnote">
        Источники оценок и решений сохраняются отдельно. Итоги и баллы предоставляет backend.
      </p>
    </>
  );
}
