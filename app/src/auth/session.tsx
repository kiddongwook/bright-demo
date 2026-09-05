import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
export type Membership = { id: string; academy_id: string; role: 'director'|'teacher'|'parent'|'student'; student_id: string|null; academy_name?: string; student_name?: string };
type Ctx = { session: Session|null; memberships: Membership[]; active: Membership|null; loading: boolean; limited: boolean;
  /** BRIGHT 운영자인가 (app_operators). 소속과는 상관없다 — 사장님은 어느 학원의 원장이면서 운영자일 수 있다. */
  isOperator: boolean;
  /** 지금 운영 화면을 보고 있나. 소속이 하나도 없는 운영자는 늘 참. */
  opMode: boolean;
  /** 역할을 아직 안 골랐다 — 운영자이면서 소속도 있는 사람은 서버가 정해 준 active 를 건너뛰고 한 번 묻는다. */
  pickPending: boolean;
  setFromVerify: (s: {access_token:string; refresh_token:string}, ms: Membership[], operator?: boolean) => Promise<void>; pick: (id: string) => Promise<void>; logout: () => Promise<void>;
  enterOperator: () => void; exitOperator: () => void;
  enterLimited: () => void; endLimited: () => Promise<void> };
const C = createContext<Ctx>(null!);
/* 운영 화면에 머무르는 표식 — 새로고침해도 운영자가 원장 화면으로 튕기지 않게. 로그아웃하면 지운다. */
const OP_KEY = 'op_mode';
const readOpMode = () => { try { return localStorage.getItem(OP_KEY) === '1'; } catch { return false; } };
/* 이번에 들어온 사람이 운영자이면서 소속도 있다 → 역할 고르기를 한 번 보여 준다.
   서버(_shared/auth.ts)는 소속이 하나면 active 를 미리 정해 두므로, 그것만 믿으면 사장님은 운영 화면을 볼 길이 없다.
   sessionStorage 라 새로고침은 견디고(아직 안 골랐다), 새 탭·다음 방문에는 고른 역할로 바로 간다. */
const PICK_KEY = 'pick_pending';
const readPick = () => { try { return sessionStorage.getItem(PICK_KEY) === '1'; } catch { return false; } };
const writePick = (v: boolean) => { try { if (v) sessionStorage.setItem(PICK_KEY, '1'); else sessionStorage.removeItem(PICK_KEY); } catch { /* 저장소가 막혀도 이번 화면은 그대로 */ } };
const writeOpMode = (v: boolean) => { try { if (v) localStorage.setItem(OP_KEY, '1'); else localStorage.removeItem(OP_KEY); } catch { /* 저장소가 막혀도 이번 화면은 그대로 */ } };
// 제한 세션 표식은 localStorage 에도 둔다. 탭이 pagehide 없이 죽으면(카톡 웹뷰 강제 종료 등) 토큰만 남아 다음에 전체 세션이 돼 버린다 —
// 새 탭에서 표식은 있는데 sessionStorage 깃발이 없으면 그 토큰을 버린다. 렌더 전에 한 번.
try {
  if (localStorage.getItem('limited_session') === '1' && sessionStorage.getItem('limited') !== '1') {
    localStorage.removeItem('limited_session'); void supabase.auth.signOut({ scope: 'local' });
  }
} catch { /* 저장소가 막힌 환경이면 그냥 지나간다 */ }
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session|null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [active, setActive] = useState<Membership|null>(null);
  const [isOperator, setIsOperator] = useState(false);
  const [opMode, setOpMode] = useState(readOpMode);
  const [pickPending, setPickPending] = useState(readPick);
  const [loading, setLoading] = useState(true);
  // 제한 세션: 알림톡 링크로 열린 경우. 새로고침은 견디고(sessionStorage), 페이지를 떠나면 세션을 지운다 — 카톡 내장 브라우저에 남기지 않는다.
  const [limited, setLimited] = useState(() => { try { return sessionStorage.getItem('limited') === '1'; } catch { return false; } });
  const enterLimited = () => { try { sessionStorage.setItem('limited', '1'); localStorage.setItem('limited_session', '1'); } catch { /* 저장 못 해도 이번 화면은 제한 모드 */ } setLimited(true); };
  const endLimited = async () => { try { sessionStorage.removeItem('limited'); localStorage.removeItem('limited_session'); } catch { /* 없으면 그만 */ } setLimited(false); await supabase.auth.signOut({ scope: 'local' }); };
  useEffect(() => { if (!limited) return; const h = () => { supabase.auth.signOut({ scope: 'local' }); }; addEventListener('pagehide', h); return () => removeEventListener('pagehide', h); }, [limited]);
  // 세션·소속·활성 역할을 한 렌더에 넣는다 — 세션만 먼저 넣으면 소속이 오기 전 한순간 문(Gate)이 비친다.
  async function load(s: Session|null, operatorHint = false) {
    if (!s) { setSession(null); setMemberships([]); setActive(null); setIsOperator(false); setLoading(false); return; }
    // 운영자인지는 소속과 함께 한 번에 묻는다 — 새로고침에는 verify 응답이 없으니 스스로 알아야 한다(기기에 남긴 표식만 믿지 않는다).
    const [{ data: ms }, op] = await Promise.all([
      supabase.from('memberships').select('id, academy_id, role, student_id, academies(name), students(name)'),
      supabase.rpc('is_operator').then(r => r.data === true, () => false),
    ]);
    const list: Membership[] = (ms ?? []).map((m: any) => ({ id: m.id, academy_id: m.academy_id, role: m.role, student_id: m.student_id, academy_name: m.academies?.name, student_name: m.students?.name }));
    const operator = op || operatorHint;
    const { data: u } = await supabase.from('users').select('active_membership_id').eq('id', s.user.id).maybeSingle();
    // 사용자 행이 없거나 소속이 하나도 없으면(명부에서 빠짐·개발 정리) 묵은 세션을 버리고 문으로 돌아간다.
    // 운영자는 예외다 — 어느 학원의 소속도 아닌 것이 정상이라, 소속이 비어도 세션을 지킨다.
    if (!u || (!list.length && !operator)) { await supabase.auth.signOut(); setSession(null); setMemberships([]); setActive(null); setIsOperator(false); setLoading(false); return; }
    if (!operator) writeOpMode(false);   // 운영자에서 내려온 계정의 묵은 표식은 지운다 (opMode 는 isOperator 와 함께 꺼진다)
    setSession(s); setMemberships(list); setIsOperator(operator); setActive(list.find(m => m.id === u?.active_membership_id) ?? null); setLoading(false);
  }
  useEffect(() => { supabase.auth.getSession().then(({ data }) => load(data.session)); const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (_e !== 'INITIAL_SESSION') load(s); }); return () => sub.subscription.unsubscribe(); }, []);
  // 서버(otp-verify)가 역할이 하나면 active 를 이미 정해 둔다. 여기선 세션을 넣고 다시 읽기만 한다 — 상태 경합 없음.
  const setFromVerify: Ctx['setFromVerify'] = async (s, ms, operator) => {
    // 운영자이면서 소속도 있으면 역할을 묻는다 — 서버가 정해 둔 active 를 그대로 따르면 운영 화면에 들어갈 길이 없다.
    const ask = !!operator && !!ms.length; writePick(ask); setPickPending(ask);
    const { data } = await supabase.auth.setSession(s); await load(data.session, !!operator);
  };
  const pick: Ctx['pick'] = async (id) => { writeOpMode(false); setOpMode(false); writePick(false); setPickPending(false); await supabase.rpc('set_active_membership', { m: id }); const { data } = await supabase.auth.getSession(); await load(data.session); };
  const logout = async () => { writeOpMode(false); setOpMode(false); writePick(false); setPickPending(false); await supabase.auth.signOut(); };
  // 역할 고르기·더보기의 "BRIGHT 운영자" — 누르면 운영 화면으로. 돌아갈 때는 소속을 다시 고른다.
  const enterOperator = () => { writeOpMode(true); setOpMode(true); writePick(false); setPickPending(false); };
  // 운영 화면에서 나가기 = 역할을 다시 고르기. 소속이 하나뿐이어도 고르는 화면을 보여 준다(안 그러면 곧장 그 역할로 빨려 든다).
  const exitOperator = () => { writeOpMode(false); setOpMode(false); writePick(true); setPickPending(true); };
  return <C.Provider value={{ session, memberships, active, loading, limited, isOperator, opMode: isOperator && (opMode || !memberships.length), pickPending: isOperator && pickPending && !!memberships.length, setFromVerify, pick, logout, enterOperator, exitOperator, enterLimited, endLimited }}>{children}</C.Provider>;
}
export const useSession = () => useContext(C);
