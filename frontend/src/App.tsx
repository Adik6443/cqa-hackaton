import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import {
  BarChart3, BookCheck, Bot, BrainCircuit, Coins, FileOutput, MessagesSquare, Scale, Trophy, UserRound, Users,
} from 'lucide-react';
import { api, type Operator, type Role } from './api';
import { useLoad } from './ui';
import { host } from './host';
import { DashboardPage } from './pages/Dashboard';
import { ConversationsPage } from './pages/Conversations';
import { ConversationPage } from './pages/ConversationCard';
import { AppealsPage } from './pages/Appeals';
import { ChecklistPage } from './pages/Checklist';
import { ModelsPage } from './pages/Models';
import { OperatorsPage } from './pages/Operators';
import { CorrectionsPage } from './pages/Corrections';
import { ResultsPage } from './pages/Results';
import { CostPage } from './pages/Cost';

// ---------- who is using the app (demo: no login, role switch in the top bar) ----------
interface Session {
  role: Role;
  operatorId: string | null;
  operators: Operator[];
  setRole: (r: Role) => void;
  setOperatorId: (id: string) => void;
  /** bump to refresh counters in the sidebar after an action */
  refresh: () => void;
  version: number;
}
const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx)!;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode */ }
}

function SessionProvider({ children }: { children: ReactNode }) {
  // Dynamics 365 can pass role / operator in the web resource "data" parameter
  const [role, setRoleState] = useState<Role>(host.role ?? ((read('cqa.role') as Role) || 'OKK'));
  const [operatorId, setOp] = useState<string | null>(host.operatorId ?? read('cqa.operator'));
  const [version, setVersion] = useState(0);
  const ops = useLoad(() => api.operators(), [version]);
  const operators = ops.data ?? [];
  useEffect(() => {
    if (operators.length && (!operatorId || !operators.some((o) => o.id === operatorId))) setOp(operators[0].id);
  }, [operators, operatorId]);
  const value = useMemo<Session>(() => ({
    role, operatorId, operators,
    setRole: (r) => { setRoleState(r); write('cqa.role', r); },
    setOperatorId: (id) => { setOp(id); write('cqa.operator', id); },
    refresh: () => setVersion((v) => v + 1),
    version,
  }), [role, operatorId, operators, version]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

// ---------- layout ----------
function Sidebar() {
  const { role, operatorId, version } = useSession();
  const okk = role === 'OKK';
  const open = useLoad(() => api.appeals('OPEN', okk ? undefined : operatorId ?? undefined), [okk, operatorId, version]);
  const openCount = open.data?.length ?? 0;
  const link = (to: string, icon: ReactNode, label: string, badge?: number) => (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      {icon}<span>{label}</span>{badge ? <span className="nav-badge">{badge}</span> : null}
    </NavLink>
  );
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-logo">F</span>
        <span className="brand-text"><strong>Freedom</strong> CQA<small>Контроль качества диалогов</small></span>
      </div>
      <nav>
        {okk ? (
          <>
            <div className="nav-group">Работа</div>
            {link('/dashboard', <BarChart3 size={20} />, 'Обзор')}
            {link('/conversations', <MessagesSquare size={20} />, 'Диалоги')}
            {link('/appeals', <Scale size={20} />, 'Апелляции', openCount)}
            <div className="nav-group">Настройки оценки</div>
            {link('/checklist', <BookCheck size={20} />, 'Чек-лист')}
            {link('/models', <Bot size={20} />, 'Модели AI')}
            {link('/corrections', <BrainCircuit size={20} />, 'Ошибки AI')}
            {link('/cost', <Coins size={20} />, 'Стоимость AI')}
            <div className="nav-group">Команда и отчёты</div>
            {link('/operators', <Trophy size={20} />, 'Рейтинг операторов')}
            {link('/results', <FileOutput size={20} />, 'Сдача результатов')}
          </>
        ) : (
          <>
            <div className="nav-group">Мои данные</div>
            {link('/conversations', <MessagesSquare size={20} />, 'Мои диалоги')}
            {link('/appeals', <Scale size={20} />, 'Мои апелляции', openCount)}
            {link('/operators', <Trophy size={20} />, 'Мой рейтинг')}
          </>
        )}
      </nav>
    </aside>
  );
}

function Topbar() {
  const { role, setRole, operatorId, setOperatorId, operators } = useSession();
  return (
    <header className="topbar">
      <div className="role-switch" role="group" aria-label="Роль">
        <button className={role === 'OKK' ? 'on' : ''} onClick={() => setRole('OKK')}><Users size={17} />Отдел качества</button>
        <button className={role === 'OPERATOR' ? 'on' : ''} onClick={() => setRole('OPERATOR')}><UserRound size={17} />Оператор</button>
      </div>
      {role === 'OPERATOR' && (
        <label className="inline-field">
          Оператор
          <select value={operatorId ?? ''} onChange={(e) => setOperatorId(e.target.value)}>
            {operators.length === 0 && <option value="">Нет операторов — загрузите диалоги</option>}
            {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}
      <span className="topbar-note">Демо-режим без входа: роль выбирается здесь</span>
    </header>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  const { role } = useSession();
  const okk = role === 'OKK';
  if (host.embedded) {
    // HTML component on a Dynamics 365 form: only the screen itself, Dynamics provides the navigation
    return <main className="content embedded">{routes(okk)}</main>;
  }
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        <main className="content">
          {routes(okk)}
        </main>
      </div>
    </div>
  );
}

function routes(okk: boolean) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={okk ? '/dashboard' : '/conversations'} replace />} />
      <Route path="/dashboard" element={okk ? <DashboardPage /> : <Navigate to="/conversations" replace />} />
      <Route path="/conversations" element={<ConversationsPage />} />
      <Route path="/conversations/:id" element={<ConversationPage />} />
      <Route path="/appeals" element={<AppealsPage />} />
      <Route path="/checklist" element={okk ? <ChecklistPage /> : <Navigate to="/conversations" replace />} />
      <Route path="/models" element={okk ? <ModelsPage /> : <Navigate to="/conversations" replace />} />
      <Route path="/corrections" element={okk ? <CorrectionsPage /> : <Navigate to="/conversations" replace />} />
      <Route path="/operators" element={<OperatorsPage />} />
      <Route path="/cost" element={okk ? <CostPage /> : <Navigate to="/conversations" replace />} />
      <Route path="/results" element={okk ? <ResultsPage /> : <Navigate to="/conversations" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
