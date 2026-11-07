import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleOff, NotebookPen, Save } from 'lucide-react';
import { api, type Route } from '../api';
import { ErrorBox, LANGS, Loading, PageHeader, Toast, useLoad } from '../ui';

const LANG_ROWS = [...Object.entries(LANGS), ['DEFAULT', 'Остальные языки']];
const NAMES: Record<string, string> = { ANTHROPIC: 'Claude (Anthropic)', OPENAI: 'GPT (OpenAI)', GEMINI: 'Gemini (Google)', MOCK: 'Демо без AI' };

export function ModelsPage() {
  const providers = useLoad(() => api.providers(), []);
  const routes = useLoad(() => api.routes(), []);
  const memo = useLoad(() => api.memo(), []);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'danger' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  if (providers.error || routes.error) return <ErrorBox message={(providers.error || routes.error)!} />;
  if (!providers.data || !routes.data) return <Loading />;

  return (
    <>
      <PageHeader title="Модели AI" subtitle="Какая модель оценивает диалоги на каждом языке. Ключи моделей задаются в application-local.properties бэкенда." />
      <section className="card">
        <h2 className="card-title">Подключённые модели</h2>
        <div className="providers">
          {providers.data.map((p) => (
            <div key={p.provider} className={`provider ${p.available ? 'on' : 'off'}`}>
              {p.available ? <CheckCircle2 size={20} /> : <CircleOff size={20} />}
              <div><strong>{NAMES[p.provider] ?? p.provider}</strong><div className="muted small">{p.available ? `готова · ${p.defaultModel}` : 'нет ключа'}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="card table-card">
        <h2 className="card-title pad">Модель для каждого языка</h2>
        <table className="table">
          <thead><tr><th>Язык</th><th>Модель</th><th>Версия модели</th><th></th></tr></thead>
          <tbody>
            {LANG_ROWS.map(([lang, label]) => (
              <RouteRow key={lang} lang={lang} label={label} route={routes.data!.find((r) => r.language === lang)}
                        providers={providers.data!.map((p) => ({ id: p.provider, available: p.available, def: p.defaultModel }))}
                        onSaved={() => { setToast({ text: `Сохранено: ${label}` }); routes.reload(); }}
                        onError={(t) => setToast({ text: t, tone: 'danger' })} />
            ))}
          </tbody>
        </table>
      </section>

      <MemoCard text={memo.data?.text ?? ''} onSaved={() => setToast({ text: 'Памятка сохранена' })} onError={(t) => setToast({ text: t, tone: 'danger' })} />
      {toast && <Toast text={toast.text} tone={toast.tone} onClose={closeToast} />}
    </>
  );
}

function RouteRow({ lang, label, route, providers, onSaved, onError }: {
  lang: string; label: string; route?: Route; providers: { id: string; available: boolean; def: string }[];
  onSaved: () => void; onError: (t: string) => void;
}) {
  const [provider, setProvider] = useState(route?.provider ?? 'MOCK');
  const [model, setModel] = useState(route?.model ?? '');
  useEffect(() => { setProvider(route?.provider ?? 'MOCK'); setModel(route?.model ?? ''); }, [route]);
  const dirty = provider !== route?.provider || model !== route?.model;
  const save = async () => {
    try { await api.saveRoute(lang, provider, model); onSaved(); } catch (e) { onError((e as Error).message); }
  };
  return (
    <tr>
      <td><strong>{label}</strong></td>
      <td>
        <select value={provider} onChange={(e) => { setProvider(e.target.value); setModel(providers.find((p) => p.id === e.target.value)?.def ?? ''); }}>
          {providers.map((p) => <option key={p.id} value={p.id}>{NAMES[p.id] ?? p.id}{p.available ? '' : ' — нет ключа'}</option>)}
        </select>
      </td>
      <td><input value={model} onChange={(e) => setModel(e.target.value)} /></td>
      <td className="row-end"><button className="btn btn-sm btn-primary" disabled={!dirty} onClick={save}><Save size={16} />Сохранить</button></td>
    </tr>
  );
}

function MemoCard({ text, onSaved, onError }: { text: string; onSaved: () => void; onError: (t: string) => void }) {
  const [value, setValue] = useState(text);
  useEffect(() => setValue(text), [text]);
  return (
    <section className="card">
      <h2 className="card-title"><NotebookPen size={20} />Памятка для отдела качества</h2>
      <p className="muted small">Запишите выводы: какая модель лучше справилась с каким языком (по результатам теста на одних и тех же диалогах).</p>
      <textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} className="full" />
      <div className="row-end">
        <button className="btn btn-primary" disabled={value === text} onClick={async () => { try { await api.saveMemo(value); onSaved(); } catch (e) { onError((e as Error).message); } }}>
          <Save size={16} />Сохранить памятку
        </button>
      </div>
    </section>
  );
}
