import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createMemoryStore } from './memoryStore';
import { createSupabaseStore } from './supabaseStore';
import { hasSupabaseConfig } from './supabase';
import type { BoxStore } from './store';
import type { Session } from './types';

/**
 * 환경변수가 있으면 Supabase, 없으면 메모리 구현으로 돈다.
 * 구현이 바뀌어도 화면 코드는 BoxStore 만 본다.
 */
const store: BoxStore = hasSupabaseConfig ? createSupabaseStore() : createMemoryStore();

export const usingMemoryStore = !hasSupabaseConfig;

const StoreContext = createContext<BoxStore>(store);
const SessionContext = createContext<Session | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => store.getSession());
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const off = store.onSessionChange(setSession);
    void store.ready().then(() => setBooted(true));
    return off;
  }, []);

  // 세션 복구가 끝나기 전에 그리면 로그인 화면이 한 번 번쩍인다.
  if (!booted) return <div className="boot"><span className="boot-mark display">OLRW</span></div>;

  return (
    <StoreContext.Provider value={store}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </StoreContext.Provider>
  );
}

export const useStore = (): BoxStore => useContext(StoreContext);
export const useSession = (): Session | null => useContext(SessionContext);
