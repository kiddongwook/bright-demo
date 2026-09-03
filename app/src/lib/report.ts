import { supabase } from './supabase';
import { getContext } from './api';
import { currentEnv } from './env';

/* 앱에서 난 오류를 client_errors 에 남긴다 — 원장님 폰에서 난 일을 원격에서 본다.
   개인정보를 싣지 않는다: 메시지·스택 앞 1,000자만, 번호 모양은 가린다. 절대 던지지 않는다. */

let currentScreen = '';
export const setReportScreen = (view: string) => { currentScreen = view; };

const PHONE = /01[016789]-?\d{3,4}-?\d{4}/g;
const mask = (s: string) => s.replace(PHONE, '010-****-****');

const recent: number[] = [];   // 1분에 5건까지 — 오류 폭주가 표를 채우지 않게
function allowed(): boolean {
  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= 5) return false;
  recent.push(now);
  return true;
}

export async function reportError(err: unknown, where?: string): Promise<void> {
  try {
    const { academyId, userId } = getContext();
    if (!userId) return;               // 로그인 전에는 보내지 않는다 (RLS·FK 도 막는다)
    if (!allowed()) return;
    const o = err as { message?: unknown; stack?: unknown } | null | undefined;
    const message = mask(String(o?.message ?? err)).slice(0, 1000);
    const stack = mask(String(o?.stack ?? '')).slice(0, 1000);
    await supabase.from('client_errors').insert({
      academy_id: academyId || null, user_id: userId, version: __BUILD__,
      screen: where ?? currentScreen, env: currentEnv(), message, stack, ua: navigator.userAgent,
    });
  } catch { /* 보고가 또 오류를 내면 조용히 접는다 */ }
}

let installed = false;
export function installErrorReporting() {
  if (installed) return;
  installed = true;
  addEventListener('error', e => { void reportError(e.error ?? e.message, 'window'); });
  addEventListener('unhandledrejection', e => { void reportError(e.reason, 'promise'); });
}
