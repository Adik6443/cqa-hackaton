import { useState } from 'react';
import { CheckCircle2, CloudDownload, FileJson, Play, TriangleAlert } from 'lucide-react';
import { api, type Batch, type ExportReport, type ImportResult } from '../api';
import { ErrorBox, PageHeader, usePoll } from '../ui';

/** Control hour: import -> evaluate -> save results.json, all on one page in the right order. */
export function ResultsPage() {
  const [group, setGroup] = useState('DEV');
  const [set, setSet] = useState<'dev' | 'prod'>('dev');
  const [imp, setImp] = useState<ImportResult | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [report, setReport] = useState<ExportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (name: string, fn: () => Promise<void>) => {
    setError(null); setBusy(name);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  usePoll(async () => { if (batch) setBatch(await api.batch(batch.id)); }, batch?.status === 'PENDING');

  return (
    <>
      <PageHeader title="Сдача результатов" subtitle="Формат results.json из приложения к гайду. Файл сохраняется в папку results/ в корне репозитория — останется сделать commit и push." />
      <section className="card">
        <div className="row">
          <label className="field">Группа (group_id)<input value={group} onChange={(e) => { setGroup(e.target.value); setImp(null); setBatch(null); setReport(null); }} /></label>
          <label className="field">Набор
            <select value={set} onChange={(e) => setSet(e.target.value as 'dev' | 'prod')}>
              <option value="dev">DEV → results/dev/results.json</option>
              <option value="prod">Контрольный → results/prod/results.json</option>
            </select>
          </label>
        </div>
      </section>

      <ol className="steps">
        <li className={`card step${imp ? ' done' : ''}`}>
          <div className="step-head"><span className="step-num">1</span><h3>Загрузить диалоги</h3>{imp && <CheckCircle2 className="accent" />}</div>
          <p className="muted">Забирает набор у организаторов. Уже загруженные пропускаются.</p>
          <button className="btn btn-primary" disabled={!!busy} onClick={() => run('imp', async () => setImp(await api.importGroup(group.trim())))}>
            <CloudDownload size={18} />{busy === 'imp' ? 'Загрузка…' : 'Загрузить'}
          </button>
          {imp && <p>Новых: <strong>{imp.imported}</strong>, уже были: {imp.skipped}</p>}
        </li>
        <li className={`card step${batch?.status === 'DONE' ? ' done' : ''}`}>
          <div className="step-head"><span className="step-num">2</span><h3>Оценить все диалоги группы</h3>{batch?.status === 'DONE' && <CheckCircle2 className="accent" />}</div>
          <p className="muted">Оцениваются только ещё не оценённые (и упавшие) диалоги этой группы.</p>
          <button className="btn btn-primary" disabled={!!busy || batch?.status === 'PENDING'}
                  onClick={() => run('eval', async () => setBatch(await api.startBatch({ filters: { groupId: group.trim() }, onlyNotEvaluated: true })))}>
            <Play size={18} />Оценить
          </button>
          {batch && (
            <div className="progress-block">
              <div className="progress-text">{batch.status === 'PENDING' ? 'Идёт оценка…' : 'Готово'}<span>{batch.done} из {batch.total}{batch.failed ? ` · ошибок: ${batch.failed}` : ''}</span></div>
              <div className="progress"><div style={{ width: `${batch.total ? (batch.done / batch.total) * 100 : 0}%` }} /></div>
            </div>
          )}
        </li>
        <li className={`card step${report?.written ? ' done' : ''}`}>
          <div className="step-head"><span className="step-num">3</span><h3>Сохранить results.json</h3>{report?.written && <CheckCircle2 className="accent" />}</div>
          <p className="muted">Неоценённые диалоги попадут в файл со status «error» — так требует формат.</p>
          <div className="row">
            <button className="btn btn-primary" disabled={!!busy} onClick={() => run('exp', async () => setReport(await api.exportResults(group.trim(), set, 'ai', true, false)))}>
              <FileJson size={18} />Сохранить файл
            </button>
            <button className="btn" disabled={!!busy} onClick={() => run('exp', async () => setReport(await api.exportResults(group.trim(), set, 'ai', false, true)))}>Проверить без записи</button>
          </div>
          {report && (
            <div className="report">
              <p>Записей: <strong>{report.count}</strong> · оценено: {report.ok} · с ошибкой: {report.errors}</p>
              {report.path && <p className="small">Файл: <span className="mono">{report.path}</span></p>}
              {report.warnings.length > 0 && (
                <div className="alert alert-warn"><TriangleAlert size={18} /><div>{report.warnings.slice(0, 5).map((w) => <div key={w}>{w}</div>)}{report.warnings.length > 5 && <div>…и ещё {report.warnings.length - 5}</div>}</div></div>
              )}
              {report.written && <p className="small">Дальше в терминале: <span className="mono">git add results &amp;&amp; git commit -m "results" &amp;&amp; git push</span></p>}
            </div>
          )}
        </li>
      </ol>
      {error && <ErrorBox message={error} />}
    </>
  );
}
