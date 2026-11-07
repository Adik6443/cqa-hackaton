import { BrainCircuit } from 'lucide-react';
import { api } from '../api';
import { Empty, ErrorBox, Loading, PageHeader, useLoad } from '../ui';

export function CorrectionsPage() {
  const list = useLoad(() => api.corrections(), []);
  const toggle = async (id: string, active: boolean) => {
    await api.setCorrection(id, active).catch(() => undefined);
    list.reload();
  };
  return (
    <>
      <PageHeader title="Ошибки AI" subtitle="Принятые апелляции с отметкой «ошибка AI». До 3 примеров на критерий добавляются в инструкцию модели — так AI учитывает прошлые ошибки." />
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {!list.data && list.loading && <Loading />}
      {list.data?.length === 0 && (
        <Empty title="Пока ни одной ошибки AI" icon={<BrainCircuit size={36} />}>
          Они появятся, когда отдел качества примет апелляцию и отметит «Это ошибка AI».
        </Empty>
      )}
      {list.data && list.data.length > 0 && (
        <section className="card table-card">
          <table className="table">
            <thead><tr><th>Критерий</th><th>Язык</th><th>AI поставил → правильно</th><th>Почему</th><th>Фрагмент диалога</th><th>Использовать</th></tr></thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id} className={c.active ? '' : 'dim'}>
                  <td><strong>{c.criterionTitle}</strong><div className="muted small">{c.createdAtLabel}</div></td>
                  <td>{c.language}</td>
                  <td className="small">{c.originalLabel} → <strong>{c.correctedLabel}</strong></td>
                  <td className="small">{c.reason}</td>
                  <td className="small quote-cell">{c.snippet}</td>
                  <td><label className="switch"><input type="checkbox" checked={c.active} onChange={(e) => toggle(c.id, e.target.checked)} /><span /></label></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
