import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Play, Sparkles } from 'lucide-react';
import { useSession } from '../app/Session';
import { api } from '../shared/api/client';
import type { CriterionResult, Evidence } from '../shared/api/types';
import { useAction, useQuery } from '../shared/hooks';
import {
  Badge,
  Empty,
  ErrorBox,
  FlowArrow,
  Loading,
  PageTitle,
  Score,
  Status,
  answerLabel,
} from '../shared/ui';
import { TranscriptPanel } from '../features/conversations/TranscriptPanel';
import { AppealDialog } from '../features/appeals/AppealDialog';
import { DecisionPanel } from '../features/appeals/DecisionPanel';

export function ConversationReviewPage() {
  const { conversationId = '' } = useParams();
  const [params] = useSearchParams();
  const { scope, revision, refresh } = useSession();
  const [poll, setPoll] = useState(0);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [appealing, setAppealing] = useState<CriterionResult | null>(null);
  const action = useAction();
  const query = useQuery(
    `conversation-${conversationId}-${JSON.stringify(scope)}-${revision}`,
    () => api.conversation(conversationId, scope),
    poll,
  );
  const appeals = useQuery(
    `review-appeals-${conversationId}-${JSON.stringify(scope)}-${revision}`,
    () => api.appeals(scope),
  );
  useEffect(() => {
    setPoll(query.data?.status === 'PENDING' ? 2000 : 0);
  }, [query.data?.status]);
  useEffect(() => {
    setEvidence(null);
    setAppealing(null);
  }, [conversationId]);
  const targetAppeal = appeals.data?.find((a) => a.id === params.get('appeal'));
  useEffect(() => {
    const target = query.data?.evaluation?.results.find(
      (r) => r.id === targetAppeal?.criterionResultId,
    );
    if (target?.evidence[0]) setEvidence(target.evidence[0]);
  }, [targetAppeal?.id, query.data?.evaluation?.id]);
  if (!query.data)
    return (
      <>
        <ErrorBox message={query.error} retry={query.reload} />
        {query.loading && <Loading />}
      </>
    );
  const c = query.data,
    evaluation = c.evaluation,
    okk = scope.role === 'OKK';
  return (
    <>
      <Link className="back-link" to="/conversations">
        <ArrowLeft size={15} />К списку диалогов
      </Link>
      <PageTitle
        eyebrow={`${c.channel === 'VOICE' ? 'ЗВОНОК' : 'ЧАТ'} / ${c.language} / ${c.groupId}`}
        title={c.id}
        description={`${c.operatorName}${c.fictionalAssignment ? ' · вымышленное назначение' : ''} · ${c.dateLabel}`}
        actions={
          <>
            <Status value={c.status} />
            {okk && (
              <button
                className="primary"
                disabled={action.busy || c.status === 'PENDING' || c.openAppeals > 0}
                title={c.openAppeals ? 'Сначала рассмотрите открытые апелляции' : ''}
                onClick={() =>
                  void action.run(async () => {
                    await api.evaluate(c.id, scope);
                    refresh();
                  })
                }
              >
                <Play size={15} />
                {c.status === 'FAILED' ? 'Повторить' : evaluation ? 'Переоценить' : 'Оценить'}
              </button>
            )}
          </>
        }
      />
      <ErrorBox message={query.error} retry={query.reload} />
      <ErrorBox message={action.error} />
      <ErrorBox message={c.error ?? undefined} />
      {c.status === 'PENDING' && (
        <div className="success-note" role="status">
          Оценка выполняется. Статус обновляется каждые 2 секунды.{' '}
          {evaluation && 'Ниже показана предыдущая оценка.'}
        </div>
      )}
      {evaluation && (
        <section className="score-strip">
          <div>
            <div className="eyebrow">ИСХОДНЫЙ AI</div>
            <Score large value={evaluation.originalScore} />
          </div>
          <FlowArrow />
          <div>
            <div className="eyebrow">РЕШЕНИЕ ОКК</div>
            <strong>
              {c.reviewed ? 'Пересмотрено' : c.openAppeals ? 'На рассмотрении' : 'Без пересмотра'}
            </strong>
            <small className="cell-sub">
              {c.openAppeals ? `${c.openAppeals} открытых апелляций` : 'История сохранена'}
            </small>
          </div>
          <FlowArrow />
          <div>
            <div className="eyebrow">ФИНАЛЬНЫЙ БАЛЛ</div>
            <Score large value={evaluation.finalScore} />
            {evaluation.finalScore === null && (
              <small className="cell-sub">Итог не рассчитывается</small>
            )}
          </div>
          <div className="score-info">
            {evaluation.grossError && <Badge tone="red">Грубая ошибка</Badge>}
            <Badge>Чек-лист v{evaluation.checklistVersion}</Badge>
            {evaluation.simulated && <Badge tone="amber">Симуляция AI</Badge>}
            {evaluation.correctionsUsed > 0 && (
              <Badge tone="green">Учтено {evaluation.correctionsUsed} исправлений ОКК</Badge>
            )}
          </div>
        </section>
      )}
      {evaluation?.scoreNote && <p className="footnote">{evaluation.scoreNote}</p>}
      <div className="review-grid">
        <TranscriptPanel key={c.id} conversation={c} evidence={evidence} scope={scope} />
        <section className="evaluation-panel">
          <div className="panel-top">
            <h2 className="row">
              <Sparkles size={18} />
              Оценка по критериям
            </h2>
            <Badge>{evaluation?.results.length ?? 0}</Badge>
          </div>
          <ErrorBox message={appeals.error} retry={appeals.reload} />
          {!evaluation ? (
            <Empty>
              {c.status === 'PENDING' ? 'AI обрабатывает диалог…' : 'Оценка пока не выполнена.'}
            </Empty>
          ) : (
            <>
              <div className="section-totals">
                {evaluation.sections.map((s) => (
                  <div key={s.title}>
                    <span>{s.title}</span>
                    <strong>
                      {s.originalScore ?? '—'} → {s.finalScore ?? '—'}
                    </strong>
                  </div>
                ))}
              </div>
              {[...new Set(evaluation.results.map((r) => r.criterion.section))].map((section) => (
                <div key={section}>
                  <h3 className="section-heading">{section}</h3>
                  {evaluation.results
                    .filter((r) => r.criterion.section === section)
                    .map((result) => {
                      const related =
                        appeals.data?.filter((a) => a.criterionResultId === result.id) ?? [];
                      const hasOpen = related.some((a) => a.status === 'OPEN');
                      return (
                        <article
                          className={`criterion-card ${targetAppeal?.criterionResultId === result.id ? 'disputed' : ''}`}
                          key={result.id}
                        >
                          <div className="row between">
                            <h3>{result.criterion.title}</h3>
                            <span className="criterion-points">
                              {result.final.points ?? '—'} / {result.final.maxPoints ?? '—'}
                            </span>
                          </div>
                          <div className="row wrap">
                            <Badge
                              tone={
                                result.final.isNa
                                  ? ''
                                  : result.final.value === 0
                                    ? 'amber'
                                    : 'green'
                              }
                            >
                              {answerLabel(result.final, result.criterion)}
                            </Badge>
                            {okk && result.confidence < 0.7 && (
                              <Badge tone="amber">
                                Требует проверки · {Math.round(result.confidence * 100)}%
                              </Badge>
                            )}
                            <span className="muted text-xs">Вес {result.criterion.weight}</span>
                          </div>
                          <p>{result.explanation}</p>
                          <details>
                            <summary>Правило критерия</summary>
                            <p>{result.criterion.instruction}</p>
                            {result.criterion.allowNa && <p>N/A: {result.criterion.naCondition}</p>}
                          </details>
                          <div className="evidence-row">
                            <span>Доказательства</span>
                            {result.evidence.map((e, i) => (
                              <button
                                className="evidence-chip"
                                key={`${e.messageSeq}-${i}`}
                                onClick={() => setEvidence({ ...e })}
                              >
                                ↗ #{e.messageSeq}
                              </button>
                            ))}
                          </div>
                          <div className="value-history">
                            <div>
                              <span>Исходная оценка AI</span>
                              <strong>{answerLabel(result.original, result.criterion)}</strong>
                            </div>
                            <div>
                              <span>Решение ОКК</span>
                              <strong>
                                {result.decision
                                  ? result.decision.status === 'ACCEPTED'
                                    ? 'Принято'
                                    : 'Отклонено'
                                  : '—'}
                              </strong>
                            </div>
                            {result.decision && <p>{result.decision.reason}</p>}
                            <div>
                              <span>Финальная</span>
                              <strong>{answerLabel(result.final, result.criterion)}</strong>
                            </div>
                          </div>
                          {!okk && (
                            <button
                              className="text-button appeal-button"
                              disabled={
                                hasOpen || !!appeals.error || appeals.loading || c.status !== 'DONE'
                              }
                              onClick={() => setAppealing(result)}
                            >
                              {hasOpen ? 'Апелляция на рассмотрении' : 'Оспорить'}
                            </button>
                          )}
                          {related.map((a) => (
                            <DecisionPanel
                              key={a.id + a.status}
                              appeal={a}
                              result={result}
                              saved={refresh}
                            />
                          ))}
                        </article>
                      );
                    })}
                </div>
              ))}
            </>
          )}
        </section>
      </div>
      {appealing && (
        <AppealDialog
          result={appealing}
          scope={scope}
          close={() => setAppealing(null)}
          saved={refresh}
        />
      )}
    </>
  );
}
