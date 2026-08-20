import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env['VITE_SUPABASE_URL'];
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

/** 환경변수가 없으면 memoryStore 로 돈다. 개발 중 빈 화면 대신 동작하는 앱을 본다. */
export const hasSupabaseConfig = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!hasSupabaseConfig) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다.');
  }
  client ??= createClient(url as string, anonKey as string, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    // 실시간 구독을 쓰지 않는다. (docs/decisions.md D6)
    realtime: { params: { eventsPerSecond: 0 } },
  });
  return client;
}
