import { Link } from 'react-router';
import { ArrowUpRight, BarChart3, CheckCheck, Layers3, ShieldAlert, Trophy } from 'lucide-react';
import { useSession } from '../app/Session';
import { api } from '../shared/api/client';
import { useAction, useQuery } from '../shared/hooks';
import { Badge, Empty, ErrorBox, Loading, PageTitle, Score } from '../shared/ui';

export function DashboardPage() {
  const { scope, revision } = useSession();
  const query = useQuery(`analytics-${revision}`, () => api.analytics(scope));
  const data = query.data;
  return (
    <>
      <PageTitle
        eyebrow="ОБЗОР / КАЧЕСТВО КОММУНИКАЦИИ"
        title="За цифрами — диалоги"
        description="Общая картина качества и точки, где команде нужна поддержка."
        actions={<Badge>Последние 30 дней · демо</Badge>}
      />
      <ErrorBox message={query.error} retry={query.reload} />
      {!data ? (
        <Loading />
      ) : (
        <>
          {data.simulated && (
            <p className="success-note">
              Средний балл и распределение — отдельные фиксированные демо-сценарии, не аналитика
              текущего списка.
            </p>
          )}
          <div className="metric-grid">
            <div className="metric">
              <BarChart3 />
              <span>Средний финальный балл</span>
              <Score large value={data.averageScore} />
            </div>
            <div className="metric">
              <CheckCheck />
              <span>Оценено диалогов</span>
              <strong>
                {data.evaluated}
                <small> / {data.total}</small>
              </strong>
            </div>
            <div className="metric">
              <ShieldAlert />
              <span>Грубые ошибки</span>
              <strong>{data.grossErrors}</strong>
            </div>
            <div className="metric">
              <Layers3 />
              <span>Открытые апелляции</span>
              <strong>{data.openAppeals}</strong>
            </div>
          </div>
          <div className="dashboard-grid">
            <section className="panel padded">
              <div className="row between">
                <h2>Распределение баллов</h2>
                <Badge>Демо</Badge>
              </div>
              <p className="muted">Количество диалогов по диапазонам</p>
              <div className="distribution">
                {data.distribution.map((d, i) => (
                  <div key={d.label}>
                    <span>{d.label}</span>
                    <div className="bar-track">
                      <div
                        className={`bar bar-${i}`}
                        style={{
                          width: `${Math.max(2, (d.count / Math.max(1, ...data.distribution.map((x) => x.count))) * 100)}%`,
                        }}
                      />
                    </div>
                    <strong>{d.count}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel padded">
              <h2>Точки роста</h2>
              {data.weakCriteria.map((c) => (
                <div className="insight-row" key={c.title}>
                  <span>{c.title}</span>
                  <Badge tone="amber">{c.label}</Badge>
                </div>
              ))}
              <Link className="button-link" to="/conversations">
                Перейти к диалогам <ArrowUpRight size={15} />
              </Link>
            </section>
            <section className="panel padded">
              <h2>Доля принятых апелляций</h2>
              <div className="big-number">
                {data.acceptedAppealRate === null ? '—' : `${data.acceptedAppealRate}%`}
              </div>
              <p className="muted">
                Показатель предоставляет backend. В демо процент не рассчитывается.
              </p>
              <Link to="/appeals">Рассмотреть апелляции →</Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}
export function InsightsPage({ corrections = false }: { corrections?: boolean }) {
  const { scope, revision, refresh } = useSession();
  const action = useAction();
  const ratings = useQuery(`ratings-${JSON.stringify(scope)}-${revision}`, () =>
    api.leaderboard(scope),
  );
  const examples = useQuery(`corrections-${scope.role}-${revision}-${corrections}`, () =>
    corrections && scope.role === 'OKK' ? api.corrections(scope) : Promise.resolve([]),
  );
  const mine = ratings.data?.find((r) => r.operatorId === scope.operatorId);
  return (
    <>
      <PageTitle
        eyebrow={corrections ? 'РАЗВИТИЕ / БАЗА ОШИБОК AI' : 'РАЗВИТИЕ / ОПЕРАТОРЫ'}
        title={
          corrections
            ? 'Учиться на проверенных примерах'
            : scope.role === 'OKK'
              ? 'Команда и качество'
              : 'Мой прогресс'
        }
        description={
          corrections
            ? 'Принятые исправления для следующих запросов AI. Управление примерами, без переобучения модели.'
            : 'Вымышленные операторы · фиксированный демо-рейтинг за 30 дней.'
        }
      />
      <ErrorBox message={action.error} />
      {corrections ? (
        <>
          <ErrorBox message={examples.error} retry={examples.reload} />
          {examples.loading ? (
            <Loading />
          ) : !examples.data?.length ? (
            <section className="panel">
              <Empty>
                <Layers3 size={28} />
                <strong>База примеров пока пуста</strong>
                <span>Примите апелляцию с отметкой «Это ошибка AI».</span>
                <Link to="/appeals">Открыть очередь →</Link>
              </Empty>
            </section>
          ) : (
            <div className="correction-grid">
              {examples.data.map((c) => (
                <article className="panel padded" key={c.id}>
                  <div className="row between">
                    <h2>{c.criterionTitle}</h2>
                    <Badge>{c.language}</Badge>
                  </div>
                  <p>
                    <span className="muted">AI:</span> {c.originalLabel} →{' '}
                    <strong>{c.correctedLabel}</strong>
                  </p>
                  <blockquote>{c.snippet}</blockquote>
                  <p>{c.reason}</p>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={c.active}
                      disabled={action.busy}
                      onChange={(e) => {
                        const active = e.target.checked;
                        void action.run(async () => {
                          await api.updateCorrection(c.id, active, scope);
                          refresh();
                        });
                      }}
                    />
                    Использовать как пример
                  </label>
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <ErrorBox message={ratings.error} retry={ratings.reload} />
          {ratings.loading ? (
            <Loading />
          ) : (
            <>
              {scope.role === 'OPERATOR' && mine && (
                <div className="dashboard-grid">
                  <section className="panel padded">
                    <Badge tone={mine.eligible ? 'green' : 'red'}>{mine.level}</Badge>
                    <h2 className="mt-4">{mine.name} · демо-рейтинг</h2>
                    <Score large value={mine.score} />
                    <p>
                      Бонус: <strong>{mine.bonusLabel}</strong>
                    </p>
                    {mine.pointsToNext !== null && (
                      <p>До следующего уровня {mine.pointsToNext} балла</p>
                    )}
                    <p className="muted">
                      {mine.conversations} оценённых диалогов · место {mine.rank ?? '—'}
                    </p>
                    <div className="row wrap">
                      {mine.badges.map((b) => (
                        <Badge tone="green" key={b}>
                          {b}
                        </Badge>
                      ))}
                    </div>
                  </section>
                  <section className="panel padded">
                    <h2>Динамика по дням</h2>
                    <div className="trend-bars">
                      {mine.trend.map((t) => (
                        <div key={t.label}>
                          <strong>{t.score}</strong>
                          <div style={{ height: `${t.score}px` }} />
                          <small>{t.label}</small>
                        </div>
                      ))}
                    </div>
                    <p>Точки роста: {mine.weakCriteria.join(', ')}</p>
                  </section>
                </div>
              )}
              <section className="panel">
                <div className="panel-top">
                  <h2 className="row">
                    <Trophy size={19} />
                    Рейтинг команды
                  </h2>
                  <Badge>Симуляция</Badge>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Место</th>
                        <th>Оператор</th>
                        <th>Диалоги</th>
                        <th>Грубые ошибки</th>
                        <th>Средний балл</th>
                        <th>Уровень / бонус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ratings.data?.map((r) => (
                        <tr key={r.operatorId}>
                          <td>#{r.rank ?? '—'}</td>
                          <td>
                            {r.name}
                            <small className="cell-sub">Вымышленный оператор</small>
                          </td>
                          <td>{r.conversations}</td>
                          <td>{r.grossErrors}</td>
                          <td>
                            <Score value={r.score} />
                          </td>
                          <td>
                            <Badge tone={r.eligible ? 'green' : 'red'}>{r.level}</Badge>
                            <small className="cell-sub">{r.bonusLabel}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="footnote">
                Рейтинг и бонусные правила принадлежат backend. Фиксированные демо-значения не
                пересчитываются после апелляций.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
