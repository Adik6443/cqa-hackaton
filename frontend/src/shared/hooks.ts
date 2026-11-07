import { useCallback, useEffect, useRef, useState } from 'react';

/** Keeps obsolete route/role/filter responses out of the current UI. */
export function useQuery<T>(key: string, loader: () => Promise<T>, pollMs = 0) {
  const loadRef = useRef(loader);
  loadRef.current = loader;
  const [state, setState] = useState<{ key: string; data?: T; error?: string; loading: boolean }>({
    key,
    loading: true,
  });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    setState((old) => ({ key, data: old.key === key ? old.data : undefined, loading: true }));
    async function run() {
      try {
        const data = await loadRef.current();
        if (active) setState({ key, data, loading: false });
      } catch (e) {
        if (active)
          setState((old) => ({
            ...old,
            loading: false,
            error: e instanceof Error ? e.message : 'Не удалось загрузить данные.',
          }));
      }
      if (active && pollMs) {
        if (++attempts < 150) timer = setTimeout(run, pollMs);
        else
          setState((old) => ({
            ...old,
            error:
              'Автообновление приостановлено после 5 минут. Нажмите «Повторить», чтобы продолжить.',
          }));
      }
    }
    void run();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, revision, pollMs]);
  return {
    ...(state.key === key ? state : { loading: true, data: undefined, error: undefined }),
    reload,
  };
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Действие не выполнено.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run, clearError: () => setError('') };
}
