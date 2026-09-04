// Attack: within one academy, does a teacher assigned to class C1 leak class C2, and does a parent of S1
// leak S2? Covers students/attendance/absence/notes/inquiries/todos read+write scope.
import { admin, seedAcademy, login, held, hole, note, report, cleanup } from './_common.mjs';

const A = await seedAcademy('scp');   // teacher assigned to c1; s1 in c1, s2 in c2
// data on both students
await admin.from('attendance').insert([
  { academy_id: A.ac.id, student_id: A.s1.id, class_id: A.c1.id, date: '2026-09-01', status: 'late', marked_by: A.dir.uid },
  { academy_id: A.ac.id, student_id: A.s2.id, class_id: A.c2.id, date: '2026-09-01', status: 'absent', marked_by: A.dir.uid },
]);
await admin.from('notes').insert([
  { academy_id: A.ac.id, student_id: A.s1.id, author_id: A.dir.uid, kind: 'memo', body: 'S1 secret' },
  { academy_id: A.ac.id, student_id: A.s2.id, author_id: A.dir.uid, kind: 'memo', body: 'S2 secret' },
]);
const { data: inq2 } = await admin.from('inquiries').insert({ academy_id: A.ac.id, student_id: A.s2.id, asked_by: A.par2.uid, topic: 't', body: 'S2 inquiry' }).select().single();
const { data: todo2 } = await admin.from('todos').insert({ academy_id: A.ac.id, class_id: A.c2.id, kind: 'homework', title: 'c2 hw', due_date: '2026-09-10' }).select().single();

const tch = await login(A.tch.phone, A.tch.mid);
const par1 = await login(A.par1.phone, A.par1.mid);

// ---- teacher scope: sees own class (c1/s1), not c2/s2 ----
let g = await tch.from('students').select('id').eq('id', A.s2.id);
((g.data?.length ?? 0) === 0) ? held('teacher cannot read out-of-class student S2') : hole('높음', 'teacher read S2 (other class)');
g = await tch.from('students').select('id').eq('id', A.s1.id);
((g.data?.length ?? 0) === 1) ? held('control: teacher reads own-class S1') : note('teacher could not read S1: ' + JSON.stringify(g.data));
g = await tch.from('attendance').select('id').eq('student_id', A.s2.id);
((g.data?.length ?? 0) === 0) ? held('teacher cannot read S2 attendance') : hole('높음', 'teacher read S2 attendance');
g = await tch.from('notes').select('body').eq('student_id', A.s2.id);
((g.data?.length ?? 0) === 0) ? held('teacher cannot read S2 notes') : hole('높음', 'teacher read S2 notes: ' + JSON.stringify(g.data));
g = await tch.from('todos').select('id').eq('id', todo2.id);
((g.data?.length ?? 0) === 0) ? held('teacher cannot read c2 todos') : hole('중간', 'teacher read c2 todo');
g = await tch.rpc('student_timeline', { sid: A.s2.id, lim: 10 });
(g.error || (g.data?.length ?? 0) === 0) ? held('teacher student_timeline(S2) blocked') : hole('높음', 'teacher read S2 timeline');
// teacher writing attendance into c2 (not their class)
let r = await tch.from('attendance').insert({ academy_id: A.ac.id, student_id: A.s2.id, class_id: A.c2.id, date: '2026-09-02', status: 'present', marked_by: A.tch.uid }).select();
(r.error || (r.data?.length ?? 0) === 0) ? held('teacher cannot write attendance into c2') : hole('높음', 'teacher wrote c2 attendance');
// teacher writing note on S2
r = await tch.from('notes').insert({ academy_id: A.ac.id, student_id: A.s2.id, author_id: A.tch.uid, kind: 'memo', body: 'x' }).select();
(r.error || (r.data?.length ?? 0) === 0) ? held('teacher cannot write note on S2') : hole('높음', 'teacher wrote S2 note');
// teacher inserting a class (academy admin is director-only)
r = await tch.from('classes').insert({ academy_id: A.ac.id, name: 'pwn' }).select();
(r.error || (r.data?.length ?? 0) === 0) ? held('teacher cannot create classes (director-only)') : hole('중간', 'teacher created a class');

// ---- parent of S1 must not see S2 ----
g = await par1.from('students').select('id').eq('id', A.s2.id);
((g.data?.length ?? 0) === 0) ? held('parent cannot read S2') : hole('높음', 'parent read S2');
g = await par1.from('attendance').select('id').eq('student_id', A.s2.id);
((g.data?.length ?? 0) === 0) ? held('parent cannot read S2 attendance') : hole('높음', 'parent read S2 attendance');
g = await par1.from('inquiries').select('body').eq('id', inq2.id);
((g.data?.length ?? 0) === 0) ? held('parent cannot read another family inquiry') : hole('높음', 'parent read S2 inquiry');
g = await par1.from('notes').select('body');
((g.data?.length ?? 0) === 0) ? held('parent cannot read any notes (staff-only)') : hole('높음', 'parent read notes: ' + JSON.stringify(g.data));
g = await par1.rpc('month_attendance', { sid: A.s2.id, ym: '2026-09' });
(g.error || (g.data?.length ?? 0) === 0) ? held('parent month_attendance(S2) empty') : hole('높음', 'parent read S2 attendance via RPC');
g = await par1.rpc('week_attendance', { sid: A.s2.id, d_from: '2026-09-01', d_to: '2026-09-30' });
(g.error || (g.data?.length ?? 0) === 0) ? held('parent week_attendance(S2) empty') : hole('높음', 'parent read S2 week attendance');
// parent inserting absence_request for S2 (not their child)
r = await par1.from('absence_requests').insert({ academy_id: A.ac.id, student_id: A.s2.id, requested_by: A.par1.uid, date: '2026-09-03', reason: 'x' }).select();
(r.error || (r.data?.length ?? 0) === 0) ? held('parent cannot file absence for S2') : hole('높음', 'parent filed absence for S2');
// parent inserting todo_done for S2
r = await par1.from('todo_done').insert({ todo_id: todo2.id, student_id: A.s2.id }).select();
(r.error || (r.data?.length ?? 0) === 0) ? held('parent cannot mark todo_done for S2') : hole('중간', 'parent marked todo_done for S2');

report();
await cleanup();
console.log('cleaned');
