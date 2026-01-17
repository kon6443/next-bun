type ErrorAlertProps = {
  message: string;
  className?: string;
};

/**
 * 에러 알림 컴포넌트
 * 빨간색 배경의 경고 박스
 */
export function ErrorAlert({ message, className = "" }: ErrorAlertProps) {
  return (
    <div
      className={`rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 ${className}`.trim()}
    >
      <p className="text-base font-semibold text-red-400">{message}</p>
    </div>
  );
}
