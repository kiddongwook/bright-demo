import { kstToday } from '../../lib/api';
import { fmtDue, fmtWon, monthOf, myInvoice, type InvStatus } from '../../lib/billing';
import { useLoad } from '../../lib/useLoad';
import { toast } from '../../lib/toast';
import '../ui.css';
import '../billing.css';

/* 학부모 홈의 수강료 한 줄. 이번 달 청구서가 없으면 아무것도 그리지 않는다 —
   수강료를 안 쓰는 학원에서는 이 자리가 아예 없어야 한다. */

const TAG: Record<InvStatus, [string, string]> = {
  paid: ['납부 완료', 'ok'], partial: ['일부 납부', 'warn'], issued: ['납부 전', 'danger'], overdue: ['납기 지남', 'danger'], void: ['면제', 'muted'],
};

export function TuitionCard() {
  const ym = kstToday().slice(0, 7);
  const { data } = useLoad(() => myInvoice(ym).catch(() => null), [ym]);
  if (!data) return null;
  const rest = data.total - data.paid;
  const unpaid = data.status !== 'paid' && data.status !== 'void' && rest > 0;
  const [label, cls] = TAG[data.status];
  const bank = (data.bank_info ?? '').trim();

  async function copy() {
    try { await navigator.clipboard.writeText(bank); toast('계좌 안내를 복사했어요'); }
    catch { toast('복사가 막혔어요. 길게 눌러 복사해 주세요'); }
  }
  return (<>
    <div className="lab">이번 달 수강료<span className="r">납기 {fmtDue(data.due_date)}</span></div>
    <div className="box">
      <div className="rw" style={{ cursor: 'default' }}>
        <span className="bd">
          <span className="t">{monthOf(data.period_ym)}월 수강료 {fmtWon(data.total)}</span>
          <span className="s">납기 {fmtDue(data.due_date)}{unpaid ? ` · 남은 금액 ${fmtWon(rest)}` : ''}</span>
        </span>
        <span className={'tag ' + cls}>{label}</span>
      </div>
      {unpaid && bank && <div className="bank">
        <p className="bt">{bank}</p>
        <div className="btnrow"><button className="btn line" onClick={copy}>계좌 복사</button></div>
      </div>}
    </div>
  </>);
}
