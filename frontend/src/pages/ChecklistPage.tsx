import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { useSession } from '../app/Session';
import { api } from '../shared/api/client';
import type { Checklist, Criterion } from '../shared/api/types';
import { checklistErrors } from '../shared/api/validation';
import { useAction, useQuery } from '../shared/hooks';
import { Badge, ErrorBox, Loading, PageTitle } from '../shared/ui';

export function ChecklistPage() {
  const { scope, revision, refresh } = useSession();
  const navigate = useNavigate();
  const versions = useQuery(`versions-${revision}`, () => api.checklists());
  const [draft, setDraft] = useState<Checklist | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const action = useAction();
  useEffect(() => {
    if (!draft && versions.data?.length)
      setDraft(structuredClone(versions.data.find((v) => v.active) ?? versions.data[0]));
  }, [versions.data]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function update(index: number, patch: Partial<Criterion>) {
    setDraft(
      (d) =>
        d && { ...d, criteria: d.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)) },
    );
    setDirty(true);
  }
  function move(from: number, to: number) {
    if (!draft || to < 0 || to >= draft.criteria.length || from === to) return;
    const criteria = [...draft.criteria];
    const [item] = criteria.splice(from, 1);
    criteria.splice(to, 0, item);
    setDraft({ ...draft, criteria });
    setDirty(true);
  }
  function selectVersion(version: Checklist) {
    if (dirty && !window.confirm('Отменить несохранённые изменения и открыть другую версию?'))
      return;
    setDraft(structuredClone(version));
    setDirty(false);
    setNotice('');
  }
  const errors = draft ? checklistErrors(draft.criteria) : [];
  const weight = draft?.criteria.reduce((sum, c) => sum + c.weight, 0) ?? 0;
  return (
    <>
      <PageTitle
        eyebrow="СТАНДАРТЫ / ЧЕК-ЛИСТЫ"
        title="Правила хорошего диалога"
        description="Настраивайте критерии. Каждое сохранение создаёт отдельную версию."
      />
      <ErrorBox message={versions.error} retry={versions.reload} />
      <ErrorBox message={action.error} />
      {notice && (
        <div className="success-note" role="status">
          {notice}
        </div>
      )}
      {!draft ? (
        <Loading />
      ) : (
        <div className="checklist-layout">
          <aside className="panel version-list">
            <h2>Версии чек-листа</h2>
            {versions.data?.map((v) => (
              <button
                key={v.id}
                className={draft.id === v.id ? 'active-version' : ''}
                onClick={() => selectVersion(v)}
              >
                <span>
                  <strong>Версия {v.version}</strong>
                  <small>{v.createdAtLabel}</small>
                </span>
                {v.active && <Badge tone="green">Активная</Badge>}
              </button>
            ))}
            <p className="footnote">Оценки сохраняют снимок критериев своей версии.</p>
          </aside>
          <div>
            <div className="panel checklist-toolbar">
              <div className="row between">
                <label className="field grow">
                  Название
                  <input
                    value={draft.name}
                    maxLength={160}
                    onChange={(e) => {
                      setDraft({ ...draft, name: e.target.value });
                      setDirty(true);
                    }}
                  />
                </label>
                <Badge tone={Math.abs(weight - 100) < 0.001 ? 'green' : 'red'}>
                  Сумма весов: {Number.isFinite(weight) ? weight : '—'} / 100
                </Badge>
              </div>
              <div className="actions wrap">
                <button
                  className="primary"
                  disabled={action.busy || !!errors.length || !draft.name.trim()}
                  onClick={() =>
                    void action.run(async () => {
                      const saved = await api.saveChecklist(
                        { name: draft.name, criteria: draft.criteria },
                        scope,
                      );
                      setDraft(saved);
                      setDirty(false);
                      setNotice(
                        `Версия ${saved.version} сохранена. Активируйте её для новых оценок.`,
                      );
                      refresh();
                    })
                  }
                >
                  <Save size={16} />
                  Сохранить как новую версию
                </button>
                <button
                  disabled={
                    action.busy || dirty || !!versions.data?.find((v) => v.id === draft.id)?.active
                  }
                  onClick={() =>
                    void action.run(async () => {
                      await api.activateChecklist(draft.id, scope);
                      setNotice(`Версия ${draft.version} активна для новых оценок.`);
                      refresh();
                    })
                  }
                >
                  Сделать активной
                </button>
                <button
                  disabled={action.busy || dirty}
                  onClick={() =>
                    void action.run(async () => {
                      await api.activateChecklist(draft.id, scope);
                      refresh();
                      navigate('/conversations');
                    })
                  }
                >
                  Применить к диалогам →
                </button>
                {dirty && (
                  <button
                    onClick={() => {
                      const saved = versions.data?.find((v) => v.id === draft.id);
                      if (saved && window.confirm('Отменить несохранённые изменения?')) {
                        setDraft(structuredClone(saved));
                        setDirty(false);
                      }
                    }}
                  >
                    Отменить изменения
                  </button>
                )}
              </div>
              <p className="footnote">
                «Применить» активирует сохранённую версию и открывает выбор диалогов для переоценки.
                Старые оценки сохраняются до нового запуска.
              </p>
              {dirty && <Badge tone="amber">Есть несохранённые изменения</Badge>}
              {errors.length > 0 && (
                <ul className="validation-list" role="status">
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
            {draft.criteria.map((c, i) => (
              <article
                key={c.id}
                className="panel criterion-editor"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) move(dragIndex, i);
                  setDragIndex(null);
                }}
              >
                <div className="row between">
                  <div className="row">
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDragIndex(i);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(i));
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      title="Перетащить критерий"
                      className="drag-handle"
                    >
                      <GripVertical size={18} />
                    </span>
                    <span className="eyebrow">КРИТЕРИЙ {String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <div className="actions">
                    <button
                      aria-label={`Поднять критерий ${i + 1}`}
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      aria-label={`Опустить критерий ${i + 1}`}
                      disabled={i === draft.criteria.length - 1}
                      onClick={() => move(i, i + 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      className="danger-icon"
                      aria-label={`Удалить критерий ${i + 1}`}
                      onClick={() => {
                        if (
                          window.confirm(`Удалить «${c.title || 'Новый критерий'}» из черновика?`)
                        ) {
                          setDraft({
                            ...draft,
                            criteria: draft.criteria.filter((_, n) => n !== i),
                          });
                          setDirty(true);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field">
                    Название
                    <input value={c.title} onChange={(e) => update(i, { title: e.target.value })} />
                  </label>
                  <label className="field">
                    Секция
                    <input
                      value={c.section}
                      onChange={(e) => update(i, { section: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Код критерия
                    <input value={c.code} onChange={(e) => update(i, { code: e.target.value })} />
                  </label>
                  <label className="field">
                    Тип
                    <select
                      value={c.answerType}
                      onChange={(e) =>
                        update(i, {
                          answerType: e.target.value as Criterion['answerType'],
                          weight: e.target.value === 'FLAG' ? 0 : c.weight,
                          steps:
                            e.target.value === 'SCALE' && c.steps.length === 0
                              ? [
                                  { value: 0, label: 'Не выполнено' },
                                  { value: 1, label: 'Выполнено' },
                                ]
                              : c.steps,
                        })
                      }
                    >
                      <option value="BOOLEAN">Да / Нет</option>
                      <option value="SCALE">Числовая шкала</option>
                      <option value="FLAG">Флаг без баллов</option>
                    </select>
                  </label>
                  <label className="field">
                    Вес
                    <input
                      type="number"
                      min="0"
                      step="any"
                      disabled={c.answerType === 'FLAG'}
                      value={Number.isNaN(c.weight) ? '' : c.weight}
                      onChange={(e) => update(i, { weight: e.target.valueAsNumber })}
                    />
                  </label>
                </div>
                <label className="field">
                  Инструкция · что проверять
                  <textarea
                    rows={2}
                    value={c.instruction}
                    onChange={(e) => update(i, { instruction: e.target.value })}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={c.allowNa}
                    onChange={(e) => update(i, { allowNa: e.target.checked })}
                  />
                  N/A разрешён
                </label>
                {c.allowNa && (
                  <label className="field">
                    Условие N/A
                    <input
                      value={c.naCondition}
                      onChange={(e) => update(i, { naCondition: e.target.value })}
                    />
                  </label>
                )}
                {c.answerType === 'SCALE' && (
                  <div className="scale-steps">
                    <h4>Ступени шкалы</h4>
                    {c.steps.map((s, n) => (
                      <div className="row" key={n}>
                        <label className="field">
                          Значение
                          <input
                            aria-label={`Ступень ${n + 1}: значение, критерий ${i + 1}`}
                            type="number"
                            step="any"
                            value={Number.isNaN(s.value) ? '' : s.value}
                            onChange={(e) =>
                              update(i, {
                                steps: c.steps.map((v, j) =>
                                  j === n ? { ...v, value: e.target.valueAsNumber } : v,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="field grow">
                          Описание
                          <input
                            aria-label={`Ступень ${n + 1}: описание, критерий ${i + 1}`}
                            value={s.label}
                            onChange={(e) =>
                              update(i, {
                                steps: c.steps.map((v, j) =>
                                  j === n ? { ...v, label: e.target.value } : v,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          aria-label={`Удалить ступень ${n + 1}`}
                          onClick={() => update(i, { steps: c.steps.filter((_, j) => j !== n) })}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        update(i, {
                          steps: [
                            ...c.steps,
                            { value: Math.max(0, ...c.steps.map((s) => s.value)) + 1, label: '' },
                          ],
                        })
                      }
                    >
                      <Plus size={14} />
                      Добавить ступень
                    </button>
                  </div>
                )}
              </article>
            ))}
            <button
              className="add-criterion"
              onClick={() => {
                const id = crypto.randomUUID();
                setDraft({
                  ...draft,
                  criteria: [
                    ...draft.criteria,
                    {
                      id,
                      code: `criterion_${draft.criteria.length + 1}`,
                      title: '',
                      section: '',
                      instruction: '',
                      answerType: 'BOOLEAN',
                      weight: 0,
                      allowNa: false,
                      naCondition: '',
                      steps: [],
                    },
                  ],
                });
                setDirty(true);
              }}
            >
              <Plus size={18} />
              Добавить критерий
            </button>
          </div>
        </div>
      )}
    </>
  );
}
