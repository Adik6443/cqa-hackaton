import { Award, Medal, TriangleAlert } from 'lucide-react';
import { api, type Rating } from '../api';
import { useSession } from '../App';
import { Empty, ErrorBox, Loading, PageHeader, ScoreBadge, fmtScore, useLoad } from '../ui';

const LEVEL_CLS: Record<string, string> = { 'Платина': 'lvl-plat', 'Золото': 'lvl-gold', 'Серебро': 'lvl-silver', 'Базовый': 'lvl-base' };

export function OperatorsPage() {
  const { role, operatorId } = useSession();
  return role === 'OKK' ? <Leaderboard /> : operatorId ? <MyRating id={operatorId} /> : <Empty title="Оператор не выбран" />;
}

function Rules() {
  return (
    <div className="card rules">
      <Award size={22} className="accent" />
      <div>
        <strong>Как считается рейтинг.</strong> Средний итоговый балл за последние 30 дней, минимум 5 оценённых диалогов.
        Диалоги с открытой апелляцией не учитываются, пока не решены. Любая грубая ошибка в периоде — без бонуса.
        <div className="levels">
          <span className="lvl lvl-plat">Платина ≥ 95 · +15%</span>
          <span className="lvl lvl-gold">Золото 85–94 · +10%</span>
          <span className="lvl lvl-silver">Серебро 70–84 · +5%</span>
          <span className="lvl lvl-base">Базовый &lt; 70 · обучение</span>
        </div>
      </div>
    </div>
  );
}

function Leaderboard() {
  const list = useLoad(() => api.leaderboard(), []);
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  return (
    <>
      <PageHeader title="Рейтинг операторов" subtitle={list.data[0]?.period ? `Период: ${list.data[0].period}` : undefined} />
      <Rules />
      {list.data.length === 0 ? <Empty title="Пока нет оценённых диалогов" /> : (
        <section className="card table-card">
          <table className="table">
            <thead><tr><th>Место</th><th>Оператор</th><th className="num">Балл</th><th className="num">Диалогов</th><th>Уровень</th><th>Бонус</th><th className="num">Грубые</th><th>Над чем работать</th></tr></thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.operatorId} className={r.eligible ? '' : 'dim'}>
                  <td>{r.rank ? <span className="rank">{r.rank <= 3 && <Medal size={16} />}{r.rank}</span> : '—'}</td>
                  <td><strong>{r.name}</strong>{r.badges.length > 0 && <div className="badges">{r.badges.map((b) => <span key={b} className="tag tag-ok">{b}</span>)}</div>}</td>
                  <td className="num"><ScoreBadge value={r.score} /></td>
                  <td className="num">{r.conversations}</td>
                  <td>{r.eligible ? <span className={`lvl ${LEVEL_CLS[r.level] ?? ''}`}>{r.level}</span> : <span className="muted small">мало диалогов</span>}</td>
                  <td className="small">{r.bonusLabel}</td>
                  <td className="num">{r.grossErrors > 0 ? <span className="text-danger">{r.grossErrors}</span> : 0}</td>
                  <td className="small">{r.weakCriteria.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function MyRating({ id }: { id: string }) {
  const r = useLoad(() => api.rating(id), [id]);
  if (r.error) return <><PageHeader title="Мой рейтинг" /><Empty title="Пока нет оценённых диалогов">{r.error}</Empty></>;
  if (!r.data) return <Loading />;
  const d: Rating = r.data;
  return (
    <>
      <PageHeader title="Мой рейтинг" subtitle={`Период: ${d.period}`} />
      <div className="kpis">
        <div className="kpi static"><span className="kpi-label">Мой средний балл</span><span className="kpi-value"><ScoreBadge value={d.score} large /></span></div>
        <div className="kpi static"><span className="kpi-label">Уровень</span><span className="kpi-value">{d.eligible ? <span className={`lvl ${LEVEL_CLS[d.level] ?? ''}`}>{d.level}</span> : '—'}</span></div>
        <div className="kpi static"><span className="kpi-label">Бонус</span><span className="kpi-value kpi-text">{d.bonusLabel}</span></div>
        <div className="kpi static"><span className="kpi-label">Место</span><span className="kpi-value">{d.rank ?? '—'}</span></div>
      </div>
      {d.pointsToNext !== null && d.eligible && <div className="alert alert-ok">До следующего уровня: <strong>{fmtScore(d.pointsToNext)}</strong> балла.</div>}
      {d.grossErrors > 0 && <div className="alert alert-danger"><TriangleAlert size={20} />В периоде есть грубая ошибка — бонус не начисляется.</div>}
      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">Над чем поработать</h2>
          {d.weakCriteria.length ? <ul className="weak-list">{d.weakCriteria.map((w) => <li key={w}>{w}</li>)}</ul> : <p className="muted">Слабых критериев нет — отличная работа.</p>}
        </section>
        <section className="card">
          <h2 className="card-title">Динамика по дням</h2>
          {d.trend.length === 0 ? <p className="muted">Нет данных.</p> : (
            <table className="table"><tbody>{d.trend.map((t) => <tr key={t.label}><td>{t.label}</td><td className="num"><ScoreBadge value={t.score} /></td></tr>)}</tbody></table>
          )}
        </section>
      </div>
      <Rules />
    </>
  );
}
