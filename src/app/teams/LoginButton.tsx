"use client";

import { signIn } from "next-auth/react";

type LoginButtonProps = {
  variant?: "default" | "primary";
  size?: "sm" | "md";
  className?: string;
  children?: React.ReactNode;
};

export default function LoginButton({
  variant = "default",
  size = "md",
  className = "",
  children,
}: LoginButtonProps) {
  const baseClasses = "rounded-full font-semibold transition";
  
  const variantClasses = {
    default: "border border-white/20 text-slate-200 hover:border-white/40",
    primary: "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-sky-500/30 hover:brightness-110",
  };

  const sizeClasses = {
    sm: "px-4 py-2 text-xs sm:px-5 sm:text-sm",
    md: "px-4 py-2 text-xs sm:px-6 sm:py-3 sm:text-sm",
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return (
    <button onClick={() => signIn("kakao")} className={classes}>
      {children || "로그인하기"}
    </button>
  );
}
