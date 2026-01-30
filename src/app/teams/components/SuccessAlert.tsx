type SuccessAlertProps = {
  message: string;
  className?: string;
};

/**
 * 성공 알림 컴포넌트
 * 초록색 배경의 알림 박스
 */
export function SuccessAlert({ message, className = "" }: SuccessAlertProps) {
  return (
    <div
      className={`rounded-2xl border border-green-500/20 bg-green-500/10 px-6 py-4 ${className}`.trim()}
    >
      <p className="text-base font-semibold text-green-400">{message}</p>
    </div>
  );
}
