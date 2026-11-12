// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ApiError } from '@/types/api';
import type { TeamUserResponse } from '@/services/teamService';

const updateMyTeamNickname = vi.fn();
vi.mock('@/services/teamService', () => ({
  updateMyTeamNickname: (...args: unknown[]) => updateMyTeamNickname(...args),
}));
const toastSuccess = vi.fn();
vi.mock('react-hot-toast', () => ({ default: { success: (...args: unknown[]) => toastSuccess(...args) } }));

import { useMyTeamNickname } from './useMyTeamNickname';

const me: TeamUserResponse = {
  userId: 7,
  userName: '옛이름',
  teamNickname: '옛이름',
  role: 'MEMBER',
  joinedAt: new Date(),
  userActStatus: 1,
};

function setup(overrides: Partial<Parameters<typeof useMyTeamNickname>[0]> = {}) {
  const onApplied = vi.fn();
  const hook = renderHook(() =>
    useMyTeamNickname({ teamId: 3, accessToken: 'tok', accountUserName: '계정', myMember: me, onApplied, ...overrides }),
  );
  return { ...hook, onApplied };
}

beforeEach(() => {
  updateMyTeamNickname.mockReset();
  toastSuccess.mockReset();
});

describe('useMyTeamNickname', () => {
  it('편집 자격: 활성 멤버 + 로그인일 때만', () => {
    expect(setup().result.current.canEdit).toBe(true);
    expect(setup({ myMember: { ...me, userActStatus: 0 } }).result.current.canEdit).toBe(false);
    expect(setup({ myMember: undefined }).result.current.canEdit).toBe(false);
    expect(setup({ accessToken: undefined }).result.current.canEdit).toBe(false);
  });

  it('현재 이름은 teamNickname ?? userName', () => {
    expect(setup({ myMember: { ...me, teamNickname: null, userName: '표시이름' } }).result.current.currentName).toBe('표시이름');
  });

  it('검증 실패·변경 없음은 요청하지 않는다 (길이·바이트 기준은 teamNicknameUtils)', async () => {
    const { result } = setup();
    await expect(result.current.submit('   ')).resolves.toEqual({ ok: false, message: '팀 닉네임을 입력해주세요.' });
    await expect(result.current.submit('❤️'.repeat(20))).resolves.toMatchObject({ ok: false });
    await expect(result.current.submit(' 옛이름 ')).resolves.toEqual({ ok: true });
    expect(updateMyTeamNickname).not.toHaveBeenCalled();
  });

  it('저장: 공백 뺀 값으로 PUT → 응답 반영 → 토스트 1회, 저장 중 표시', async () => {
    let resolve!: (v: unknown) => void;
    updateMyTeamNickname.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result, onApplied } = setup();

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.submit('  새이름 ');
    });
    expect(result.current.isSaving).toBe(true);
    expect(updateMyTeamNickname).toHaveBeenCalledWith(3, '새이름', 'tok');

    const data = { teamId: 3, userId: 7, teamNickname: '새이름', userName: '새이름' };
    await act(async () => {
      resolve({ code: 'SUCCESS', message: '', data });
      await pending;
    });
    await expect(pending).resolves.toEqual({ ok: true });
    expect(onApplied).toHaveBeenCalledWith(data);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.isSaving).toBe(false);
  });

  it('실패는 던지지 않고 한국어 안내를 돌려준다 (403)', async () => {
    updateMyTeamNickname.mockRejectedValue(new ApiError('TEAM_FORBIDDEN', 'forbidden', 403));
    const { result, onApplied } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit('새이름');
    });
    expect(outcome).toEqual({ ok: false, message: '활성 멤버만 팀 닉네임을 바꿀 수 있습니다.' });
    expect(onApplied).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('두 진입점이 연달아 제출해도 요청은 하나', async () => {
    let resolve!: (v: unknown) => void;
    updateMyTeamNickname.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = setup();

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.submit('가');
      second = result.current.submit('나');
    });
    await expect(second).resolves.toMatchObject({ ok: false });
    expect(updateMyTeamNickname).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ code: 'SUCCESS', message: '', data: { teamId: 3, userId: 7, teamNickname: '가', userName: '가' } });
      await first;
    });
  });
});
