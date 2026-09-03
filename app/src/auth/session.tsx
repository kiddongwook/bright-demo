import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
export type Membership = { id: string; academy_id: string; role: 'director'|'teacher'|'parent'|'student'; student_id: string|null; academy_name?: string; student_name?: string };
type Ctx = { session: Session|null; memberships: Membership[]; active: Membership|null; loading: boolean; limited: boolean;
  setFromVerify: (s: {access_token:string; refresh_token:string}, ms: Membership[]) => Promise<void>; pick: (id: string) => Promise<void>; logout: () => Promise<void>;
  enterLimited: () => void; endLimited: () => Promise<void> };
const C = createContext<Ctx>(null!);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session|null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [active, setActive] = useState<Membership|null>(null);
  const [loading, setLoading] = useState(true);
  // 제한 세션: 알림톡 링크로 열린 경우. 새로고침은 견디고(sessionStorage), 페이지를 떠나면 세션을 지운다 — 카톡 내장 브라우저에 남기지 않는다.
  const [limited, setLimited] = useState(() => { try { return sessionStorage.getItem('limited') === '1'; } catch { return false; } });
  const enterLimited = () => { try { sessionStorage.setItem('limited', '1'); } catch { /* 저장 못 해도 이번 화면은 제한 모드 */ } setLimited(true); };
  const endLimited = async () => { try { sessionStorage.removeItem('limited'); } catch { /* 없으면 그만 */ } setLimited(false); await supabase.auth.signOut({ scope: 'local' }); };
  useEffect(() => { if (!limited) return; const h = () => { supabase.auth.signOut({ scope: 'local' }); }; addEventListener('pagehide', h); return () => removeEventListener('pagehide', h); }, [limited]);
  // 세션·소속·활성 역할을 한 렌더에 넣는다 — 세션만 먼저 넣으면 소속이 오기 전 한순간 문(Gate)이 비친다.
  async function load(s: Session|null) {
    if (!s) { setSession(null); setMemberships([]); setActive(null); setLoading(false); return; }
    const { data: ms } = await supabase.from('memberships').select('id, academy_id, role, student_id, academies(name), students(name)');
    const list: Membership[] = (ms ?? []).map((m: any) => ({ id: m.id, academy_id: m.academy_id, role: m.role, student_id: m.student_id, academy_name: m.academies?.name, student_name: m.students?.name }));
    const { data: u } = await supabase.from('users').select('active_membership_id').eq('id', s.user.id).maybeSingle();
    // 사용자 행이 없거나 소속이 하나도 없으면(명부에서 빠짐·개발 정리) 묵은 세션을 버리고 문으로 돌아간다.
    if (!u || !list.length) { await supabase.auth.signOut(); setSession(null); setMemberships([]); setActive(null); setLoading(false); return; }
    setSession(s); setMemberships(list); setActive(list.find(m => m.id === u?.active_membership_id) ?? null); setLoading(false);
  }
  useEffect(() => { supabase.auth.getSession().then(({ data }) => load(data.session)); const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (_e !== 'INITIAL_SESSION') load(s); }); return () => sub.subscription.unsubscribe(); }, []);
  // 서버(otp-verify)가 역할이 하나면 active 를 이미 정해 둔다. 여기선 세션을 넣고 다시 읽기만 한다 — 상태 경합 없음.
  const setFromVerify: Ctx['setFromVerify'] = async (s) => { const { data } = await supabase.auth.setSession(s); await load(data.session); };
  const pick: Ctx['pick'] = async (id) => { await supabase.rpc('set_active_membership', { m: id }); const { data } = await supabase.auth.getSession(); await load(data.session); };
  const logout = async () => { await supabase.auth.signOut(); };
  return <C.Provider value={{ session, memberships, active, loading, limited, setFromVerify, pick, logout, enterLimited, endLimited }}>{children}</C.Provider>;
}
export const useSession = () => useContext(C);
