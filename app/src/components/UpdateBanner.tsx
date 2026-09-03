import { useRegisterSW } from 'virtual:pwa-register/react';
/** 서비스워커가 새 번들을 받아 두면 알린다. autoUpdate 는 첫 새로고침에 옛 번들을 줘서 prompt 로 바꿨다. */
export function UpdateBanner() {
  const { needRefresh: [need], updateServiceWorker } = useRegisterSW();
  if (!need) return null;
  // 첫 방문 뒤 첫 갱신은 페이지가 아직 서비스워커 관할이 아니라 controllerchange 가 안 온다 — 그땐 직접 새로고침한다.
  const refresh = async () => { const controlled = !!navigator.serviceWorker?.controller; await updateServiceWorker(true); if (!controlled) location.reload(); };
  return <div className="update-bar"><span>새 버전이 있어요</span><button onClick={refresh}>새로고침</button></div>;
}
