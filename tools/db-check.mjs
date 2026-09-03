import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const need = ['academies','users','memberships','classes','students','enrollments','guardians','roster_phones',
  'attendance','absence_requests','notices','notice_reads','inquiries','faqs','todos','todo_done','notes','calendar',
  'notifications','outbox','link_tokens','otp_codes','audit_log',
  'billing_rules','fee_plans','invoices','payments'];
const { data, error } = await sb.rpc('list_public_tables');
if (error) { console.log('FAIL:', error.message); process.exit(1); }
const have = new Set(data.map(r => r.table_name));
const missing = need.filter(t => !have.has(t));
console.log(missing.length ? 'FAIL: missing ' + missing.join(',') : 'PASS: ' + need.length + ' tables');
process.exit(missing.length ? 1 : 0);
