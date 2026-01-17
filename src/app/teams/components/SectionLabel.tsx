type SectionLabelProps = {
  children: React.ReactNode;
  /** 자간 간격: tight(0.4em), normal(0.6em), wide(0.7em) */
  spacing?: "tight" | "normal" | "wide";
  /** 텍스트 색상: muted(slate-400), subtle(slate-500) */
  color?: "muted" | "subtle";
};

const spacingStyles = {
  tight: "tracking-[0.4em]",
  normal: "tracking-[0.6em]",
  wide: "tracking-[0.7em]",
} as const;

const colorStyles = {
  muted: "text-slate-400",
  subtle: "text-slate-500",
} as const;

/**
 * 섹션 라벨 컴포넌트 (Eyebrow 텍스트)
 * 대문자 + 자간 넓힘 스타일
 */
export function SectionLabel({
  children,
  spacing = "normal",
  color = "muted",
}: SectionLabelProps) {
  return (
    <p
      className={`text-xs uppercase ${spacingStyles[spacing]} ${colorStyles[color]}`}
    >
      {children}
    </p>
  );
}
