import { useCallback, useState } from 'react';
import { CheckCircle2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api, type Checklist, type Criterion, type Step } from '../api';
import { ErrorBox, Loading, PageHeader, Toast, fmtScore, useLoad } from '../ui';

const TYPE_LABEL = { BOOLEAN: 'Да / Нет', SCALE: 'Шкала', FLAG: 'Флаг (без баллов)' };
const YES_NO: Step[] = [{ value: 1, label: 'Да' }, { value: 0, label: 'Нет' }];

export function ChecklistPage() {
  const versions = useLoad(() => api.checklists(), []);
  const [draft, setDraft] = useState<{ name: string; criteria: Criterion[] } | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'danger' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  if (versions.error) return <ErrorBox message={versions.error} onRetry={versions.reload} />;
  if (!versions.data) return <Loading />;
  const active = versions.data.find((v) => v.active);

  const activate = async (v: Checklist) => {
    try { await api.activateChecklist(v.id); setToast({ text: `Версия ${v.version} активна. Новые оценки пойдут по ней.` }); versions.reload(); }
    catch (e) { setToast({ text: (e as Error).message, tone: 'danger' }); }
  };

  return (
    <>
      <PageHeader title="Чек-лист"
                  subtitle="По этим критериям AI оценивает диалоги. Изменения сохраняются новой версией: старые оценки остаются на своей версии."
                  actions={!draft && active && <button className="btn btn-primary" onClick={() => setDraft({ name: `${active.name}`, criteria: active.criteria.map((c) => ({ ...c })) })}><Pencil size={18} />Изменить чек-лист</button>} />
      {draft ? (
        <Editor draft={draft} setDraft={setDraft}
                onSaved={(v) => { setDraft(null); versions.reload(); setToast({ text: `Сохранена версия ${v.version}. Сделайте её активной, чтобы применить.` }); }}
                onError={(t) => setToast({ text: t, tone: 'danger' })} />
      ) : active && <CriteriaTable c={active} />}

      <h2 className="section-title">Версии</h2>
      <section className="card table-card">
        <table className="table">
          <thead><tr><th>Версия</th><th>Название</th><th>Создана</th><th>Критериев</th><th></th></tr></thead>
          <tbody>
            {versions.data.map((v) => (
              <tr key={v.id}>
                <td>v{v.version}</td><td>{v.name}</td><td>{v.createdAtLabel}</td><td>{v.criteria.length}</td>
                <td className="row-end">{v.active ? <span className="tag tag-ok"><CheckCircle2 size={15} />Активна</span> : <button className="btn btn-sm" onClick={() => activate(v)}>Сделать активной</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {toast && <Toast text={toast.text} tone={toast.tone} onClose={closeToast} />}
    </>
  );
}

function CriteriaTable({ c }: { c: Checklist }) {
  return (
    <section className="card table-card">
      <div className="table-meta">Активная версия: <strong>v{c.version}</strong> · {c.name}</div>
      <table className="table">
        <thead><tr><th>#</th><th>Критерий</th><th>Тип</th><th className="num">Вес</th><th>N/A</th><th>Инструкция для AI</th></tr></thead>
        <tbody>
          {c.criteria.map((k, i) => (
            <tr key={k.code}>
              <td>{i + 1}</td>
              <td><strong>{k.title}</strong><div className="muted small">{k.section} · <span className="mono">{k.exportId}</span></div></td>
              <td>{TYPE_LABEL[k.answerType]}{k.answerType === 'SCALE' && <div className="muted small">{k.steps.map((s) => fmtScore(s.value)).join(' / ')}</div>}</td>
              <td className="num">{k.answerType === 'FLAG' ? '—' : fmtScore(k.weight)}</td>
              <td>{k.allowNa ? <span title={k.naCondition}>Да</span> : 'Нет'}</td>
              <td className="small">{k.instruction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Editor({ draft, setDraft, onSaved, onError }: {
  draft: { name: string; criteria: Criterion[] }; setDraft: (d: { name: string; criteria: Criterion[] } | null) => void;
  onSaved: (v: Checklist) => void; onError: (t: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const sum = draft.criteria.filter((c) => c.answerType !== 'FLAG').reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const update = (i: number, patch: Partial<Criterion>) =>
    setDraft({ ...draft, criteria: draft.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const add = () => setDraft({
    ...draft,
    criteria: [...draft.criteria, { code: '', exportId: '', title: 'Новый критерий', section: draft.criteria.at(-1)?.section ?? 'Общее', instruction: '', answerType: 'BOOLEAN', weight: 0, allowNa: false, naCondition: '', steps: YES_NO }],
  });
  const save = async () => {
    setBusy(true);
    try { onSaved(await api.saveChecklist(draft.name, draft.criteria.map((c) => ({ ...c, id: undefined })))); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="card editor">
      <div className="editor-top">
        <label className="field grow">Название версии<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <div className={`weight-sum ${Math.abs(sum - 100) < 0.001 ? 'ok' : 'bad'}`}>Сумма весов: <strong>{fmtScore(sum)}</strong> / 100</div>
      </div>
      {draft.criteria.map((c, i) => (
        <div key={i} className="editor-row">
          <div className="editor-grid">
            <label className="field span2">Название<input value={c.title} onChange={(e) => update(i, { title: e.target.value })} /></label>
            <label className="field">Раздел<input value={c.section} onChange={(e) => update(i, { section: e.target.value })} /></label>
            <label className="field">Тип ответа
              <select value={c.answerType} onChange={(e) => {
                const t = e.target.value as Criterion['answerType'];
                update(i, { answerType: t, steps: t === 'SCALE' ? [{ value: 10, label: 'Отлично' }, { value: 5, label: 'Частично' }, { value: 0, label: 'Плохо' }] : YES_NO, weight: t === 'FLAG' ? 0 : c.weight });
              }}>
                <option value="BOOLEAN">Да / Нет</option><option value="SCALE">Шкала</option><option value="FLAG">Флаг (без баллов)</option>
              </select>
            </label>
            <label className="field">Вес<input type="number" min={0} disabled={c.answerType === 'FLAG'} value={c.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })} /></label>
            <label className="field">Код в results.json<input value={c.exportId} placeholder="например, politeness" onChange={(e) => update(i, { exportId: e.target.value })} /></label>
            <label className="field span-all">Инструкция для AI — что считать «Да», что «Нет»
              <textarea rows={2} value={c.instruction} onChange={(e) => update(i, { instruction: e.target.value })} />
            </label>
            <label className="check"><input type="checkbox" checked={c.allowNa} onChange={(e) => update(i, { allowNa: e.target.checked })} />Можно ставить N/A</label>
            {c.allowNa && <label className="field span3">Когда N/A<input value={c.naCondition} onChange={(e) => update(i, { naCondition: e.target.value })} /></label>}
            {c.answerType === 'SCALE' && (
              <div className="field span-all">Ступени шкалы (значение — описание)
                {c.steps.map((s, j) => (
                  <div key={j} className="step-row">
                    <input type="number" value={s.value} onChange={(e) => update(i, { steps: c.steps.map((x, k) => (k === j ? { ...x, value: Number(e.target.value) } : x)) })} />
                    <input value={s.label} onChange={(e) => update(i, { steps: c.steps.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })} />
                    <button className="btn btn-ghost btn-sm" onClick={() => update(i, { steps: c.steps.filter((_, k) => k !== j) })} aria-label="Удалить ступень"><X size={16} /></button>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={() => update(i, { steps: [...c.steps, { value: 0, label: '' }] })}><Plus size={16} />Ступень</button>
              </div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm danger" onClick={() => setDraft({ ...draft, criteria: draft.criteria.filter((_, j) => j !== i) })}><Trash2 size={16} />Удалить</button>
        </div>
      ))}
      <div className="editor-actions">
        <button className="btn" onClick={add}><Plus size={18} />Добавить критерий</button>
        <span className="grow" />
        <button className="btn" onClick={() => setDraft(null)}>Отмена</button>
        <button className="btn btn-primary" disabled={busy || Math.abs(sum - 100) > 0.001} onClick={save}><Save size={18} />Сохранить новую версию</button>
      </div>
    </section>
  );
}
