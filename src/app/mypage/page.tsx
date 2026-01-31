"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { AUTH_LOADING_KEY } from "@/app/components/AuthLoadingOverlay";

export default function Mypage() {
  const { data: session, status } = useSession();
  const user = session?.user;

  const handleKakaoLogin = () => {
    // 전역 로딩 오버레이 활성화
    sessionStorage.setItem(AUTH_LOADING_KEY, "true");
    signIn("kakao");
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-radial from-blue-500/30 via-transparent to-transparent bg-[var(--background)]">
        <section className="w-full max-w-[430px] bg-gradient-to-br from-slate-900/95 to-slate-900/75 border border-slate-400/25 rounded-[28px] p-11 shadow-[0_35px_65px_rgba(2,6,23,0.75)] text-center">
          <p className="text-slate-500">사용자 정보를 불러오는 중입니다...</p>
        </section>
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 mypage-bg">
        <section className="w-full max-w-[430px] bg-gradient-to-br from-slate-900/95 to-slate-900/75 border border-slate-400/25 rounded-[28px] p-11 shadow-[0_35px_65px_rgba(2,6,23,0.75)] text-center">
          {/* 아바타 */}
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-600/20 to-indigo-500/20 flex items-center justify-center">
            <span className="text-4xl font-semibold text-slate-100">
              {user.name?.[0] ?? "🙂"}
            </span>
          </div>
          
          {/* 환영 메시지 */}
          <p className="uppercase tracking-[0.35em] text-[0.72rem] font-semibold text-slate-400 mb-2">
            환영합니다
          </p>
          
          {/* 이름 */}
          <h1 className="text-[2.15rem] font-bold text-slate-200 mb-3">
            {user.name ?? "마이페이지"}
          </h1>
          
          {/* 사용자 번호 */}
          <p className="text-base text-slate-300 leading-relaxed mb-7">
            등록된 사용자 번호는 <strong>#{user.userId}</strong> 입니다.
          </p>
          
          {/* 로그아웃 버튼 */}
          <button
            onClick={() => signOut()}
            className="w-full rounded-full border-none py-4 px-5 text-base font-semibold cursor-pointer transition-all duration-150 hover:scale-[1.02] hover:brightness-110 flex items-center justify-center gap-1 bg-gradient-to-r from-blue-500/35 to-indigo-500/40 text-slate-100 shadow-[0_18px_35px_rgba(59,130,246,0.35)]"
          >
            로그아웃
          </button>
        </section>
      </div>
    );
  }

  // 미인증 상태
  return (
    <div className="min-h-screen flex items-center justify-center p-8 mypage-bg">
      <section className="w-full max-w-[430px] bg-gradient-to-br from-slate-900/95 to-slate-900/75 border border-slate-400/25 rounded-[28px] p-11 shadow-[0_35px_65px_rgba(2,6,23,0.75)] text-center">
        {/* 안내 메시지 */}
        <p className="uppercase tracking-[0.35em] text-[0.72rem] font-semibold text-slate-400 mb-2">
          회원 전용 공간
        </p>
        
        {/* 제목 */}
        <h1 className="text-[2.15rem] font-bold text-slate-200 mb-3">
          로그인이 필요해요
        </h1>
        
        {/* 설명 */}
        <p className="text-base text-slate-300 leading-relaxed mb-7">
          마이페이지에서는 개인화된 일정과 즐겨찾기를 확인할 수 있습니다.
        </p>
        
        {/* 카카오 로그인 버튼 */}
        <button
          onClick={handleKakaoLogin}
          className="w-full rounded-full border-none py-4 px-5 text-base font-semibold cursor-pointer transition-all duration-150 hover:scale-[1.02] hover:brightness-110 flex items-center justify-center gap-2 bg-[#FEE500] text-[#181600] shadow-[0_18px_35px_rgba(251,191,36,0.35)]"
        >
          <span className="text-xl">💬</span>
          카카오로 계속하기
        </button>
      </section>
    </div>
  );
}
