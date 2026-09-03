// 한 번만: OUTBOX_KEY 를 만들고 Edge secrets·app_settings·.env.local 에 넣는다. 값은 화면에 찍지 않는다.
// node --env-file=../.env.local setup-outbox.mjs [APP_URL]
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const key = process.env.OUTBOX_KEY || [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
const appUrl = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:4174';
const url = `${process.env.SUPABASE_URL}/functions/v1/outbox-send`;
execSync(`npx supabase secrets set OUTBOX_KEY=${key} APP_URL=${appUrl} ALIMTALK_PROVIDER=${process.env.ALIMTALK_PROVIDER ?? 'console'}`, { stdio: ['ignore', 'ignore', 'inherit'], cwd: '..' });
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { error } = await admin.from('app_settings').upsert([{ key: 'outbox_url', value: url }, { key: 'outbox_key', value: key }]);
if (error) throw error;
if (!process.env.OUTBOX_KEY) fs.appendFileSync('../.env.local', `\nOUTBOX_KEY=${key}\n`);
console.log('outbox 설정 완료: secrets(OUTBOX_KEY, APP_URL, ALIMTALK_PROVIDER) · app_settings(outbox_url, outbox_key)' + (process.env.OUTBOX_KEY ? '' : ' · .env.local 에 OUTBOX_KEY 추가'));
