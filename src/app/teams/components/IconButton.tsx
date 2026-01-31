import Link from 'next/link';
import type { ComponentType } from 'react';

type IconProps = {
  className?: string;
};

type IconButtonVariant = 'ghost' | 'outlined';

const variantStyles: Record<IconButtonVariant, string> = {
  ghost: 'text-slate-400 hover:text-white hover:bg-white/10',
  outlined: 'border border-white/20 text-slate-300 hover:border-white/40 hover:text-white',
};

const baseStyles =
  'flex items-center justify-center rounded-full p-2 transition disabled:opacity-50 disabled:cursor-not-allowed';

type IconButtonBaseProps = {
  /** 렌더링할 아이콘 컴포넌트 */
  icon: ComponentType<IconProps>;
  /** 버튼 스타일 */
  variant?: IconButtonVariant;
  /** 접근성 라벨 (title 속성으로도 사용) */
  label: string;
  /** 비활성화 상태 */
  disabled?: boolean;
  /** 추가 클래스 */
  className?: string;
};

type IconButtonAsButton = IconButtonBaseProps & {
  /** 클릭 핸들러 */
  onClick: () => void;
  href?: never;
};

type IconButtonAsLink = IconButtonBaseProps & {
  /** 이동할 URL */
  href: string;
  onClick?: never;
};

type IconButtonProps = IconButtonAsButton | IconButtonAsLink;

/**
 * IconButton 컴포넌트
 * - 작은 원형 아이콘 버튼
 * - href 제공 시 Link, 아니면 button으로 렌더링
 * - variant: ghost (투명 배경) | outlined (테두리)
 */
export function IconButton({
  icon: Icon,
  variant = 'ghost',
  label,
  disabled = false,
  className = '',
  ...props
}: IconButtonProps) {
  const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${className}`.trim();

  if ('href' in props && props.href) {
    return (
      <Link href={props.href} className={combinedClassName} title={label} aria-label={label}>
        <Icon className='w-5 h-5' />
      </Link>
    );
  }

  if ('onClick' in props) {
    return (
      <button
        type='button'
        onClick={props.onClick}
        disabled={disabled}
        className={combinedClassName}
        title={label}
        aria-label={label}
      >
        <Icon className='w-5 h-5' />
      </button>
    );
  }

  return null;
}
