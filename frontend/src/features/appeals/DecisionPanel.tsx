import { useState } from 'react';
import type { Answer, Appeal, CriterionResult } from '../../shared/api/types';
import { useSession } from '../../app/Session';
import { api } from '../../shared/api/client';
import { useAction } from '../../shared/hooks';
import { AnswerSelect, Badge, ErrorBox, answerLabel } from '../../shared/ui';

export function DecisionPanel({
  appeal,
  result,
  saved,
}: {
  appeal: Appeal;
  result: CriterionResult;
  saved: () => void;
}) {
  const { scope, refresh } = useSession();
  const [status, setStatus] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED');
  const [value, setValue] = useState<Answer | null>(appeal.desired);
  const [reason, setReason] = useState('');
  const [examples, setExamples] = useState(true);
  const action = useAction();
  return (
    <section className="decision-panel">
      <div className="row between">
        <h3>Апелляция · {appeal.operatorName}</h3>
        <Badge tone="amber">
          {appeal.status === 'OPEN'
            ? 'На рассмотрении'
            : appeal.status === 'ACCEPTED'
              ? 'Принята'
              : 'Отклонена'}
        </Badge>
      </div>
      <blockquote>{appeal.comment}</blockquote>
      {appeal.desired && (
        <p>
          Предлагаемая оценка: <strong>{answerLabel(appeal.desired, result.criterion)}</strong>
        </p>
      )}
      {appeal.status !== 'OPEN' ? (
        <p>
          <strong>Решение ОКК:</strong> {appeal.reason}
        </p>
      ) : scope.role === 'OKK' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await api.decide(
                appeal.id,
                {
                  status,
                  reason,
                  newValue: status === 'ACCEPTED' ? value : null,
                  addToExamples: status === 'ACCEPTED' && examples,
                },
                scope,
              );
              refresh();
              saved();
            });
          }}
        >
          <div className="segmented">
            <button
              type="button"
              className={status === 'ACCEPTED' ? 'selected' : ''}
              onClick={() => setStatus('ACCEPTED')}
            >
              Принять
            </button>
            <button
              type="button"
              className={status === 'REJECTED' ? 'selected' : ''}
              onClick={() => setStatus('REJECTED')}
            >
              Отклонить
            </button>
          </div>
          {status === 'ACCEPTED' && (
            <AnswerSelect criterion={result.criterion} value={value} onChange={setValue} />
          )}
          <label className="field">
            Причина решения
            <textarea
              required
              rows={3}
              maxLength={3000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {status === 'ACCEPTED' && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={examples}
                onChange={(e) => setExamples(e.target.checked)}
              />
              Это ошибка AI — добавить в базу примеров
            </label>
          )}
          <ErrorBox message={action.error} />
          <button
            className="primary"
            disabled={action.busy || !reason.trim() || (status === 'ACCEPTED' && !value)}
          >
            Сохранить решение
          </button>
        </form>
      ) : (
        <p className="muted">Ожидает решения отдела качества.</p>
      )}
    </section>
  );
}
