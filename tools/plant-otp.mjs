// 개발용: 인증번호 받기를 누른 뒤, 아는 코드(기본 123456)를 그 번호의 최신 코드로 심는다. 알림톡 전이라 콘솔 모드에선 실제 코드를 볼 수 없어서 쓴다.
// node --env-file=../.env.local plant-otp.mjs 01010000001 [123456]
import { createClient } from '@supabase/supabase-js';
const [phone, code = '123456'] = process.argv.slice(2);
if (!phone) { console.error('usage: plant-otp.mjs <phone digits> [code]'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code + phone)))].map(b => b.toString(16).padStart(2, '0')).join('');
const { error } = await sb.from('otp_codes').insert({ phone, code_hash: h, expires_at: new Date(Date.now() + 5 * 60e3).toISOString() });
console.log(error ? 'FAIL ' + error.message : `planted ${code} for ${phone}`);
