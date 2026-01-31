import Link from 'next/link';
import { PlusIcon } from '@/app/components/Icons';

type FABProps = {
  /** 클릭 시 이동할 URL (Link 사용) */
  href?: string;
  /** 클릭 핸들러 (Button 사용) */
  onClick?: () => void;
  /** 접근성 라벨 */
  label?: string;
  /** 비활성화 상태 */
  disabled?: boolean;
};

const fabStyles =
  'fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-sky-500/40 transition hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * FAB (Floating Action Button) 컴포넌트
 * - 화면 우하단 고정
 * - BottomNavBar 위에 위치 (bottom-24)
 * - 주요 액션용 (새 카드 작성, 팀 생성 등)
 */
export function FAB({ href, onClick, label = '추가', disabled = false }: FABProps) {
  if (href) {
    return (
      <Link href={href} className={fabStyles} aria-label={label}>
        <PlusIcon className='w-6 h-6' />
      </Link>
    );
  }

  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className={fabStyles}
      aria-label={label}
    >
      <PlusIcon className='w-6 h-6' />
    </button>
  );
}
