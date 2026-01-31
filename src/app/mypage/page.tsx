"use client";

import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { AUTH_LOADING_KEY } from "@/app/components/AuthLoadingOverlay";
import { MypageSkeleton } from "@/app/teams/components";
import { updateUserProfile } from "@/services/userService";

// 공통 스타일 상수
const CARD_STYLES = "w-full max-w-[430px] bg-gradient-to-br from-slate-900/95 to-slate-900/75 border border-slate-400/25 rounded-[28px] p-11 shadow-[0_35px_65px_rgba(2,6,23,0.75)] text-center";
const BASE_BUTTON_STYLES = "w-full rounded-full border-none py-4 px-5 text-base font-semibold cursor-pointer transition-all duration-150 hover:scale-[1.02] hover:brightness-110 flex items-center justify-center";

export default function Mypage() {
  const { data: session, status, update } = useSession();
  const user = session?.user;
  
  const [isEditing, setIsEditing] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleKakaoLogin = () => {
    // 전역 로딩 오버레이 활성화
    sessionStorage.setItem(AUTH_LOADING_KEY, "true");
    signIn("kakao");
  };

  const handleEditClick = () => {
    setNewUserName(user?.userName ?? "");
    setIsEditing(true);
    setError(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setNewUserName("");
    setError(null);
  };

  const handleSaveUserName = async () => {
    if (!newUserName.trim()) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (newUserName.length > 20) {
      setError("닉네임은 20자 이하로 입력해주세요.");
      return;
    }
    if (!user?.accessToken) {
      setError("로그인이 필요합니다.");
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await updateUserProfile(newUserName.trim(), user.accessToken);
      // 세션 업데이트
      await update({ userName: response.data.userName });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "닉네임 수정에 실패했습니다.");
    } finally {
      setIsUpdating(false);
    }
  };

  // 로딩 상태: 스켈레톤 UI 표시
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-radial from-blue-500/30 via-transparent to-transparent bg-[var(--background)]">
        <MypageSkeleton />
      </div>
    );
  }

  // 인증 여부: 세션 존재 + accessToken 존재 여부로 판단
  const isAuthenticated = status === "authenticated" && !!session?.user?.accessToken;

  if (isAuthenticated) {
    const displayName = user?.userName ?? `사용자${user?.userId}`;
    
    return (
      <div className="min-h-screen flex items-center justify-center p-8 mypage-bg">
        <section className={CARD_STYLES}>
          {/* 아바타 */}
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-600/20 to-indigo-500/20 flex items-center justify-center">
            <span className="text-4xl font-semibold text-slate-100">
              {displayName[0] ?? "🙂"}
            </span>
          </div>
          
          {/* 환영 메시지 */}
          <p className="uppercase tracking-[0.35em] text-[0.72rem] font-semibold text-slate-400 mb-2">
            환영합니다
          </p>
          
          {/* 이름 (수정 모드) */}
          {isEditing ? (
            <div className="mb-3">
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-2 text-center text-xl font-bold bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                placeholder="닉네임 입력"
                autoFocus
              />
              <p className="text-xs text-slate-500 mt-1">{newUserName.length}/20</p>
            </div>
          ) : (
            <h1 
              className="text-[2.15rem] font-bold text-slate-200 mb-3 cursor-pointer hover:text-blue-400 transition-colors"
              onClick={handleEditClick}
              title="클릭하여 닉네임 수정"
            >
              {displayName}
            </h1>
          )}
          
          {/* 에러 메시지 */}
          {error && (
            <p className="text-sm text-red-400 mb-3">{error}</p>
          )}
          
          {/* 사용자 번호 */}
          <p className="text-base text-slate-300 leading-relaxed mb-7">
            등록된 사용자 번호는 <strong>#{user?.userId}</strong> 입니다.
          </p>
          
          {/* 버튼 영역 */}
          {isEditing ? (
            <div className="flex gap-3">
              <button
                onClick={handleCancelEdit}
                disabled={isUpdating}
                className={`${BASE_BUTTON_STYLES} flex-1 bg-slate-700/50 text-slate-300`}
              >
                취소
              </button>
              <button
                onClick={handleSaveUserName}
                disabled={isUpdating}
                className={`${BASE_BUTTON_STYLES} flex-1 bg-gradient-to-r from-blue-500/35 to-indigo-500/40 text-slate-100 shadow-[0_18px_35px_rgba(59,130,246,0.35)]`}
              >
                {isUpdating ? "저장 중..." : "저장"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => signOut()}
              className={`${BASE_BUTTON_STYLES} gap-1 bg-gradient-to-r from-blue-500/35 to-indigo-500/40 text-slate-100 shadow-[0_18px_35px_rgba(59,130,246,0.35)]`}
            >
              로그아웃
            </button>
          )}
        </section>
      </div>
    );
  }

  // 미인증 상태
  return (
    <div className="min-h-screen flex items-center justify-center p-8 mypage-bg">
      <section className={CARD_STYLES}>
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
          className={`${BASE_BUTTON_STYLES} gap-2 bg-[#FEE500] text-[#181600] shadow-[0_18px_35px_rgba(251,191,36,0.35)]`}
        >
          <span className="text-xl">💬</span>
          카카오로 계속하기
        </button>
      </section>
    </div>
  );
}
