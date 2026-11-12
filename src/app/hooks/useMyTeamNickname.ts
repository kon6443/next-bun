'use client';

import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { updateMyTeamNickname, type TeamNicknameData, type TeamUserResponse } from '@/services/teamService';
import { getTeamNicknameErrorMessage, validateTeamNickname } from '@/app/utils/teamNicknameUtils';

export type TeamNicknameSubmitResult = { ok: true } | { ok: false; message: string };

/** 모든 진입점(헤더 칩·온라인 목록·멤버 카드)이 같이 쓰는 "이 팀에서 내 이름" 상태와 저장 */
export type MyTeamNickname = {
  /** 활성 멤버이고 로그인돼 있을 때만 true — false면 진입점을 그리지 않는다 */
  canEdit: boolean;
  /** 이 팀에서 지금 쓰는 내 이름 (팀 닉네임 ?? 표시 이름) — 편집 초깃값 */
  currentName: string;
  /** 계정 닉네임 — 입력 칸 안내용 */
  accountUserName?: string;
  /** 어느 진입점에서든 저장 중이면 true (모든 폼이 같이 잠긴다) */
  isSaving: boolean;
  /** 검증 → 저장 → 응답 반영 → 성공 토스트. 값이 그대로면 요청 없이 ok. 실패는 안내 문구로 돌려준다(던지지 않는다) */
  submit: (raw: string) => Promise<TeamNicknameSubmitResult>;
};

type UseMyTeamNicknameOptions = {
  teamId: number;
  accessToken?: string;
  accountUserName?: string;
  /** 팀 멤버 목록 중 내 행 */
  myMember?: TeamUserResponse;
  /** 저장 응답 반영 — 소켓 memberNicknameChanged와 같은 반영 함수를 넘긴다(멱등) */
  onApplied: (data: TeamNicknameData) => void;
};

export function useMyTeamNickname({
  teamId,
  accessToken,
  accountUserName,
  myMember,
  onApplied,
}: UseMyTeamNicknameOptions): MyTeamNickname {
  const [isSaving, setIsSaving] = useState(false);
  // 같은 렌더 안에서 두 진입점이 연달아 제출해도 요청은 하나만 (state는 다음 렌더에야 보인다)
  const inFlightRef = useRef(false);

  const canEdit = Boolean(accessToken && myMember && myMember.userActStatus === 1);
  const currentName = myMember ? (myMember.teamNickname ?? myMember.userName ?? '') : '';

  const submit = useCallback(
    async (raw: string): Promise<TeamNicknameSubmitResult> => {
      const result = validateTeamNickname(raw);
      if (!result.ok) return result;
      if (result.value === currentName) return { ok: true };
      if (!accessToken) return { ok: false, message: '로그인이 필요합니다.' };
      if (inFlightRef.current) return { ok: false, message: '저장 중이에요. 잠시 후 다시 시도해주세요.' };

      inFlightRef.current = true;
      setIsSaving(true);
      try {
        const response = await updateMyTeamNickname(teamId, result.value, accessToken);
        onApplied(response.data);
        toast.success('팀 닉네임을 저장했습니다.');
        return { ok: true };
      } catch (err) {
        return { ok: false, message: getTeamNicknameErrorMessage(err) };
      } finally {
        inFlightRef.current = false;
        setIsSaving(false);
      }
    },
    [accessToken, currentName, onApplied, teamId],
  );

  return { canEdit, currentName, accountUserName, isSaving, submit };
}
