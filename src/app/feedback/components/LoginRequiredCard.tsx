"use client";

import { useKakaoLogin } from "@/app/auth/useKakaoLogin";
import { SectionLabel } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";

type LoginRequiredCardProps = {
  description: string;
};

/**
 * 비로그인 안내 카드 (마이페이지 미인증 화면과 같은 패턴)
 * 로그인 후 지금 화면(쿼리 포함)으로 돌아오도록 callbackUrl을 넘긴다 — 기본값은 /mypage다
 */
export function LoginRequiredCard({ description }: LoginRequiredCardProps) {
  const { start, isStarting } = useKakaoLogin();

  const handleLogin = () => {
    start({ callbackUrl: `${window.location.pathname}${window.location.search}` });
  };

  return (
    <section className={`${cardStyles.section} px-6 py-10 text-center`}>
      <SectionLabel spacing="wide">회원 전용</SectionLabel>
      <h1 className="mt-3 text-2xl font-bold text-white">로그인이 필요해요</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">{description}</p>
      <button
        type="button"
        onClick={handleLogin}
        disabled={isStarting}
        aria-disabled={isStarting}
        aria-busy={isStarting}
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] px-5 py-3 text-base font-semibold text-[#181600] shadow-[0_18px_35px_rgba(251,191,36,0.35)] transition hover:brightness-105 disabled:cursor-progress disabled:opacity-70"
      >
        <span className="text-xl" aria-hidden="true">💬</span>
        {isStarting ? "카카오로 이동 중..." : "카카오로 계속하기"}
      </button>
    </section>
  );
}
