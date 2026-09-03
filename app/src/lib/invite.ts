import { getContext } from './api';

/** 학부모 초대 문구 — More(더보기)와 Roster(아직 안 들어온 사람)가 같이 쓴다 */
export function inviteText(academyName: string, slug: string | null): string {
  const url = `${location.origin}${import.meta.env.BASE_URL}${slug ? '?a=' + slug : ''}`;
  return `[${academyName}] 학부모님, 학원 앱을 열었어요.
아래 주소를 누르고 등록된 휴대폰 번호로 들어오시면 출결·공지·문의를 바로 보실 수 있어요.
${url}
홈 화면에 추가하면 앱처럼 쓸 수 있어요 (앱 안 더보기 → 홈 화면에 추가).`;
}

/** 초대 문구를 복사한 적이 있나 — 첫걸음 카드의 ③ 단계를 체크한다 */
export const inviteSentKey = (academyId: string) => `invite_sent_${academyId}`;
export function inviteSent(academyId: string): boolean {
  try { return localStorage.getItem(inviteSentKey(academyId)) === '1'; } catch { return false; }
}

/** 클립보드에 복사. 막히면(권한 없음·API 없음) false — 호출부가 직접 복사 UI로 대체한다 */
export async function copyInvite(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) throw new Error('클립보드를 쓸 수 없어요');
    await navigator.clipboard.writeText(text);
    try { localStorage.setItem(inviteSentKey(getContext().academyId), '1'); } catch { /* 저장소가 막혀도 복사는 됐다 */ }
    return true;
  } catch { return false; }
}
