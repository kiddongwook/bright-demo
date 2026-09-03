import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
export type Membership = { id: string; academy_id: string; role: 'director'|'teacher'|'parent'|'student'; student_id: string|null; academy_name?: string; student_name?: string };
type Ctx = { session: Session|null; memberships: Membership[]; active: Membership|null; loading: boolean;
  setFromVerify: (s: {access_token:string; refresh_token:string}, ms: Membership[]) => Promise<void>; pick: (id: string) => Promise<void>; logout: () => Promise<void> };
const C = createContext<Ctx>(null!);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session|null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [active, setActive] = useState<Membership|null>(null);
  const [loading, setLoading] = useState(true);
  async function load(s: Session|null) {
    setSession(s);
    if (!s) { setMemberships([]); setActive(null); setLoading(false); return; }
    const { data: ms } = await supabase.from('memberships').select('id, academy_id, role, student_id, academies(name), students(name)');
    const list: Membership[] = (ms ?? []).map((m: any) => ({ id: m.id, academy_id: m.academy_id, role: m.role, student_id: m.student_id, academy_name: m.academies?.name, student_name: m.students?.name }));
    const { data: u } = await supabase.from('users').select('active_membership_id').eq('id', s.user.id).single();
    setMemberships(list); setActive(list.find(m => m.id === u?.active_membership_id) ?? null); setLoading(false);
  }
  useEffect(() => { supabase.auth.getSession().then(({ data }) => load(data.session)); const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (_e !== 'INITIAL_SESSION') load(s); }); return () => sub.subscription.unsubscribe(); }, []);
  // 서버(otp-verify)가 역할이 하나면 active 를 이미 정해 둔다. 여기선 세션을 넣고 다시 읽기만 한다 — 상태 경합 없음.
  const setFromVerify: Ctx['setFromVerify'] = async (s) => { const { data } = await supabase.auth.setSession(s); await load(data.session); };
  const pick: Ctx['pick'] = async (id) => { await supabase.rpc('set_active_membership', { m: id }); const { data } = await supabase.auth.getSession(); await load(data.session); };
  const logout = async () => { await supabase.auth.signOut(); };
  return <C.Provider value={{ session, memberships, active, loading, setFromVerify, pick, logout }}>{children}</C.Provider>;
}
export const useSession = () => useContext(C);
