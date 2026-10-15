import { formatBadgeCount } from '@/app/utils/teamChatUtils';

type CountBadgeProps = {
  /** 표시할 수. 0 이하면 렌더링하지 않는다 */
  count: number;
  /** 위치 등 추가 클래스 (예: 아이콘 위에 겹칠 때 `absolute -top-1 -right-1`) */
  className?: string;
};

/**
 * 숫자 배지 (D-022)
 * - 작은 빨간 원 + 흰 글자, 99 초과는 `99+`
 * - 채팅 버튼(IconButton badge)과 팀 목록 카드에서 같은 모양으로 쓴다
 * - 스크린리더용 문구는 배지를 쓰는 쪽 aria-label이 맡는다
 */
export function CountBadge({ count, className = '' }: CountBadgeProps) {
  const text = formatBadgeCount(count);
  if (!text) return null;

  return (
    <span
      aria-hidden="true"
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ${className}`.trim()}
    >
      {text}
    </span>
  );
}
