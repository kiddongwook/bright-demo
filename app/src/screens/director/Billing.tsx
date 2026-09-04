import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { kstToday, listClasses, monthGrid } from '../../lib/api';
import {
  DEFAULT_RULES, fmtDue, fmtWon, getBillingRules, issueInvoices, listFeePlans, listInvoices, monthOf,
  recordPayment, refreshOverdue, remindUnpaid, saveBillingRules, saveFeePlan, saveInvoiceMemo, deleteFeePlan,
  setInvoiceAmount, voidInvoice, type BillingRules, type Invoice, type InvStatus, type PayMethod,
} from '../../lib/billing';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { BottomCta } from '../../components/BottomCta';
import { confirmSheet } from '../../components/Confirm';
import { Counter } from '../../components/Counter';
import { LIMITS } from '../../lib/limits';
import '../ui.css';
import '../billing.css';

/* 수강료 — 결제 연동 없는 수기 모드.
   돈은 학원 계좌로 바로 간다(자금 비보관). 앱이 하는 일은 청구서를 만들고, 원장이 통장을 보고 "받았다"를 누르고,
   아직 안 낸 집에 한 번 더 알리는 것뿐이다. */

const TAG: Record<InvStatus, [string, string]> = {
  paid: ['납부', 'ok'], partial: ['부분', 'warn'], issued: ['미납', 'danger'], overdue: ['연체', 'danger'], void: ['면제', 'muted'],
};
const METHODS: [PayMethod, string][] = [['transfer', '계좌이체'], ['cash', '현금'], ['card', '카드']];
const won = (s: string) => Math.max(0, Math.round(Number(s.replace(/[^0-9]/g, '')) || 0));

/* 앱 안 시트 — Confirm 과 같은 모양(.sheet)이되 내용이 길어 스크롤한다.
   .view 는 들어올 때 transform 으로 움직여 position:fixed·absolute 가 어긋난다 → BottomCta 처럼 .app 안에 붙인다. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setHost(document.querySelector<HTMLElement>('.app')); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  if (!host) return null;
  return createPortal(
    <div className="sheet-dim bdim" onClick={onClose}>
      <div className="sheet bsheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <p className="st">{title}</p>
        {children}
      </div>
    </div>, host);
}

/* 청구서 한 장 — 남은 금액 · 전액 납부 확인 · 부분 금액 · 면제 · 금액 수정 · 메모 */
function InvoiceSheet({ inv, onClose, onDone }: { inv: Invoice; onClose: () => void; onDone: () => Promise<unknown> }) {
  const rest = inv.total - inv.paid;
  const [busy, setBusy] = useState(false);
  const [part, setPart] = useState('');
  const [memo, setMemo] = useState(inv.memo ?? '');
  const [edit, setEdit] = useState(false);
  const [amt, setAmt] = useState(String(inv.amount));
  const [dis, setDis] = useState(String(inv.discount));
  const [txt, setTxt] = useState(String(inv.textbook));
  const voided = inv.status === 'void';

  async function run(fn: () => Promise<unknown>, msg: string, close = true) {
    setBusy(true);
    try { await fn(); await onDone(); toast(msg); if (close) onClose(); else setBusy(false); }
    catch (e) { errToast(e); setBusy(false); }
  }
  async function pay(method: PayMethod, amount: number) {
    if (amount <= 0) { toast('금액을 넣어 주세요'); return; }
    await run(() => recordPayment(inv.id, amount, method), `${fmtWon(amount)} 납부로 기록했어요`);
  }
  async function doVoid() {
    if (!(await confirmSheet({ title: `${inv.student_name} 학생의 이번 달 수강료를 면제할까요?`, body: '청구서는 남고 미납에서 빠져요. 메모에 사유를 적어 두면 나중에 알아보기 쉬워요.', okLabel: '면제', danger: true }))) return;
    await run(() => voidInvoice(inv.id, memo), '면제로 두었어요');
  }

  return (
    <Sheet title={`${inv.student_name} · ${monthOf(inv.period_ym)}월 수강료`} onClose={onClose}>
      <p className="sb">청구 {fmtWon(inv.total)} · 납부 {fmtWon(inv.paid)} · 납기 {fmtDue(inv.due_date)}
        {inv.discount > 0 && <> · 형제 할인 {fmtWon(inv.discount)}</>}</p>
      <div className={'bmoney' + (rest <= 0 ? ' done' : '')}>
        <b>{voided ? '면제' : rest <= 0 ? '납부 완료' : fmtWon(rest)}</b>
        <span>{voided ? '이번 달은 받지 않아요' : rest <= 0 ? '' : '남은 금액'}</span>
      </div>

      {!voided && rest > 0 && !edit && <>
        <div className="blab">전액 납부 확인</div>
        <div className="methods">{METHODS.map(([m, label]) =>
          <button key={m} className="btn line" disabled={busy} onClick={() => pay(m, rest)}>{label}</button>)}</div>
        <div className="blab">일부만 받았어요</div>
        <div className="brow">
          <input className="input" inputMode="numeric" placeholder="금액" value={part}
            onChange={e => setPart(e.target.value.replace(/[^0-9]/g, ''))} />
          <button className="btn sm line" disabled={busy || !part} onClick={() => pay('transfer', won(part))}>계좌이체로 기록</button>
        </div>
      </>}

      {edit
        ? <>
          <div className="blab">금액 수정<span className="r"> </span></div>
          <div className="bfield"><label htmlFor="bi-a">수강료</label><input id="bi-a" className="input" inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value.replace(/[^0-9]/g, ''))} /></div>
          <div className="bfield"><label htmlFor="bi-d">할인</label><input id="bi-d" className="input" inputMode="numeric" value={dis} onChange={e => setDis(e.target.value.replace(/[^0-9]/g, ''))} /></div>
          <div className="bfield"><label htmlFor="bi-t">교재비</label><input id="bi-t" className="input" inputMode="numeric" value={txt} onChange={e => setTxt(e.target.value.replace(/[^0-9]/g, ''))} /></div>
          <p className="muted">합계 {fmtWon(won(amt) - won(dis) + won(txt))}</p>
          <div className="btnrow">
            <button className="btn line" onClick={() => setEdit(false)}>취소</button>
            <button className="btn" disabled={busy} onClick={() => run(() => setInvoiceAmount(inv.id, won(amt), won(dis), won(txt)), '금액을 고쳤어요')}>금액 저장</button>
          </div>
        </>
        : <>
          <div className="blab">메모<span className="r"> </span></div>
          <textarea className="input" style={{ minHeight: 72 }} value={memo} onChange={e => setMemo(e.target.value)} placeholder="예) 다음 주 월요일에 나머지" />
          <div className="btnrow">
            <button className="btn line" disabled={busy} onClick={() => run(() => saveInvoiceMemo(inv.id, memo), '메모를 저장했어요', false)}>메모 저장</button>
            <button className="btn line" onClick={() => setEdit(true)}>금액 수정</button>
          </div>
          <div className="btnrow">
            {voided
              ? <button className="btn line" disabled={busy} onClick={() => run(() => setInvoiceAmount(inv.id, inv.amount, inv.discount, inv.textbook), '면제를 되돌렸어요')}>면제 되돌리기</button>
              : <button className="btn line" disabled={busy} onClick={doVoid}>면제</button>}
            <button className="btn line" onClick={onClose}>닫기</button>
          </div>
        </>}
    </Sheet>
  );
}

export function Billing() {
  const nav = useNav();
  const [ym, setYm] = useState(kstToday().slice(0, 7));
  const [open, setOpen] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, err, reload } = useLoad(async () => {
    await refreshOverdue().catch(() => {});   // 납기 지난 청구서를 '연체' 로 — 못 돌아도 목록은 보여 준다
    return listInvoices(ym);
  }, [ym]);
  const g = monthGrid(ym);
  const list = data ?? [];
  const live = list.filter(i => i.status !== 'void');          // 면제는 청구·미납 셈에서 뺀다
  const paidCount = live.filter(i => i.status === 'paid').length;
  const unpaid = live.filter(i => i.status !== 'paid');
  const total = live.reduce((a, i) => a + i.total, 0);
  const paidSum = live.reduce((a, i) => a + Math.min(i.paid, i.total), 0);
  const restSum = unpaid.reduce((a, i) => a + (i.total - i.paid), 0);
  // 시트가 열려 있는 동안 목록이 새로 오면 그 학생의 최신 줄을 시트에 물려 준다
  const cur = open ? list.find(i => i.id === open.id) ?? open : null;

  async function doIssue() {
    if (busy) return;   // 빈 화면의 CTA 는 disabled 를 받지 않는다 — 두 번 눌러도 한 번만 돈다
    setBusy(true);
    try {
      const n = await issueInvoices(ym);
      await reload();
      toast(n ? `청구서 ${n}장을 만들었어요` : '새로 만들 청구서가 없어요. 요금제가 없으면 수강료 설정에서 먼저 정해 주세요');
    } catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function doRemind() {
    if (!unpaid.length) { toast('미납이 없어요'); return; }
    if (!(await confirmSheet({
      title: `미납 ${unpaid.length}명의 학부모에게 알림을 보낼까요?`,
      body: '남은 금액과 계좌 안내가 함께 갑니다. 같은 청구서에는 하루에 한 번만 가요.', okLabel: '보내기',
    }))) return;
    setBusy(true);
    try {
      const n = await remindUnpaid(ym);
      await reload();
      toast(n ? `${n}명에게 보냈어요` : '보낼 곳이 없었어요. 오늘 이미 보냈거나, 아직 앱에 들어온 학부모가 없어요');
    } catch (e) { errToast(e); } finally { setBusy(false); }
  }

  return (
    <section className="view on">
      <div className="head"><p className="lede">청구서를 만들고, 통장에 들어온 것만 <b>눌러서 확인</b>해요. 결제는 앱을 거치지 않아요.</p></div>
      <div className="lab first">
        <button className="calnav" onClick={() => setYm(g.prev)} aria-label="이전 달">‹</button>{g.label}
        <button className="calnav" onClick={() => setYm(g.next)} aria-label="다음 달">›</button>
        <button className="r" onClick={() => nav.push('billing-settings')}>수강료 설정 ›</button>
      </div>
      {!data
        ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={4} />)
        : !list.length
          ? <div className="box"><Empty icon="list" title={`${monthOf(ym)}월 청구서가 아직 없어요`}
              hint="활성 학생마다 한 장씩 만들어요. 금액은 요금제에서 오고, 형제 할인은 자동으로 붙어요."
              action={{ label: busy ? '만드는 중…' : '이번 달 청구서 만들기', onClick: doIssue }} /></div>
          : <>
            <div className="summary">
              <div className="st"><span className="k">청구</span><span className="v">{live.length}명<em>{fmtWon(total)}</em></span></div>
              <div className="st"><span className="k">납부</span><span className="v">{paidCount}명<em>{fmtWon(paidSum)}</em></span></div>
              <div className={'st' + (restSum ? ' hot' : '')}><span className="k">미납</span><span className="v">{unpaid.length}명<em>{fmtWon(restSum)}</em></span></div>
            </div>
            <div className="lab">학생별<span className="r">누르면 납부를 적어요</span></div>
            <div className="box">{list.map(i => {
              const [label, cls] = TAG[i.status];
              return (
                <button key={i.id} className="rw" onClick={() => setOpen(i)}>
                  <span className="bd">
                    <span className="t">{i.student_name}</span>
                    <span className="s">{i.classes.join(' · ') || '반 없음'} · {fmtWon(i.total)}
                      {i.status === 'partial' && <> · 남은 {fmtWon(i.total - i.paid)}</>}</span>
                  </span>
                  <span className={'tag ' + cls}>{label}</span>
                </button>);
            })}</div>
            <div className="btnrow">
              <button className="btn line" disabled={busy} onClick={doIssue}>청구서 다시 만들기(새 학생만)</button>
            </div>
            <div className="btnrow">
              <button className="btn line" disabled={busy || !unpaid.length} onClick={doRemind}>미납 안내 보내기</button>
            </div>
            <p className="muted" style={{ padding: '12px 20px 0' }}>납기 {fmtDue(list[0].due_date)} · 안내는 앱 알림(푸시)으로 가요. 같은 청구서에는 하루 한 번만 갑니다.</p>
          </>}
      {cur && <InvoiceSheet key={cur.id} inv={cur} onClose={() => setOpen(null)} onDone={reload} />}
    </section>
  );
}

/* 요금제·청구일·납기일·형제 할인·계좌 안내. 여기서 정한 것으로 청구서가 만들어진다. */
export function BillingSettings() {
  const { data: classes } = useLoad(listClasses);
  const { data: plans, err: plansErr, reload: reloadPlans } = useLoad(listFeePlans);
  const { data: rules, err, reload } = useLoad(getBillingRules);
  const [form, setForm] = useState<BillingRules>(DEFAULT_RULES);
  const [editing, setEditing] = useState<{ id?: string; class_id: string | null; name: string; amount: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { if (rules) setForm(rules); }, [rules]);
  const dirty = !!rules && JSON.stringify(form) !== JSON.stringify(rules);
  const set = <K extends keyof BillingRules>(k: K, v: BillingRules[K]) => setForm(f => ({ ...f, [k]: v }));
  const className = (id: string | null) => id ? (classes?.find(c => c.id === id)?.name ?? '없어진 반') : '학원 공통';

  async function save() {
    setBusy(true);
    try { await saveBillingRules(form); await reload(); setDone(true); setTimeout(() => setDone(false), 1600); toast('저장했어요. 다음에 만드는 청구서부터 적용돼요'); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function savePlan() {
    if (!editing) return;
    if (!editing.name.trim()) { toast('요금제 이름을 적어 주세요'); return; }
    setBusy(true);
    try { await saveFeePlan({ id: editing.id, class_id: editing.class_id, name: editing.name, amount: won(editing.amount) }); await reloadPlans(); setEditing(null); toast('요금제를 저장했어요'); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function removePlan(id: string, name: string) {
    if (!(await confirmSheet({ title: `요금제 「${name}」를 지울까요?`, body: '이미 만들어진 청구서 금액은 그대로예요.', okLabel: '지우기', danger: true }))) return;
    try { await deleteFeePlan(id); await reloadPlans(); toast('지웠어요'); } catch (e) { errToast(e); }
  }

  return (
    <section className="view on">
      <div className="head"><p className="lede">여기서 정한 규칙으로 청구서가 만들어져요. <b>계좌 안내는 학부모에게 그대로 보여요.</b></p></div>
      <div className="lab first">요금제<span className="r">반별 · 학원 공통</span></div>
      {!plans
        ? (plansErr ? <ErrorState onRetry={reloadPlans} /> : <Skeleton rows={2} />)
        : <div className="box">
          {plans.length
            ? plans.map(p => (
              <div key={p.id} className="rw" style={{ cursor: 'default' }}>
                <span className="bd"><span className="t">{p.name}</span><span className="s">{className(p.class_id)}</span></span>
                <span className="feeamt">{fmtWon(p.amount)}</span>
                <button className="btn sm line" onClick={() => setEditing({ id: p.id, class_id: p.class_id, name: p.name, amount: String(p.amount) })}>편집</button>
                <button className="btn sm line" onClick={() => removePlan(p.id, p.name)}>지우기</button>
              </div>))
            : <Empty icon="list" title="요금제가 아직 없어요" hint="반마다 다르면 반별로, 같으면 학원 공통 하나면 돼요." />}
        </div>}
      <div className="btnrow"><button className="btn line" onClick={() => setEditing({ class_id: null, name: '', amount: '' })}>요금제 추가</button></div>

      <div className="lab">청구 규칙</div>
      <div className="box">
        <div className="rw" style={{ cursor: 'default' }}>
          <span className="bd"><span className="t">청구일</span><span className="s">매월 이 날 청구서를 만들어요</span></span>
          <select className="input" style={{ width: 96 }} value={form.billing_day} onChange={e => set('billing_day', +e.target.value)}>
            {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}일</option>)}
          </select>
        </div>
        <div className="rw" style={{ cursor: 'default' }}>
          <span className="bd"><span className="t">납기일</span><span className="s">이 날이 지나면 연체로 보여요</span></span>
          <select className="input" style={{ width: 96 }} value={form.due_day} onChange={e => set('due_day', +e.target.value)}>
            {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}일</option>)}
          </select>
        </div>
        <div className="rw" style={{ cursor: 'default' }}>
          <span className="bd"><span className="t">형제 할인</span><span className="s">번호를 함께 쓰는 둘째부터 빼요</span></span>
          <input className="input" style={{ width: 96, textAlign: 'right' }} inputMode="numeric" value={String(form.sibling_discount_pct)}
            onChange={e => set('sibling_discount_pct', Math.min(100, won(e.target.value)))} aria-label="형제 할인 퍼센트" />
          <span className="muted">%</span>
        </div>
      </div>

      <div className="lab">계좌 안내<span className="r">학부모 화면에 보여요</span></div>
      <div style={{ padding: '0 20px' }}>
        <textarea className="input" style={{ minHeight: 84 }} value={form.bank_info} maxLength={LIMITS.bankInfo}
          onChange={e => set('bank_info', e.target.value)} placeholder="예) 국민 123456-01-234567 영어의집" />
        <Counter n={(form.bank_info ?? '').length} max={LIMITS.bankInfo} />
        <p className="muted" style={{ paddingTop: 6 }}>미납 안내 알림에도 이 문구가 함께 갑니다.</p>
      </div>
      {err && <div style={{ paddingTop: 12 }}><ErrorState onRetry={reload} /></div>}

      {dirty && <BottomCta primary={{ label: '저장', onClick: save, busy, done, doneLabel: '저장했어요' }} />}

      {editing && <Sheet title={editing.id ? '요금제 편집' : '요금제 추가'} onClose={() => setEditing(null)}>
        <div className="blab">이름</div>
        <input className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="예) 고1 정규" />
        <div className="blab">적용할 반</div>
        <select className="input" value={editing.class_id ?? ''} onChange={e => setEditing({ ...editing, class_id: e.target.value || null })}>
          <option value="">학원 공통 (반별 요금제가 없을 때)</option>
          {(classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="blab">금액</div>
        <div className="brow">
          <input className="input" inputMode="numeric" value={editing.amount} onChange={e => setEditing({ ...editing, amount: e.target.value.replace(/[^0-9]/g, '') })} placeholder="150000" />
          <span className="muted">{fmtWon(won(editing.amount))}</span>
        </div>
        <div className="btnrow">
          <button className="btn line" onClick={() => setEditing(null)}>취소</button>
          <button className="btn" disabled={busy} onClick={savePlan}>저장</button>
        </div>
      </Sheet>}
    </section>
  );
}
