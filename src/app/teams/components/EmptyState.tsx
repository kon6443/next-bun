type EmptyStateVariant = 'default' | 'dashed' | 'minimal';

type EmptyStateProps = {
  /** 표시할 메시지 */
  message: string;
  /** 부가 설명 (선택) */
  description?: string;
  /** 스타일 변형 */
  variant?: EmptyStateVariant;
  /** 아이콘 (선택) */
  icon?: React.ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
  /** 액션 버튼 (선택) */
  action?: React.ReactNode;
};

const variantStyles: Record<EmptyStateVariant, string> = {
  default: 'rounded-2xl border border-white/10 bg-slate-950/30',
  dashed: 'rounded-2xl border border-dashed border-slate-600/80',
  minimal: '',
};

/**
 * 빈 상태 표시 컴포넌트
 * 데이터가 없을 때 일관된 UI를 제공합니다.
 */
export function EmptyState({
  message,
  description,
  variant = 'dashed',
  icon,
  className = '',
  action,
}: EmptyStateProps) {
  return (
    <div
      className={`px-6 py-10 text-center ${variantStyles[variant]} ${className}`.trim()}
    >
      {icon && (
        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/50 text-slate-400">
            {icon}
          </div>
        </div>
      )}
      <p className="text-sm font-medium text-slate-400">{message}</p>
      {description && (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
