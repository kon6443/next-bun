'use client';

import { useMemo } from 'react';

type UseTeamIdResult = {
  teamIdNum: number;
  isValid: boolean;
  error: string | null;
};

/**
 * teamId 문자열을 숫자로 파싱하는 훅
 * 유효성 검증을 포함하여 재사용 가능하게 추상화
 *
 * @param teamId - 문자열 형태의 팀 ID
 */
export function useTeamId(teamId: string): UseTeamIdResult {
  return useMemo(() => {
    const teamIdNum = parseInt(teamId, 10);
    const isValid = !isNaN(teamIdNum) && teamIdNum > 0;

    return {
      teamIdNum: isValid ? teamIdNum : 0,
      isValid,
      error: isValid ? null : '유효하지 않은 팀 ID입니다.',
    };
  }, [teamId]);
}

/**
 * teamId와 taskId를 동시에 파싱하는 훅
 *
 * @param teamId - 문자열 형태의 팀 ID
 * @param taskId - 문자열 형태의 태스크 ID
 */
export function useTeamTaskId(
  teamId: string,
  taskId: string,
): {
  teamIdNum: number;
  taskIdNum: number;
  isValid: boolean;
  error: string | null;
} {
  return useMemo(() => {
    const teamIdNum = parseInt(teamId, 10);
    const taskIdNum = parseInt(taskId, 10);
    const isTeamValid = !isNaN(teamIdNum) && teamIdNum > 0;
    const isTaskValid = !isNaN(taskIdNum) && taskIdNum > 0;
    const isValid = isTeamValid && isTaskValid;

    let error: string | null = null;
    if (!isTeamValid) {
      error = '유효하지 않은 팀 ID입니다.';
    } else if (!isTaskValid) {
      error = '유효하지 않은 태스크 ID입니다.';
    }

    return {
      teamIdNum: isTeamValid ? teamIdNum : 0,
      taskIdNum: isTaskValid ? taskIdNum : 0,
      isValid,
      error,
    };
  }, [teamId, taskId]);
}
