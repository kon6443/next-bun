import { SectionLabel } from "./SectionLabel";

type DateInfoCardProps = {
  label: string;
  date: Date | null;
  /** 텍스트 색상 variant: default(slate-300), muted(slate-400) */
  variant?: "default" | "muted";
};

const formatDate = (date: Date | null) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

/**
 * 날짜 정보 카드 컴포넌트
 * 시작일, 종료일, 생성일 등 날짜 정보를 일관된 스타일로 표시
 */
export function DateInfoCard({
  label,
  date,
  variant = "default",
}: DateInfoCardProps) {
  if (!date) return null;

  const textColorClass = variant === "default" ? "text-slate-300" : "text-slate-400";

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3 sm:p-4">
      <SectionLabel spacing="tight" color="subtle">
        {label}
      </SectionLabel>
      <p className={`mt-1.5 sm:mt-2 text-sm break-words ${textColorClass}`}>
        {formatDate(date)}
      </p>
    </div>
  );
}
