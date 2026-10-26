"use client";

import { useKakaoLogin } from "@/app/auth/useKakaoLogin";

/**
 * 로그인 만료(401) 뒤 다시 로그인 — 보관한 기록을 내 기록으로 등록하려면 새 토큰이 필요하다(익명으로 다시 내지 않는다)
 * 로그인 뒤 지금 화면으로 돌아온다(보관분 다시 등록이 이 화면에 있다)
 */
export function ReloginButton({ className = "", label = "다시 로그인" }: { className?: string; label?: string }) {
  const { start, isStarting } = useKakaoLogin();
  return (
    <button
      type="button"
      onClick={() => start({ callbackUrl: `${window.location.pathname}${window.location.search}` })}
      disabled={isStarting}
      aria-busy={isStarting}
      className={`inline-flex min-h-11 items-center justify-center rounded-full bg-[#FEE500] px-4 text-sm font-semibold text-[#181600] disabled:opacity-70 ${className}`}
    >
      {isStarting ? "카카오로 이동 중..." : label}
    </button>
  );
}
