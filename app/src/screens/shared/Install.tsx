import { useEffect, useState } from 'react';
import { currentEnv, externalOpenUrl } from '../../lib/env';
import { useSession } from '../../auth/session';
import { useLoad } from '../../lib/useLoad';
import { academy } from '../../lib/api';
import { logoUrl } from '../../lib/logo';
import { asset } from '../../lib/asset';
import { applyInstallIdentity } from '../../lib/manifest';
import { IcShareIos, IcMoreVertical } from '../../components/icons';
/* 홈 화면에 추가 — 환경마다 길이 다르다. 카톡 안에서는 안 되니 브라우저로 내보낸다. */
export function Install() {
  const { active } = useSession(); const env = currentEnv();
  const { data: acad } = useLoad(academy);
  const name = acad?.name ?? active?.academy_name ?? '우리 학원';
  const logo = acad?.logo_path ? logoUrl(acad.logo_path) : null;
  const [done, setDone] = useState(false);
  const ext = externalOpenUrl(location.href, env);
  // 로고를 방금 올리고 바로 이 화면에 온 경우 — 링크에 걸린 매니페스트는 아직 옛 아이콘이다. 여기서 다시 굳힌다
  // (이 화면이 "이 아이콘으로 놓여요" 라고 약속하는 자리라, 약속과 실제 설치가 갈리면 안 된다).
  useEffect(() => { if (acad) applyInstallIdentity({ name: acad.name, brandColor: acad.brand_color, logoUrl: logo, slug: acad.slug }, true); }, [acad?.name, acad?.brand_color, acad?.logo_path, acad?.slug]);
  return (
    <section className="view on">
      <div className="head"><p className="lede">앱처럼 아이콘으로 열어요. 설치는 <b>한 번</b>이면 돼요.</p></div>
      {/* 홈 화면에 실제로 놓일 모습 — 이름·아이콘은 학원마다 다르다(설치할 때의 로고로 굳는다) */}
      <div className="homescr">
        <div className="appicon"><img src={logo ?? asset('logo/yeongeo-jip-bold-white.png')} alt="" style={logo ? { width: 70, height: 70, borderRadius: 19, objectFit: 'cover' } : undefined} /></div>
        <div className="hl">{name}</div>
        <p className="hc">이 이름과 아이콘으로 홈 화면에 놓여요.
          {!logo && active?.role === 'director' && <><br />더보기 → <b>우리 학원</b> → 로고를 올리면 아이콘이 바뀌어요.</>}</p>
      </div>
      {env === 'installed' && <p className="muted" style={{ padding: '16px 20px 0' }}>이미 홈 화면에서 열었어요. 더 할 일이 없어요.</p>}
      {env === 'kakao' && <><p className="para">카톡 안에서는 홈 화면에 추가할 수 없어요. 기본 브라우저로 열어서 추가해 주세요.</p>
        <div className="btnrow"><a className="btn" href={ext!}>브라우저로 열기</a></div>
        <p className="muted" style={{ padding: '10px 20px 0' }}>안 열리면 오른쪽 위 ⋮ → "다른 브라우저로 열기".</p></>}
      {env === 'ios' && <ol className="steps"><li>아래 <b>공유</b> 단추 <IcShareIos size={18} style={{ verticalAlign: -3, margin: '0 2px' }} />(네모에 화살표)를 누르세요.</li><li><b>홈 화면에 추가</b>를 고르세요.</li><li>오른쪽 위 <b>추가</b>.</li></ol>}
      {env === 'android' && (window.__installPrompt
        ? <div className="btnrow"><button className="btn" disabled={done} onClick={async () => { await window.__installPrompt!.prompt(); const c = await window.__installPrompt!.userChoice; if (c.outcome === 'accepted') setDone(true); }}>{done ? '추가됐어요' : '홈 화면에 추가'}</button></div>
        : <ol className="steps"><li>오른쪽 위 <IcMoreVertical size={18} style={{ verticalAlign: -4, margin: '0 2px' }} /> 메뉴를 누르세요.</li><li><b>홈 화면에 추가</b>(또는 앱 설치)를 고르세요.</li></ol>)}

      {env === 'desktop' && <p className="para">폰에서 이 주소를 열면 홈 화면에 추가할 수 있어요. 카톡으로 받은 링크를 폰에서 눌러 주세요.</p>}
      <p className="muted" style={{ padding: '20px 20px 0' }}>추가하면 {name} 아이콘으로 바로 열려요. 알림은 카톡으로 계속 와요.</p>
    </section>
  );
}
