import { cardStyles } from "@/styles/teams";

type LoadingSpinnerProps = {
  /** 로딩 메시지 (기본값: "로딩 중...") */
  message?: string;
};

/**
 * 로딩 스피너 컴포넌트
 * - 대시 보더 컨테이너 포함
 * - 스피너 애니메이션 + 메시지
 */
export function LoadingSpinner({ message = "로딩 중..." }: LoadingSpinnerProps) {
  return (
    <div
      className={`${cardStyles.dashedContainer} px-6 py-14 text-center`}
    >
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-400 border-t-transparent" />
      <p className="mt-4 text-base font-semibold text-white">{message}</p>
    </div>
  );
}

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

type ButtonSpinnerProps = {
  /** 스피너 크기 (기본값: "sm") */
  size?: "sm" | "md";
  /** 추가 CSS 클래스 */
  className?: string;
};

/**
 * 버튼용 인라인 스피너 컴포넌트
 * - 버튼 내에서 로딩 상태를 표시할 때 사용
 * - border-current를 사용하여 부모 요소의 색상을 상속
 */
export function ButtonSpinner({ size = "sm", className = "" }: ButtonSpinnerProps) {
  const sizeClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${sizeClass} ${className}`}
      aria-hidden="true"
    />
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
