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

const fabWrapperStyles =
  'pointer-events-none fixed inset-x-0 bottom-36 z-50 mx-auto flex max-w-lg justify-end px-4';

const fabStyles =
  'pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-sky-500/40 transition hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * FAB (Floating Action Button) 컴포넌트
 * - 모바일 레이아웃(max-w-lg) 우하단에 정렬
 * - BottomNavBar 위에 위치 (bottom-36)
 * - 주요 액션용 (새 카드 작성, 팀 생성 등)
 */
export function FAB({ href, onClick, label = '추가', disabled = false }: FABProps) {
  return (
    <div className={fabWrapperStyles} aria-hidden={disabled ? 'true' : undefined}>
      {href ? (
        <Link href={href} className={fabStyles} aria-label={label}>
          <PlusIcon className='w-6 h-6' />
        </Link>
      ) : (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          className={fabStyles}
          aria-label={label}
        >
          <PlusIcon className='w-6 h-6' />
        </button>
      )}
    </div>
  );
}
