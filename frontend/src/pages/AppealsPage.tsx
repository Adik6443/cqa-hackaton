import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { ArrowUpRight, Scale } from 'lucide-react';
import { useSession } from '../app/Session';
import { api } from '../shared/api/client';
import { useQuery } from '../shared/hooks';
import { Badge, Empty, ErrorBox, Loading, PageTitle } from '../shared/ui';

export function AppealsPage() {
  const { scope, revision } = useSession();
  const { appealId } = useParams();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const query = useQuery(`appeals-${JSON.stringify(scope)}-${revision}-${status}`, () =>
    api.appeals(scope, appealId ? undefined : status),
  );
  if (appealId && query.data) {
    const appeal = query.data.find((a) => a.id === appealId);
    return appeal ? (
      <Navigate
        replace
        to={`/conversations/${encodeURIComponent(appeal.conversationId)}?appeal=${encodeURIComponent(appeal.id)}`}
      />
    ) : (
      <Empty>Апелляция не найдена или недоступна.</Empty>
    );
  }
  return (
    <>
      <PageTitle
        eyebrow="ОБРАТНАЯ СВЯЗЬ / АПЕЛЛЯЦИИ"
        title={scope.role === 'OKK' ? 'Решения с учётом контекста' : 'Мои апелляции'}
        description="Каждый спорный критерий — отдельная апелляция. Исходная оценка AI сохраняется."
      />
      <section className="panel">
        <div className="panel-top">
          <h2 className="row">
            <Scale size={18} />
            Очередь апелляций
          </h2>
          <select
            aria-label="Статус апелляции"
            value={status}
            onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}
          >
            <option value="">Все статусы</option>
            <option value="OPEN">На рассмотрении</option>
            <option value="ACCEPTED">Принятые</option>
            <option value="REJECTED">Отклонённые</option>
          </select>
        </div>
        <ErrorBox message={query.error} retry={query.reload} />
        {query.loading ? (
          <Loading />
        ) : !query.data?.length ? (
          <Empty>
            <Scale size={28} />
            <strong>Апелляций пока нет</strong>
            <span>Оператор может оспорить критерий в карточке диалога.</span>
            <Link to="/conversations">Открыть диалоги →</Link>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Диалог / критерий</th>
                  <th>Оператор</th>
                  <th>Комментарий</th>
                  <th>Статус</th>
                  <th>Ответ ОКК</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link className="strong-link" to={`/appeals/${encodeURIComponent(a.id)}`}>
                        {a.conversationId}
                      </Link>
                      <small className="cell-sub">{a.criterionTitle}</small>
                    </td>
                    <td>
                      {a.operatorName}
                      <small className="cell-sub">{a.createdAtLabel}</small>
                    </td>
                    <td className="comment-cell">{a.comment}</td>
                    <td>
                      <Badge
                        tone={
                          a.status === 'OPEN' ? 'amber' : a.status === 'ACCEPTED' ? 'green' : 'red'
                        }
                      >
                        {a.status === 'OPEN'
                          ? 'На рассмотрении'
                          : a.status === 'ACCEPTED'
                            ? 'Принята'
                            : 'Отклонена'}
                      </Badge>
                    </td>
                    <td className="comment-cell">{a.reason ?? '—'}</td>
                    <td>
                      <Link
                        aria-label={`Рассмотреть ${a.id}`}
                        to={`/appeals/${encodeURIComponent(a.id)}`}
                      >
                        <ArrowUpRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
