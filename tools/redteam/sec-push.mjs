// Attack: push_subscriptions — insert with someone else's user_id, read/update/delete others' endpoints.
import { admin, seedAcademy, login, held, hole, report, cleanup } from './_common.mjs';

const A = await seedAcademy('push');
// par2 already has a subscription (the victim)
const victimEndpoint = 'https://push.example/victim-' + Math.random().toString(16).slice(2);
await admin.from('push_subscriptions').insert({ user_id: A.par2.uid, endpoint: victimEndpoint, p256dh: 'k', auth: 'a' });

const par1 = await login(A.par1.phone, A.par1.mid);

// insert with victim's user_id
let r = await par1.from('push_subscriptions').insert({ user_id: A.par2.uid, endpoint: 'https://push.example/forged-' + Math.random(), p256dh: 'k', auth: 'a' }).select();
(r.error || (r.data?.length ?? 0) === 0) ? held('parent cannot insert push_subscription with another user_id') : hole('높음', 'parent forged push_subscription for another user');
// insert for self (control)
r = await par1.from('push_subscriptions').insert({ user_id: A.par1.uid, endpoint: 'https://push.example/own-' + Math.random(), p256dh: 'k', auth: 'a' }).select();
!r.error && (r.data?.length ?? 0) === 1 ? held('control: parent can insert own push_subscription') : hole('낮음', 'parent could not insert own subscription: ' + r.error?.message);
// read others' endpoints
let g = await par1.from('push_subscriptions').select('endpoint,user_id');
const leaked = (g.data ?? []).filter(x => x.user_id !== A.par1.uid);
leaked.length === 0 ? held('parent sees only own push_subscriptions (no endpoint leak)') : hole('높음', 'parent read others endpoints: ' + JSON.stringify(leaked));
// update victim's subscription (redirect to attacker endpoint)
r = await par1.from('push_subscriptions').update({ endpoint: 'https://attacker/steal' }).eq('endpoint', victimEndpoint).select();
{ const { data: v } = await admin.from('push_subscriptions').select('endpoint').eq('endpoint', victimEndpoint).maybeSingle();
  v ? held('parent cannot update victim subscription') : hole('높음', 'parent hijacked victim push endpoint'); }
// delete victim's subscription (DoS)
r = await par1.from('push_subscriptions').delete().eq('endpoint', victimEndpoint).select();
{ const { data: v } = await admin.from('push_subscriptions').select('id').eq('endpoint', victimEndpoint).maybeSingle();
  v ? held('parent cannot delete victim subscription') : hole('중간', 'parent deleted victim subscription (DoS)'); }

report();
await cleanup();
console.log('cleaned');
