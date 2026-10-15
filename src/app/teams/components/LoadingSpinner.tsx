type LoadingSpinnerSimpleProps = {
  /** 로딩 메시지 */
  message?: string;
};

/**
 * 간단한 로딩 스피너 (대시 보더 없음)
 */
export function LoadingSpinnerSimple({
  message,
}: LoadingSpinnerSimpleProps) {
  return (
    <div className="text-center">
      <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-400 border-t-transparent" />
      {message && (
        <p className="text-lg font-semibold text-slate-200">{message}</p>
      )}
    </div>
  );
}

type BarLoaderProps = {
  /** 로딩 메시지 */
  message?: string;
  /** 바 개수 (기본값: 5) */
  barCount?: number;
  /** 바 높이 (기본값: "24px") */
  barHeight?: string;
  /** 추가 CSS 클래스 */
  className?: string;
};

/**
 * 바형 게이지 로딩 컴포넌트
 * - 세로 바들이 순차적으로 채워지는 애니메이션
 * - 세련된 로딩 UI
 */
export function BarLoader({
  message,
  barCount = 5,
  barHeight = "24px",
  className = "",
}: BarLoaderProps) {
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <div className="flex items-end gap-1">
        {Array.from({ length: barCount }, (_, i) => (
          <span
            key={i}
            className="w-1.5 rounded-full bg-gradient-to-t from-amber-400 to-yellow-300 animate-barLoader"
            style={{
              height: barHeight,
              animationDelay: `${i * 0.12}s`,
              transformOrigin: "bottom",
            }}
            aria-hidden="true"
          />
        ))}
      </div>
      {message && (
        <p className="text-sm font-medium text-slate-600">{message}</p>
      )}
    </div>
  );
}
