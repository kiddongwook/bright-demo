/* 푸시 알림 핸들러 — vite-plugin-pwa(generateSW)가 만든 sw.js 가 importScripts 로 이 파일을 붙인다.
   워크박스 번들을 건드리지 않고 우리 코드만 따로 두려는 것. 서버(outbox-send)가 보내는 페이로드는
   { title, body, view, ref } 한 가지뿐이다. */

/* 앱이 깔린 자리 — 로컬은 '/', GitHub Pages 는 '/bright-demo/pwa/'.
   빌드 상수 대신 등록 범위에서 뽑는다(같은 파일이 두 곳에서 다 돌아야 해서). */
const SCOPE = self.registration.scope;                 // 'https://호스트/bright-demo/pwa/'
const BASE = new URL(SCOPE).pathname;                  // '/bright-demo/pwa/'

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const view = typeof d.view === 'string' ? d.view : '';
  const ref = typeof d.ref === 'string' ? d.ref : '';
  event.waitUntil(self.registration.showNotification(d.title || '알림', {
    body: d.body || '',
    icon: BASE + 'logo/bright-icon-192.png',
    // 배지는 안드로이드 상태 표시줄의 작은 단색 자리 — 알파만 쓰이니 흰 실루엣 한 장을 따로 둔다
    badge: BASE + 'logo/bright-badge.png',
    data: { view, ref },
    // 같은 화면으로 가는 알림은 한 줄로 겹친다. renotify 가 없으면 두 번째 알림이 소리 없이 첫 알림을 갈아치운다.
    tag: view + ':' + ref,
    renotify: true,
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const view = data.view || '';
  const ref = data.ref || '';
  const coldUrl = SCOPE + '?v=' + encodeURIComponent(view) + (ref ? '&r=' + encodeURIComponent(ref) : '');
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = list.find(c => c.url.startsWith(SCOPE));
    if (open) {
      // 열려 있으면 앱을 앞으로 불러 놓고 화면만 옮긴다 — 새 창을 또 열지 않는다.
      try {
        const c = (await open.focus()) || open;
        c.postMessage({ type: 'nav', view, ref });
        return;
      } catch { /* focus 가 막히면(사용자 제스처 없음 등) 아래에서 새로 연다 */ }
    }
    await self.clients.openWindow(coldUrl);
  })());
});
