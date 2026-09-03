import { IcWarn } from './icons';
import '../screens/ui.css';

/* 못 읽었을 때 — 토스트만 띄우고 빈 화면을 두지 않는다. */
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="box">
      <div className="empty">
        <span className="ico warn"><IcWarn /></span>
        <span className="et">불러오지 못했어요</span>
        <span className="eh">인터넷을 확인하고 다시 시도해 주세요</span>
        {onRetry && <button className="btn line" onClick={onRetry}>다시 시도</button>}
      </div>
    </div>
  );
}
