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
