import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { asset } from '../../lib/asset';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { logoUrl } from '../../lib/logo';
import { toast, errToast } from '../../lib/toast';
import { confirmSheet } from '../../components/Confirm';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { Empty } from '../../components/Empty';
import { AutoTextarea } from '../../components/AutoTextarea';
import { IcCopy, IcDownload, IcHouse, IcList, IcWarn } from '../../components/icons';
import {
  appUrl, copyText, directorInviteText, findAcademy, introUrl,
  opAcademies, opDeleteAcademy, opDirectorInvite, opExport, opGetSms, opSetLock, opSetSms, type SmsProvider,
} from '../../lib/operator';
import '../ui.css';
import './operator.css';

/* BRIGHT 운영 · 학원 상세 — 초대 링크·링크 복사·발신 설정·잠금·내려받기·삭제.
   한 학원만 읽는 RPC 는 없다(op_academies 한 번이 싸다) → 목록에서 골라 쓴다. */

const day = (ts: string) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

/* 확인 문구를 손으로 받아야 하는 시트 — confirmSheet 에는 입력칸이 없다. Billing 의 Sheet 와 같은 몸통. */
function SlugSheet({ name, slug, busy, onClose, onOk }: { name: string; slug: string; busy: boolean; onClose: () => void; onOk: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [typed, setTyped] = useState('');
  useLayoutEffect(() => { setHost(document.querySelector<HTMLElement>('.app')); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  if (!host) return null;
  return createPortal(
    <div className="sheet-dim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`${name} 지우기`} onClick={e => e.stopPropagation()}>
        <p className="st">{name}을(를) 지울까요?</p>
        <p className="sb">반·학생·명부·출결·청구서·공지와 올린 사진까지 모두 사라져요. 되돌릴 수 없어요.
          먼저 <b>데이터 내려받기</b>를 한 번 해 두세요.</p>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="op-del">확인을 위해 주소(slug) <b>{slug}</b> 를 그대로 입력해 주세요</label>
          <input id="op-del" className="input" autoComplete="off" autoCapitalize="none" spellCheck={false}
            value={typed} onChange={e => setTyped(e.target.value)} placeholder={slug} />
        </div>
        <div className="sa">
          <button className="btn line" onClick={onClose}>취소</button>
          <button className="btn danger" disabled={busy || typed.trim() !== slug} onClick={onOk}>{busy ? '지우는 중…' : '지우기'}</button>
        </div>
      </div>
    </div>, host);
}

export function OpAcademy() {
  const nav = useNav();
  const id = nav.params.id ?? '';
  const { data: list, err, reload } = useLoad(opAcademies);
  const a = findAcademy(list, id);
  const { data: sms, reload: reloadSms } = useLoad(() => id ? opGetSms(id) : Promise.resolve(null), [id]);

  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);   // 클립보드가 막히면 직접 복사할 칸을 펼친다
  const [provider, setProvider] = useState<SmsProvider | null>(null);
  const [keyEdit, setKeyEdit] = useState(false);
  const [keyVal, setKeyVal] = useState('');
  const [del, setDel] = useState(false);
  const prov: SmsProvider = provider ?? sms?.sms_provider ?? 'console';

  if (!list) return <section className="view on">{err ? <ErrorState onRetry={reload} /> : <Skeleton rows={4} />}</section>;
  if (!a) return (
    <section className="view on">
      <Empty icon="list" title="학원을 찾지 못했어요" hint="지워졌거나 주소가 낡았어요." action={{ label: '학원 목록', onClick: () => nav.back() }} />
    </section>
  );

  const url = (fn: (o: string, b: string, s: string) => string) => fn(location.origin, import.meta.env.BASE_URL, a.slug);

  async function run(job: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await job(); toast(done); }
    catch (e) { errToast(e); }
    finally { setBusy(false); }
  }
  async function copyInviteLink() {
    setBusy(true);
    try {
      const link = await opDirectorInvite(a!.id);
      const text = directorInviteText(a!.name, link);
      if (await copyText(text)) { setInvite(null); toast('초대 문구를 복사했어요. 원장님께 카톡으로 보내세요'); }
      else setInvite(text);
    } catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function copyAppLink() {
    const link = url(appUrl);
    if (await copyText(link)) toast('앱 주소를 복사했어요');
    else setInvite(link);
  }
  async function toggleLock() {
    const next = !a!.locked;
    const ok = next
      ? await confirmSheet({ title: `${a!.name}의 이용을 정지할까요?`, body: '잠기면 이 학원 사람들이 앱에 들어올 수 없어요. 데이터는 그대로 남고, 풀면 되돌아와요.', okLabel: '이용 정지', danger: true })
      : await confirmSheet({ title: '이용 정지를 풀까요?', body: '원장님과 학부모님이 다시 들어올 수 있어요.', okLabel: '정지 풀기' });
    if (!ok) return;
    await run(() => opSetLock(a!.id, next), next ? '이용을 정지했어요' : '정지를 풀었어요');
    await reload();
  }
  async function saveSms() {
    await run(() => opSetSms(a!.id, prov, keyEdit ? keyVal.trim() : null), '발신 설정을 저장했어요');
    setKeyEdit(false); setKeyVal(''); setProvider(null);
    await Promise.all([reloadSms(), reload()]);
  }
  async function download() {
    setBusy(true);
    try {
      const blob = await opExport(a!.id);
      const el = document.createElement('a');
      el.href = URL.createObjectURL(blob); el.download = `${a!.slug}-${new Date().toISOString().slice(0, 10)}.json`; el.click();
      setTimeout(() => URL.revokeObjectURL(el.href), 5000);
      toast('내려받았어요');
    } catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function doDelete() {
    setBusy(true);
    try { const name = await opDeleteAcademy(a!.id, a!.slug); setDel(false); toast(`${name || a!.name}을(를) 지웠어요`); nav.back(); }
    catch (e) { errToast(e); setBusy(false); }
  }

  const logo = logoUrl(a.logo_path) ?? asset('logo/bright-icon-192.png');
  const dirty = keyEdit || (provider !== null && provider !== (sms?.sms_provider ?? 'console'));
  return (
    <section className="view on">
      <div className="ophead">
        <img src={logo} alt="" />
        <span className="bd">
          <span className="t">{a.name}{a.locked && <span className="tag danger">이용 정지</span>}</span>
          <span className="s">{a.slug} · {day(a.created_at)}에 만듦</span>
        </span>
      </div>

      <div className="lab first" style={{ marginTop: 0 }}>원장님께 보내기</div>
      <div className="box">
        <button className="rw" disabled={busy} onClick={copyInviteLink}>
          <span className="ic"><IcCopy size={20} /></span>
          <span className="bd"><span className="t">원장 초대 링크 복사</span><span className="s">누를 때마다 새로 만들어요 · 7일 안에 · 옛 링크는 죽어요</span></span><span className="go">›</span></button>
        {invite && <div className="opfield"><AutoTextarea readOnly value={invite} /><p className="hint">길게 눌러 복사해 주세요</p></div>}
        <button className="rw" onClick={() => window.open(url(introUrl), '_blank', 'noopener')}>
          <span className="ic"><IcHouse size={20} /></span>
          <span className="bd"><span className="t">소개 페이지 열기</span><span className="s">{url(introUrl)}</span></span><span className="go">›</span></button>
        <button className="rw" onClick={copyAppLink}>
          <span className="ic"><IcList size={20} /></span>
          <span className="bd"><span className="t">앱 링크 복사</span><span className="s">이 학원으로 열리는 주소예요</span></span><span className="go">›</span></button>
      </div>

      <div className="lab">문자 발신</div>
      <div className="box">
        <div className="rw" style={{ cursor: 'default', display: 'block' }}>
          <span className="bd" style={{ display: 'block' }}>
            <span className="t">발신 모드</span>
            <span className="s">console = 밖으로 안 나가요(로그만) · http = 대행사로 나가요</span></span>
          <div className="seg" style={{ marginTop: 10 }}>
            {(['console', 'http'] as SmsProvider[]).map(p => (
              <button key={p} className={p === prov ? 'on' : ''} onClick={() => setProvider(p)}>{p}</button>))}
          </div>
        </div>
        <div className="rw" style={{ cursor: 'default' }}>
          <span className="bd"><span className="t">발신키</span>
            <span className="s">{sms?.sender_key_masked ? `${sms.sender_key_masked} · 이 학원 전용 키` : '없음 · 전역 키로 나가요'}</span></span>
          {!keyEdit && <button className="btn sm line" onClick={() => { setKeyEdit(true); setKeyVal(''); }}>바꾸기</button>}
        </div>
        {keyEdit && <div className="opfield">
          <div className="row">
            <input className="input" autoComplete="off" spellCheck={false} placeholder="대행사에서 받은 발신키"
              value={keyVal} onChange={e => setKeyVal(e.target.value)} />
            <button className="btn sm line" onClick={() => { setKeyEdit(false); setKeyVal(''); }}>취소</button>
          </div>
          <p className="hint">비우고 저장하면 키를 지워요 — 전역 키로 되돌아가요. 원문은 저장한 뒤 다시 볼 수 없어요(****1234 만 보여요).</p>
        </div>}
        {dirty && <div className="opfield"><button className="btn" disabled={busy} onClick={saveSms}>발신 설정 저장</button></div>}
      </div>

      <div className="lab">운영</div>
      <div className="box">
        <button className="rw" disabled={busy} onClick={toggleLock}>
          <span className="ic"><IcWarn size={20} /></span>
          <span className="bd"><span className="t">{a.locked ? '이용 정지 풀기' : '이용 정지'}</span>
            <span className="s">{a.locked ? '지금은 아무도 들어올 수 없어요' : '잠기면 이 학원 사람들이 앱에 들어올 수 없어요'}</span></span>
          <span className={'tag ' + (a.locked ? 'danger' : 'muted')}>{a.locked ? '정지' : '정상'}</span></button>
        <button className="rw" disabled={busy} onClick={download}>
          <span className="ic"><IcDownload size={20} /></span>
          <span className="bd"><span className="t">데이터 내려받기</span><span className="s">이 학원의 모든 표를 JSON 한 파일로</span></span><span className="go">›</span></button>
        <button className="rw" disabled={busy} onClick={() => setDel(true)}>
          <span className="ic"><IcWarn size={20} /></span>
          <span className="bd"><span className="t" style={{ color: 'var(--danger)' }}>학원 지우기</span><span className="s">되돌릴 수 없어요 · 주소(slug)를 다시 입력해요</span></span><span className="go">›</span></button>
      </div>
      <p className="muted" style={{ padding: '16px 20px 0', lineHeight: 1.7 }}>
        학생 {a.students} · 학부모 {a.parents_entered}/{a.parents_total} 들어옴 · 알림 못 받는 {a.no_push}<br />
        이번 달 청구 {a.invoices_month} · 납부 {a.paid_month}
      </p>

      {del && <SlugSheet name={a.name} slug={a.slug} busy={busy} onClose={() => { if (!busy) setDel(false); }} onOk={doDelete} />}
    </section>
  );
}
