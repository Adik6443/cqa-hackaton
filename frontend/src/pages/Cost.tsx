import { useCallback, useEffect, useState } from 'react';
import { Coins, FlaskConical, Info, Save } from 'lucide-react';
import { api, type CostRow, type Price } from '../api';
import { ErrorBox, Loading, PageHeader, Toast, useLoad } from '../ui';

const VIEWS: { key: string; label: string; question: string }[] = [
  { key: 'language', label: 'Язык', question: 'Дороже ли казахский и английский, чем русский, при той же длине?' },
  { key: 'length', label: 'Длина текста', question: 'Насколько цена растёт с длиной диалога (символы)?' },
  { key: 'messages', label: 'Число реплик', question: 'Сколько стоят короткие и длинные переписки?' },
  { key: 'model', label: 'Модель', question: 'Какая модель дешевле на одних и тех же диалогах?' },
  { key: 'languageModel', label: 'Язык × модель', question: 'Какую модель выгоднее ставить на каждый язык?' },
  { key: 'channel', label: 'Чат / звонок', question: 'Звонки длиннее — сколько они стоят?' },
  { key: 'attempts', label: 'Повторы', question: 'Сколько стоят повторные запросы, когда ответ AI не прошёл проверку?' },
  { key: 'corrections', label: 'Примеры ошибок AI', question: 'Насколько дорожает запрос, когда в него добавлены примеры из апелляций?' },
  { key: 'checklist', label: 'Версия чек-листа', question: 'Изменил ли новый критерий цену оценки?' },
];

const usd = (v: number | null | undefined, digits = 4) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(digits)}`);
const int = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(Number(v)).toLocaleString('ru-RU'));

export function CostPage() {
  const [by, setBy] = useState('language');
  const [provider, setProvider] = useState('');
  const [since, setSince] = useState('');
  const [includeMock, setIncludeMock] = useState(false);
  const report = useLoad(() => api.cost(by, { provider: provider || undefined, since: since || undefined, includeMock }), [by, provider, since, includeMock]);
  const prices = useLoad(() => api.prices(), []);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'danger' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const t = report.data?.total;
  const view = VIEWS.find((v) => v.key === by)!;
  const maxAvg = Math.max(...(report.data?.rows ?? []).map((r) => Number(r.avgCostUsd ?? 0)), 0);
  const cacheShare = t && t.avgTokensIn ? Number(t.avgTokensCached ?? 0) / Number(t.avgTokensIn) : null;

  return (
    <>
      <PageHeader title="Стоимость AI" subtitle="Сколько стоит одна оценка и от чего зависит цена. Считаются все запуски, включая переоценки и тесты моделей." />

      <section className="card filters">
        <div className="filter-row">
          <label className={`sel${provider ? ' act' : ''}`}><span className="k">Провайдер:</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">Все</option><option value="OPENAI">OpenAI</option><option value="ANTHROPIC">Anthropic</option><option value="GEMINI">Gemini</option>
            </select>
          </label>
          <label className={`sel${since ? ' act' : ''}`}><span className="k">С даты:</span><input type="date" value={since} onChange={(e) => setSince(e.target.value)} /></label>
          <label className="check small"><input type="checkbox" checked={includeMock} onChange={(e) => setIncludeMock(e.target.checked)} />Учитывать демо-оценки</label>
        </div>
      </section>

      {report.error && <ErrorBox message={report.error} onRetry={report.reload} />}
      {!report.data && report.loading && <Loading />}
      {t && (
        <div className="kpis">
          <div className="kpi static"><span className="kpi-label">Оценок с токенами</span><span className="kpi-value">{t.evaluations}</span>
            <span className="small muted">{t.unpriced > 0 ? `без цены: ${t.unpriced} — заполните цены ниже` : 'все с ценой'}</span></div>
          <div className="kpi static"><span className="kpi-label">Потрачено</span><span className="kpi-value">{usd(t.totalCostUsd, 2)}</span>
            <span className="small muted">по ценам из таблицы ниже</span></div>
          <div className="kpi static"><span className="kpi-label">Одна оценка</span><span className="kpi-value">{usd(t.avgCostUsd)}</span>
            <span className="small muted">{int(t.avgTokensIn)} вход · {int(t.avgTokensOut)} выход токенов</span></div>
          <div className="kpi static"><span className="kpi-label">1 000 диалогов</span><span className="kpi-value">{usd(t.costPer1000Usd, 2)}</span>
            <span className="small muted">кэш промпта: {cacheShare === null ? '—' : `${Math.round(cacheShare * 100)}% входа`}</span></div>
        </div>
      )}

      {report.data && (
        <section className="card table-card">
          <div className="card-head pad-head">
            <div className="tabs small-tabs">
              {VIEWS.map((v) => <button key={v.key} className={by === v.key ? 'on' : ''} onClick={() => setBy(v.key)}>{v.label}</button>)}
            </div>
          </div>
          <p className="pad-text muted small"><Info size={14} />{view.question}</p>
          {report.data.rows.length === 0 ? <div className="state">Нет оценок с данными о токенах. Оцените несколько диалогов настоящей моделью.</div> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th>{view.label}</th><th className="num">Оценок</th><th className="num">Символов</th><th className="num">Вход, ток.</th>
                  <th className="num">из них кэш</th><th className="num">Выход, ток.</th><th className="num" title="Токенов входа на 1000 символов диалога: показывает, насколько «дорогой» язык для токенизатора">Ток./1000 симв.</th>
                  <th className="num">Попыток</th><th className="num">Время</th><th>Цена оценки</th><th className="num">1 000 шт.</th><th className="num">Всего</th>
                </tr></thead>
                <tbody>
                  {report.data.rows.map((r: CostRow) => (
                    <tr key={r.key}>
                      <td><strong>{r.label}</strong>{r.unpriced > 0 && <div className="small text-danger">без цены: {r.unpriced}</div>}</td>
                      <td className="num">{r.evaluations}</td>
                      <td className="num">{int(r.avgChars)}</td>
                      <td className="num">{int(r.avgTokensIn)}</td>
                      <td className="num muted">{int(r.avgTokensCached)}</td>
                      <td className="num">{int(r.avgTokensOut)}</td>
                      <td className="num">{r.tokensPer1kChars ?? '—'}</td>
                      <td className="num">{r.avgAttempts ?? '—'}</td>
                      <td className="num">{r.avgLatencyMs ? `${(Number(r.avgLatencyMs) / 1000).toFixed(1)} с` : '—'}</td>
                      <td>
                        <div className="minibar">
                          <span className="minibar-track"><span className="f-brand" style={{ width: `${maxAvg ? (Number(r.avgCostUsd ?? 0) / maxAvg) * 100 : 0}%` }} /></span>
                          <span className="num">{usd(r.avgCostUsd)}</span>
                        </div>
                      </td>
                      <td className="num">{usd(r.costPer1000Usd, 2)}</td>
                      <td className="num">{usd(r.totalCostUsd, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <PricesCard prices={prices.data} error={prices.error}
                  onSaved={(m) => { setToast({ text: `Цена ${m} сохранена` }); prices.reload(); report.reload(); }}
                  onError={(x) => setToast({ text: x, tone: 'danger' })} />

      <section className="card">
        <h2 className="card-title"><FlaskConical size={18} />Как провести тест стоимости</h2>
        <ol className="plan">
          <li><strong>Один и тот же набор.</strong> На странице «Диалоги» отметьте галочками 9 диалогов: по 3 на RU, KZ, EN — короткий, средний и длинный.</li>
          <li><strong>Прогон каждой моделью.</strong> В строке над таблицей выберите «Модель: OPENAI», нажмите «Оценить выбранные». Затем то же с ANTHROPIC и GEMINI. Прошлые оценки не теряются — они в истории карточки.</li>
          <li><strong>Сравнение здесь.</strong> Вкладки «Язык», «Длина текста», «Модель», «Язык × модель». Столбец «Ток./1000 симв.» показывает, во сколько токенов обходится одинаковый объём текста на разных языках.</li>
          <li><strong>Качество, не только цена.</strong> Откройте карточки и сравните ответы моделей в «Истории оценок». Вывод — какая модель на каком языке — запишите в памятку на странице «Модели AI».</li>
        </ol>
      </section>
      {toast && <Toast text={toast.text} tone={toast.tone} onClose={closeToast} />}
    </>
  );
}

function PricesCard({ prices, error, onSaved, onError }: { prices: Price[] | null; error: string | null; onSaved: (m: string) => void; onError: (t: string) => void }) {
  return (
    <section className="card table-card">
      <div className="card-head pad-head">
        <h2><Coins size={18} />Цены моделей</h2>
        <span className="muted small">USD за 1 млн токенов, со страницы цен провайдера. Изменение цены пересчитывает всю историю.</span>
      </div>
      {error && <ErrorBox message={error} />}
      {prices && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Модель</th><th>Вход</th><th>Вход из кэша</th><th>Выход</th><th /></tr></thead>
            <tbody>
              {prices.length === 0 && <tr><td colSpan={5} className="muted">Модели появятся здесь после первой оценки или выбора на странице «Модели AI».</td></tr>}
              {prices.map((p) => <PriceRow key={p.model} p={p} onSaved={onSaved} onError={onError} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PriceRow({ p, onSaved, onError }: { p: Price; onSaved: (m: string) => void; onError: (t: string) => void }) {
  const s = (v: number | null) => (v === null ? '' : String(v));
  const [inp, setInp] = useState(s(p.inputPerMtok));
  const [cached, setCached] = useState(s(p.cachedPerMtok));
  const [out, setOut] = useState(s(p.outputPerMtok));
  useEffect(() => { setInp(s(p.inputPerMtok)); setCached(s(p.cachedPerMtok)); setOut(s(p.outputPerMtok)); }, [p]);
  const dirty = inp !== s(p.inputPerMtok) || cached !== s(p.cachedPerMtok) || out !== s(p.outputPerMtok);
  const num = (v: string) => Number(v.replace(',', '.'));
  const valid = inp !== '' && out !== '' && !Number.isNaN(num(inp)) && !Number.isNaN(num(out)) && (cached === '' || !Number.isNaN(num(cached)));
  const save = async () => {
    try { await api.savePrice(p.model, { inputPerMtok: num(inp), cachedPerMtok: cached === '' ? null : num(cached), outputPerMtok: num(out) }); onSaved(p.model); }
    catch (e) { onError((e as Error).message); }
  };
  return (
    <tr>
      <td><span className="mono">{p.model}</span>{!p.used && <div className="small muted">ещё не использовалась</div>}{p.inputPerMtok === null && <div className="small text-danger">цена не задана</div>}</td>
      <td><input className="price-input" inputMode="decimal" value={inp} onChange={(e) => setInp(e.target.value)} placeholder="напр. 2.00" aria-label={`Вход ${p.model}`} /></td>
      <td><input className="price-input" inputMode="decimal" value={cached} onChange={(e) => setCached(e.target.value)} placeholder="= вход" aria-label={`Кэш ${p.model}`} /></td>
      <td><input className="price-input" inputMode="decimal" value={out} onChange={(e) => setOut(e.target.value)} placeholder="напр. 8.00" aria-label={`Выход ${p.model}`} /></td>
      <td className="num"><button className="btn btn-sm btn-primary" disabled={!dirty || !valid} onClick={save}><Save size={15} />Сохранить</button></td>
    </tr>
  );
}
