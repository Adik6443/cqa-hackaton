import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertOctagon, CheckCheck, FlaskConical, Gauge, MessagesSquare, Scale } from 'lucide-react';
import { api, type Filters } from '../api';
import { Empty, ErrorBox, LANGS, Loading, PageHeader, ScoreBadge, fmtScore, scoreTone, useLoad } from '../ui';

const BUCKET_KEYS: Record<string, string> = { '0–49': '0-49', '50–69': '50-69', '70–84': '70-84', '85–100': '85-100' };
const BREAKDOWNS = [
  { key: 'language', label: 'По языку' }, { key: 'channel', label: 'По каналу' },
  { key: 'duration', label: 'По длительности' }, { key: 'date', label: 'По дням' }, { key: 'model', label: 'По модели AI' },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [f, setF] = useState<Filters>({});
  const key = JSON.stringify(f);
  const sum = useLoad(() => api.summary(f), [key]);
  const [by, setBy] = useState('language');
  const groups = useLoad(() => api.breakdown(by, f), [by, key]);
  const crit = useLoad(() => api.criteriaStats(f), [key]);

  const toList = (extra: Record<string, string>) => navigate(`/conversations?${new URLSearchParams({ ...(f as Record<string, string>), ...extra })}`);

  return (
    <>
      <PageHeader title="Обзор качества" subtitle="Сводка по оценённым диалогам. Нажмите на цифру, чтобы открыть эти диалоги списком."
                  actions={
                    <div className="row">
                      <select value={f.language ?? ''} onChange={(e) => setF({ ...f, language: e.target.value || undefined })} aria-label="Язык">
                        <option value="">Все языки</option>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <select value={f.channel ?? ''} onChange={(e) => setF({ ...f, channel: e.target.value || undefined })} aria-label="Канал">
                        <option value="">Чаты и звонки</option><option value="CHAT">Чаты</option><option value="VOICE">Звонки</option>
                      </select>
                    </div>
                  } />
      {sum.error && <ErrorBox message={sum.error} onRetry={sum.reload} />}
      {!sum.data && sum.loading && <Loading />}
      {sum.data && sum.data.total === 0 && (
        <Empty title="Данных пока нет"><Link to="/conversations">Перейдите в «Диалоги»</Link> и загрузите набор от организаторов.</Empty>
      )}
      {sum.data && sum.data.total > 0 && (
        <>
          {sum.data.simulated && <div className="alert alert-warn"><FlaskConical size={20} />Часть оценок сделана в демо-режиме без AI (MOCK). Подключите модель в разделе «Модели AI» и переоцените.</div>}
          <div className="kpis">
            <button className="kpi" onClick={() => toList({ status: 'DONE' })}>
              <Gauge size={22} /><span className="kpi-label">Средний балл</span>
              <span className={`kpi-value tone-${scoreTone(sum.data.averageScore)}`}>{fmtScore(sum.data.averageScore)}</span>
            </button>
            <button className="kpi" onClick={() => toList({})}>
              <MessagesSquare size={22} /><span className="kpi-label">Оценено</span>
              <span className="kpi-value">{sum.data.evaluated}<small> из {sum.data.total}</small></span>
            </button>
            <button className="kpi kpi-danger" onClick={() => toList({ grossError: 'true' })}>
              <AlertOctagon size={22} /><span className="kpi-label">Грубые ошибки</span>
              <span className="kpi-value">{sum.data.grossErrors}</span>
            </button>
            <button className="kpi" onClick={() => navigate('/appeals')}>
              <Scale size={22} /><span className="kpi-label">Апелляции ждут решения</span>
              <span className="kpi-value">{sum.data.openAppeals}</span>
            </button>
            <div className="kpi static">
              <CheckCheck size={22} /><span className="kpi-label">Апелляций принято</span>
              <span className="kpi-value">{sum.data.acceptedAppealRate === null ? '—' : `${fmtScore(sum.data.acceptedAppealRate)}%`}</span>
            </div>
          </div>

          <div className="grid-2">
            <section className="card">
              <h2 className="card-title">Распределение баллов</h2>
              <p className="muted small">Нажмите на полосу — откроется список этих диалогов.</p>
              <Bars rows={sum.data.distribution.map((d) => ({ label: d.label, value: d.count, tone: scoreTone(Number(d.label.split('–')[0]) + 1) }))}
                    onClick={(label) => toList({ scoreBucket: BUCKET_KEYS[label] })} unit="" />
            </section>
            <section className="card">
              <h2 className="card-title">Слабые места</h2>
              <p className="muted small">Критерии с самым низким средним результатом.</p>
              {sum.data.weakCriteria.length === 0 ? <p className="muted">Пока нет данных.</p> : (
                <ol className="weak-list">{sum.data.weakCriteria.map((w) => <li key={w.title}><strong>{w.title}</strong><span className="muted">{w.label}</span></li>)}</ol>
              )}
            </section>
          </div>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Сравнение групп</h2>
              <div className="tabs small-tabs">{BREAKDOWNS.map((b) => <button key={b.key} className={by === b.key ? 'on' : ''} onClick={() => setBy(b.key)}>{b.label}</button>)}</div>
            </div>
            {groups.error && <ErrorBox message={groups.error} />}
            {groups.data && (
              <table className="table">
                <thead><tr><th>Группа</th><th className="num">Диалогов</th><th className="num">Оценено</th><th className="num">Средний балл</th><th className="num">Ниже 70</th><th className="num">Грубые ошибки</th></tr></thead>
                <tbody>
                  {groups.data.map((g) => (
                    <tr key={g.key}>
                      <td><strong>{g.label}</strong></td><td className="num">{g.total}</td><td className="num">{g.evaluated}</td>
                      <td className="num"><ScoreBadge value={g.avgScore} /></td>
                      <td className="num">{g.lowShare === null ? '—' : `${fmtScore(g.lowShare)}%`}</td>
                      <td className="num">{g.grossErrors}{g.grossErrorRate ? <span className="muted"> ({fmtScore(g.grossErrorRate)}%)</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">Критерии</h2>
            {crit.data && (
              <table className="table">
                <thead><tr><th>Критерий</th><th className="num">Средний результат</th><th className="num">«Нет»</th><th className="num">N/A</th></tr></thead>
                <tbody>
                  {crit.data.map((c) => (
                    <tr key={c.code}>
                      <td><strong>{c.title}</strong></td>
                      <td className="num">{c.flag ? <span className="muted">флаг</span> : <MiniBar pct={c.avgPercent} />}</td>
                      <td className="num">{c.flag ? <span className={c.failCount ? 'text-danger' : ''}>нарушений: {c.failCount}</span> : c.failCount}</td>
                      <td className="num">{c.naCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Bars({ rows, onClick, unit }: { rows: { label: string; value: number; tone: string }[]; onClick?: (label: string) => void; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <button key={r.label} className="bar-row" onClick={() => onClick?.(r.label)}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track"><span className={`bar-fill tone-bg-${r.tone}`} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="bar-value">{r.value}{unit}</span>
        </button>
      ))}
    </div>
  );
}

function MiniBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="muted">—</span>;
  return <span className="minibar"><span className="minibar-track"><span className={`tone-bg-${scoreTone(pct)}`} style={{ width: `${pct}%` }} /></span>{fmtScore(pct)}%</span>;
}
