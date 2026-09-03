import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const [csvPath, slug, academyName] = process.argv.slice(2);
if (!csvPath || !slug || !academyName) { console.log('usage: seed-roster.mjs <csv> <slug> "<name>"'); process.exit(2); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const norm = p => (p ?? '').replace(/[^0-9]/g, '');
const DOW = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
const rows = readFileSync(csvPath, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map(l => l.split(',').map(s => s.trim()));

const { data: ac } = await sb.from('academies').upsert({ slug, name: academyName }, { onConflict: 'slug' }).select().single();
const classes = new Map();
let nStudents = 0, nPhones = 0;
for (const [cls, dows, start, end, student, sPhone, guardian, gPhone, relation] of rows) {
  if (!classes.has(cls)) {
    const schedule = [...dows].map(d => ({ dow: DOW[d], start, end }));
    let { data: c } = await sb.from('classes').select('id').eq('academy_id', ac.id).eq('name', cls).maybeSingle();
    if (!c) ({ data: c } = await sb.from('classes').insert({ academy_id: ac.id, name: cls, schedule }).select('id').single());
    classes.set(cls, c.id);
  }
  let { data: st } = await sb.from('students').select('id').eq('academy_id', ac.id).eq('name', student).maybeSingle();
  if (!st) { ({ data: st } = await sb.from('students').insert({ academy_id: ac.id, name: student }).select('id').single()); nStudents++; }
  await sb.from('enrollments').upsert({ student_id: st.id, class_id: classes.get(cls) }, { ignoreDuplicates: true });
  const phones = [];
  if (norm(gPhone)) phones.push({ academy_id: ac.id, phone: norm(gPhone), role: 'parent', name: guardian, student_id: st.id });
  if (norm(sPhone)) phones.push({ academy_id: ac.id, phone: norm(sPhone), role: 'student', name: student, student_id: st.id });
  if (phones.length) { const { error } = await sb.from('roster_phones').upsert(phones, { onConflict: 'academy_id,phone,role,student_id', ignoreDuplicates: true }); if (error) throw error; nPhones += phones.length; }
}
console.log(`PASS: academy=${ac.id} classes=${classes.size} students+${nStudents} roster_phones~${nPhones}`);
