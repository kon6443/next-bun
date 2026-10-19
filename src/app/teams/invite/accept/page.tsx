"use client";

import { useEffect, useState, Suspense, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { startKakaoLogin } from "@/app/auth/shared";
import { acceptTeamInvite } from "@/services/teamService";
import { TeamsCenteredLayout, LoadingSpinnerSimple, Button } from "../../components";
import { useSafeNavigation } from "@/app/hooks";
import { cardStyles } from "@/styles/teams";
import { ApiError } from "@/types/api";

function InviteAcceptContent() {
  const { getParam } = useSafeNavigation();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const token = getParam("token") || null;
  // 수락 요청은 한 번만 — state 가드는 같은 렌더의 effect 재실행(StrictMode 등)을 막지 못한다
  const acceptStartedRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
  }, []);

  const handleAcceptInvite = useCallback(async () => {
    if (!token || !session?.user?.accessToken || acceptStartedRef.current) {
      return;
    }
    acceptStartedRef.current = true;

    setIsProcessing(true);
    setError(null);

    try {
      const response = await acceptTeamInvite(
        { token },
        session.user.accessToken
      );

      setSuccess(true);
      redirectTimerRef.current = setTimeout(() => {
        router.push(`/teams/${response.data.teamId}`);
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "팀 초대 수락에 실패했습니다.";
      setError(errorMessage);
      setIsProcessing(false);
    }
  }, [token, session?.user?.accessToken, router]);

  useEffect(() => {
    if (!token) {
      setError("초대 링크가 유효하지 않습니다.");
      return;
    }

    if (status === "loading") {
      return;
    }

    // 로그인 시작이 실패해 error 를 띄웠으면 다시 시작하지 않는다 (error 변경으로 effect 가 재실행된다)
    if (status === "unauthenticated" && !error) {
      const callbackUrl = `/teams/invite/accept?token=${encodeURIComponent(token)}`;
      // 공통 진입점 — 로딩 오버레이와 중복 시작 방지(effect 재실행 시 signIn 이 두 번 나가지 않게)
      startKakaoLogin({ callbackUrl }).catch(() => {
        setError("로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
      return;
    }

    if (
      status === "authenticated" &&
      session?.user?.accessToken &&
      !isProcessing &&
      !success &&
      !error
    ) {
      handleAcceptInvite();
    }
  }, [token, status, session, isProcessing, success, error, handleAcceptInvite]);

  if (!token) {
    return (
      <TeamsCenteredLayout>
        <div className={`${cardStyles.section} w-full max-w-md p-8`}>
          <div className="text-center">
            <p className="text-lg font-semibold text-red-400">
              초대 링크가 유효하지 않습니다.
            </p>
            <p className="mt-2 text-sm text-slate-400">
              토큰이 제공되지 않았습니다.
            </p>
          </div>
        </div>
      </TeamsCenteredLayout>
    );
  }

  if (
    status === "loading" ||
    (status === "authenticated" && isProcessing && !success)
  ) {
    return (
      <TeamsCenteredLayout>
        <div className={`${cardStyles.section} w-full max-w-md p-8`}>
          <div className="text-center">
            <LoadingSpinnerSimple message="팀 초대를 처리하는 중..." />
            <p className="mt-2 text-sm text-slate-400">잠시만 기다려주세요.</p>
          </div>
        </div>
      </TeamsCenteredLayout>
    );
  }

  if (success) {
    return (
      <TeamsCenteredLayout>
        <div className={`${cardStyles.section} w-full max-w-md p-8`}>
          <div className="text-center">
            <div className="mb-4 text-5xl">✅</div>
            <p className="text-lg font-semibold text-green-400">
              팀 초대 수락 완료!
            </p>
            <p className="mt-2 text-sm text-slate-400">
              팀 페이지로 이동합니다...
            </p>
          </div>
        </div>
      </TeamsCenteredLayout>
    );
  }

  if (error) {
    return (
      <TeamsCenteredLayout>
        <div className={`${cardStyles.errorSection} w-full max-w-md p-8`}>
          <div className="text-center">
            <div className="mb-4 text-5xl">❌</div>
            <p className="text-lg font-semibold text-red-400">
              팀 초대 수락 실패
            </p>
            <p className="mt-2 text-sm text-slate-300">{error}</p>
            <Button
              variant="secondary"
              onClick={() => router.push("/teams")}
              className="mt-6"
            >
              팀 목록으로 돌아가기
            </Button>
          </div>
        </div>
      </TeamsCenteredLayout>
    );
  }

  return null;
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <TeamsCenteredLayout>
          <div className={`${cardStyles.section} w-full max-w-md p-8`}>
            <div className="text-center">
              <p className="text-slate-400">로딩 중...</p>
            </div>
          </div>
        </TeamsCenteredLayout>
      }
    >
      <InviteAcceptContent />
    </Suspense>
  );
}
