type AlertVariant = 'success' | 'error' | 'warning' | 'info';

type AlertProps = {
  variant: AlertVariant;
  message: string;
  className?: string;
};

const variantStyles: Record<AlertVariant, { container: string; text: string }> = {
  success: {
    container: 'border-green-500/20 bg-green-500/10',
    text: 'text-green-400',
  },
  error: {
    container: 'border-red-500/20 bg-red-500/10',
    text: 'text-red-400',
  },
  warning: {
    container: 'border-orange-500/20 bg-orange-500/10',
    text: 'text-orange-400',
  },
  info: {
    container: 'border-sky-500/20 bg-sky-500/10',
    text: 'text-sky-400',
  },
};

/**
 * 통합 Alert 컴포넌트
 * @param variant - 'success' | 'error' | 'warning' | 'info'
 * @param message - 표시할 메시지
 * @param className - 추가 CSS 클래스
 */
export function Alert({ variant, message, className = '' }: AlertProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={`rounded-2xl border px-6 py-4 ${styles.container} ${className}`.trim()}
      role="alert"
    >
      <p className={`text-base font-semibold ${styles.text}`}>{message}</p>
    </div>
  );
}

// 하위 호환성을 위한 래퍼 컴포넌트들
type LegacyAlertProps = {
  message: string;
  className?: string;
};

/** @deprecated Alert 컴포넌트를 사용하세요 */
export function ErrorAlert({ message, className }: LegacyAlertProps) {
  return <Alert variant="error" message={message} className={className} />;
}

/** @deprecated Alert 컴포넌트를 사용하세요 */
export function SuccessAlert({ message, className }: LegacyAlertProps) {
  return <Alert variant="success" message={message} className={className} />;
}
