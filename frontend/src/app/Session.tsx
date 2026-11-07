import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Role, Scope } from '../shared/api/types';
const Context = createContext<null | {
  scope: Scope;
  setRole: (role: Role) => void;
  setOperator: (id: string) => void;
  revision: number;
  refresh: () => void;
}>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('OKK');
  const [operatorId, setOperator] = useState('demo-op-1');
  const [revision, setRevision] = useState(0);
  return (
    <Context.Provider
      value={{
        scope: { role, operatorId: role === 'OPERATOR' ? operatorId : undefined },
        setRole,
        setOperator,
        revision,
        refresh: () => setRevision((n) => n + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('SessionProvider missing');
  return value;
}
