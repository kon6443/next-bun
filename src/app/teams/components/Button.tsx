import Link from "next/link";
import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-sky-500/30 hover:brightness-110",
  secondary:
    "border border-white/20 text-slate-200 hover:border-white/40 bg-transparent",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-xs",
  md: "px-6 py-3 text-sm",
  lg: "px-4 py-2 text-xs sm:px-6 sm:py-3 sm:text-sm",
};

const baseStyles =
  "rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Button 컴포넌트
 * @param variant - "primary" (그라데이션) | "secondary" (테두리)
 * @param size - "sm" | "md" | "lg"
 * @param fullWidth - 전체 너비 사용 여부
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const widthClass = fullWidth ? "w-full" : "";

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthClass} ${className}`.trim()}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

type ButtonLinkProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  href: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * ButtonLink 컴포넌트 (Link로 렌더링)
 * @param variant - "primary" (그라데이션) | "secondary" (테두리)
 * @param size - "sm" | "md" | "lg"
 * @param fullWidth - 전체 너비 사용 여부
 * @param href - 이동할 URL
 */
export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth = false,
  href,
  className = "",
  children,
}: ButtonLinkProps) {
  const widthClass = fullWidth ? "w-full" : "";

  return (
    <Link
      href={href}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthClass} inline-block text-center ${className}`.trim()}
    >
      {children}
    </Link>
  );
}
