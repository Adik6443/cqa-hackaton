import { useEffect, useRef, useState } from 'react';
import type { Answer, CriterionResult, Scope } from '../../shared/api/types';
import { api } from '../../shared/api/client';
import { useAction } from '../../shared/hooks';
import { AnswerSelect, ErrorBox } from '../../shared/ui';

export function AppealDialog({
  result,
  scope,
  close,
  saved,
}: {
  result: CriterionResult;
  scope: Scope;
  close: () => void;
  saved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [comment, setComment] = useState('');
  const [desired, setDesired] = useState<Answer | null>(null);
  const action = useAction();
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(e) => {
        if (action.busy) e.preventDefault();
        else close();
      }}
      aria-labelledby="appeal-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await api.createAppeal(result.id, { comment, desired }, scope);
            saved();
            close();
          });
        }}
      >
        <div className="eyebrow">АПЕЛЛЯЦИЯ ПО КРИТЕРИЮ</div>
        <h2 id="appeal-title">{result.criterion.title}</h2>
        <p className="muted">
          Объясните, какой контекст стоит учесть. Решение примет отдел качества.
        </p>
        <label className="field">
          Комментарий
          <textarea
            autoFocus
            required
            maxLength={3000}
            rows={5}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Почему вы не согласны с оценкой?"
          />
        </label>
        <AnswerSelect
          criterion={result.criterion}
          value={desired}
          onChange={setDesired}
          optional
          label="Предлагаемая оценка (необязательно)"
        />
        <ErrorBox message={action.error} />
        <div className="actions modal-actions">
          <button type="button" disabled={action.busy} onClick={close}>
            Отмена
          </button>
          <button className="primary" disabled={action.busy || !comment.trim()}>
            Отправить апелляцию
          </button>
        </div>
      </form>
    </dialog>
  );
}
