'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { signIn } from 'next-auth/react';
import { acceptTeamInvite } from '@/services/teamService';

const pageBackground = {
  background:
    'radial-gradient(circle at 20% 20%, rgba(79,70,229,0.15), transparent 50%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.1), transparent 50%), rgb(2,6,23)',
};

function InviteAcceptContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const token = searchParams.get('token');

  const handleAcceptInvite = useCallback(async () => {
    if (!token || !session?.user?.accessToken) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await acceptTeamInvite(
        { token },
        session.user.accessToken,
      );

      setSuccess(true);
      // 성공 시 팀 상세 페이지로 리다이렉트
      setTimeout(() => {
        router.push(`/teams/${response.teamId}`);
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '팀 초대 수락에 실패했습니다.';
      setError(errorMessage);
      setIsProcessing(false);
    }
  }, [token, session?.user?.accessToken, router]);

  useEffect(() => {
    // 토큰이 없으면 에러
    if (!token) {
      setError('초대 링크가 유효하지 않습니다.');
      return;
    }

    // 세션이 로딩 중이면 대기
    if (status === 'loading') {
      return;
    }

    // 비회원이면 로그인 페이지로 리다이렉트
    if (status === 'unauthenticated') {
      const callbackUrl = `/teams/invite/accept?token=${encodeURIComponent(token)}`;
      signIn('kakao', { callbackUrl });
      return;
    }

    // 로그인된 상태이고 아직 처리하지 않았다면 초대 수락 처리
    if (status === 'authenticated' && session?.user?.accessToken && !isProcessing && !success && !error) {
      handleAcceptInvite();
    }
  }, [token, status, session, isProcessing, success, error, handleAcceptInvite]);

  if (!token) {
    return (
      <div className='relative min-h-screen overflow-hidden text-slate-100' style={pageBackground}>
        <div className='relative z-10 flex min-h-screen items-center justify-center px-4'>
          <div className='w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8'>
            <div className='text-center'>
              <p className='text-lg font-semibold text-red-400'>초대 링크가 유효하지 않습니다.</p>
              <p className='mt-2 text-sm text-slate-400'>토큰이 제공되지 않았습니다.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'loading' || (status === 'authenticated' && isProcessing && !success)) {
    return (
      <div className='relative min-h-screen overflow-hidden text-slate-100' style={pageBackground}>
        <div className='relative z-10 flex min-h-screen items-center justify-center px-4'>
          <div className='w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8'>
            <div className='text-center'>
              <div className='mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-400 border-t-transparent' />
              <p className='text-lg font-semibold text-slate-200'>팀 초대를 처리하는 중...</p>
              <p className='mt-2 text-sm text-slate-400'>잠시만 기다려주세요.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className='relative min-h-screen overflow-hidden text-slate-100' style={pageBackground}>
        <div className='relative z-10 flex min-h-screen items-center justify-center px-4'>
          <div className='w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8'>
            <div className='text-center'>
              <div className='mb-4 text-5xl'>✅</div>
              <p className='text-lg font-semibold text-green-400'>팀 초대 수락 완료!</p>
              <p className='mt-2 text-sm text-slate-400'>팀 페이지로 이동합니다...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='relative min-h-screen overflow-hidden text-slate-100' style={pageBackground}>
        <div className='relative z-10 flex min-h-screen items-center justify-center px-4'>
          <div className='w-full max-w-md rounded-3xl border border-red-500/20 bg-red-900/50 p-8'>
            <div className='text-center'>
              <div className='mb-4 text-5xl'>❌</div>
              <p className='text-lg font-semibold text-red-400'>팀 초대 수락 실패</p>
              <p className='mt-2 text-sm text-slate-300'>{error}</p>
              <button
                onClick={() => router.push('/teams')}
                className='mt-6 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10'
              >
                팀 목록으로 돌아가기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className='relative min-h-screen overflow-hidden text-slate-100' style={pageBackground}>
          <div className='relative z-10 flex min-h-screen items-center justify-center px-4'>
            <div className='w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8'>
              <div className='text-center'>
                <p className='text-slate-400'>로딩 중...</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <InviteAcceptContent />
    </Suspense>
  );
}
