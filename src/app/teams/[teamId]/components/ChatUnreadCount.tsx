'use client';

interface ChatUnreadCountProps {
  /** 안 읽은 인원 수. null(계산 불가)·0이면 표시하지 않는다 */
  count: number | null;
  /** 누르면 읽음/안읽음 명단 모달 (D-019) */
  onClick: () => void;
}

/**
 * 메시지별 안 읽은 인원 수 — 말풍선 옆 시간 위, 노란 작은 글씨 (D-022)
 */
export function ChatUnreadCount({ count, onClick }: ChatUnreadCountProps) {
  if (!count) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[10px] font-semibold text-yellow-400 hover:underline"
      aria-label={`안 읽은 멤버 ${count}명, 명단 보기`}
    >
      {count}
    </button>
  );
}
