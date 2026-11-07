import { useEffect } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  ClipboardCheck,
  Headphones,
  Layers3,
  MessageSquareText,
  Scale,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { SessionProvider, useSession } from './Session';
import { api, mockMode } from '../shared/api/client';
import { useQuery } from '../shared/hooks';
import { ConversationsPage } from '../pages/ConversationsPage';
import { ConversationReviewPage } from '../pages/ConversationReviewPage';
import { ChecklistPage } from '../pages/ChecklistPage';
import { AppealsPage } from '../pages/AppealsPage';
import { DashboardPage, InsightsPage } from '../pages/InsightsPage';
import { ErrorBox } from '../shared/ui';

function Layout() {
  const { scope, setRole, setOperator, revision } = useSession();
  const operators = useQuery('operators', () => api.operators());
  useEffect(() => {
    if (
      scope.role === 'OPERATOR' &&
      operators.data?.length &&
      !operators.data.some((o) => o.id === scope.operatorId)
    )
      setOperator(operators.data[0].id);
  }, [operators.data, scope.role, scope.operatorId]);
  const appeals = useQuery(`nav-appeals-${JSON.stringify(scope)}-${revision}`, () =>
    api.appeals(scope, 'OPEN'),
  );
  const okk = scope.role === 'OKK';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <aside className="sidebar">
        <NavLink to="/conversations" className="brand">
          <span className="brand-mark">
            <Activity size={24} />
          </span>
          <span>
            freedom<span className="brand-sub">BROKER · QUALITY</span>
          </span>
        </NavLink>
        <div className="workspace-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Основная навигация">
          {okk && (
            <NavLink to="/dashboard">
              <BarChart3 size={19} />
              Обзор
            </NavLink>
          )}
          <NavLink to="/conversations">
            <MessageSquareText size={19} />
            {okk ? 'Диалоги' : 'Мои оценки'}
          </NavLink>
          <NavLink to="/appeals">
            <Scale size={19} />
            {okk ? 'Апелляции' : 'Мои апелляции'}
            <span className="nav-count">{appeals.data?.length ?? '—'}</span>
          </NavLink>
          {okk && (
            <NavLink to="/checklists">
              <ClipboardCheck size={19} />
              Чек-листы
            </NavLink>
          )}
          <div className="nav-divider" />
          <div className="workspace-label">РАЗВИТИЕ КАЧЕСТВА</div>
          <NavLink to="/operators">
            <Trophy size={19} />
            {okk ? 'Операторы' : 'Мой рейтинг'}
          </NavLink>
          {okk && (
            <NavLink to="/corrections">
              <Layers3 size={19} />
              Ошибки AI
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={22} />
          <strong>
            Качество начинается
            <br />с диалога.
          </strong>
          <p>
            Проверка с контекстом.
            <br />
            Решения с объяснением.
          </p>
          <span>
            Freedom CQA <ArrowUpRight size={13} />
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <Headphones size={18} />
            <span>Conversation Quality Analytics</span>
            <span className="header-divider" />
            <span className="muted">Демо-пространство</span>
          </div>
          <div className="role-controls">
            <label>
              Роль
              <select
                aria-label="Роль"
                value={scope.role}
                onChange={(e) => setRole(e.target.value as 'OKK' | 'OPERATOR')}
              >
                <option value="OKK">Контроль качества · ОКК</option>
                <option value="OPERATOR">Оператор</option>
              </select>
            </label>
            {!okk && (
              <label>
                Я — оператор
                <select
                  aria-label="Я — оператор"
                  value={scope.operatorId}
                  onChange={(e) => setOperator(e.target.value)}
                >
                  {operators.data?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.fictional ? ' · демо' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="avatar">{okk ? 'ОК' : 'ОП'}</div>
          </div>
        </header>
        <div className="demo-banner">
          <span className="demo-dot" />
          {mockMode
            ? 'ДЕМО · Вымышленные диалоги и назначения операторов. Оценки AI симулированы.'
            : 'ДЕМО-РОЛИ · Без авторизации. Назначения операторов вымышленные.'}
          <span className="banner-mode">
            {mockMode ? 'Mock API' : 'Java API · предварительный контракт'}
          </span>
        </div>
        <main id="main" className="main">
          <ErrorBox message={operators.error} retry={operators.reload} />
          <Outlet key={`${scope.role}-${scope.operatorId ?? ''}`} />
        </main>
      </div>
    </div>
  );
}
function OkkOnly({ children }: { children: React.ReactNode }) {
  return useSession().scope.role === 'OKK' ? children : <Navigate to="/conversations" replace />;
}
export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/conversations" replace />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="conversations/:conversationId" element={<ConversationReviewPage />} />
          <Route path="appeals" element={<AppealsPage />} />
          <Route path="appeals/:appealId" element={<AppealsPage />} />
          <Route
            path="checklists"
            element={
              <OkkOnly>
                <ChecklistPage />
              </OkkOnly>
            }
          />
          <Route
            path="dashboard"
            element={
              <OkkOnly>
                <DashboardPage />
              </OkkOnly>
            }
          />
          <Route path="operators" element={<InsightsPage />} />
          <Route
            path="corrections"
            element={
              <OkkOnly>
                <InsightsPage corrections />
              </OkkOnly>
            }
          />
          <Route
            path="*"
            element={
              <div className="empty">
                <h1>Страница не найдена</h1>
                <NavLink to="/conversations">Вернуться к диалогам</NavLink>
              </div>
            }
          />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
