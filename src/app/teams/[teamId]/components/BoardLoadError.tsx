'use client';

import { Button, ButtonLink } from '@/app/teams/components';
import { cardStyles } from '@/styles/teams';
import LoginButton from '../../LoginButton';

type BoardLoadErrorProps = {
  message: string;
  /** 로그인 토큰이 없어 못 불러왔다 — 다시 시도해도 같으니 로그인을 안내한다 */
  isAuthRequired: boolean;
  /** false면(예: 주소의 팀 ID가 숫자가 아님) 다시 해도 같으니 팀 목록으로 안내한다 */
  canRetry?: boolean;
  onRetry: () => void;
};

/**
 * 팀 보드를 불러오지 못했을 때 빈 보드 대신 보여주는 안내
 * 빈 칸반은 "태스크가 없다"로 읽히므로 오류를 분명히 알리고 다음 행동(다시 시도·로그인)을 준다
 */
export function BoardLoadError({ message, isAuthRequired, canRetry = true, onRetry }: BoardLoadErrorProps) {
  if (isAuthRequired) {
    return (
      <section className={`${cardStyles.errorSection} p-6 text-center`} role="alert">
        <p className="text-base font-semibold text-red-300">로그인이 필요합니다</p>
        <p className="mt-2 text-sm text-slate-300">로그인하면 이 팀의 태스크를 볼 수 있어요.</p>
        <LoginButton variant="primary" className="mt-4 min-h-11">
          로그인하기
        </LoginButton>
      </section>
    );
  }

  return (
    <section className={`${cardStyles.errorSection} p-6 text-center`} role="alert">
      <p className="text-base font-semibold text-red-300">태스크 목록을 불러오지 못했습니다</p>
      <p className="mt-2 text-sm text-slate-300 break-words">{message}</p>
      {canRetry ? (
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          다시 시도
        </Button>
      ) : (
        <ButtonLink href="/teams" variant="secondary" className="mt-4">
          팀 목록으로
        </ButtonLink>
      )}
    </section>
  );
}
