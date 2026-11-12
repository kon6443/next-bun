import { describe, it, expect } from 'vitest';
import { ApiError } from '@/types/api';
import type { TaskDetailResponse } from '@/services/teamService';
import type { TeamChatMessage } from './teamChatUtils';
import {
  validateTeamNickname,
  countTeamNicknameLength,
  getTeamNicknameErrorMessage,
  renameUser,
  renameTaskCreator,
  renameInTaskDetail,
  renameChatSender,
} from './teamNicknameUtils';

describe('validateTeamNickname', () => {
  it('앞뒤 공백을 빼고 1~20자를 받는다', () => {
    expect(validateTeamNickname('  수달  ')).toEqual({ ok: true, value: '수달' });
    expect(validateTeamNickname('가'.repeat(20))).toEqual({ ok: true, value: '가'.repeat(20) });
  });

  it('빈 값·공백만·21자 이상은 거부한다', () => {
    expect(validateTeamNickname('').ok).toBe(false);
    expect(validateTeamNickname('   ').ok).toBe(false);
    expect(validateTeamNickname('가'.repeat(21)).ok).toBe(false);
    // 길이는 공백을 뺀 값으로 잰다
    expect(validateTeamNickname(` ${'가'.repeat(20)} `).ok).toBe(true);
  });
});

describe('countTeamNicknameLength — 백엔드 isLength와 같은 계산', () => {
  it('백엔드 실측 사례와 같다', () => {
    expect(countTeamNicknameLength('😀'.repeat(20))).toBe(20); // UTF-16 40·코드포인트 20
    expect(countTeamNicknameLength('❤️'.repeat(20))).toBe(20); // UTF-16 40·코드포인트 40
    expect(countTeamNicknameLength('👨‍👩‍👧'.repeat(5))).toBe(25);
  });

  it('검증도 같은 결과 — 😀×20·❤️×20 통과, 👨‍👩‍👧×5 거부', () => {
    expect(validateTeamNickname('😀'.repeat(20)).ok).toBe(true); // 80바이트
    expect(validateTeamNickname('👨‍👩‍👧'.repeat(5))).toEqual({ ok: false, message: '팀 닉네임은 20자 이하로 입력해주세요.' });
  });
});

describe('validateTeamNickname — UTF-8 100바이트 상한', () => {
  it('20자 안이라도 100바이트를 넘으면 거부 (❤️×20 = 120바이트)', () => {
    expect(validateTeamNickname('❤️'.repeat(20))).toEqual({
      ok: false,
      message: '팀 닉네임이 너무 깁니다. 이모지·특수문자를 줄여 주세요.',
    });
  });

  it('경계: 한글 20자(60바이트)·😀×20(80바이트)은 통과, 정확히 100바이트도 통과', () => {
    expect(validateTeamNickname('가'.repeat(20)).ok).toBe(true);
    // ❤️ = 6바이트·1자: ❤️×16 + a×4 = 100바이트·20자
    expect(validateTeamNickname(`${'❤️'.repeat(16)}aaaa`).ok).toBe(true);
    // ❤️×17 + a×3 = 105바이트·20자 — 길이는 통과, 바이트에서 거부
    expect(validateTeamNickname(`${'❤️'.repeat(17)}aaa`).ok).toBe(false);
  });
});

describe('getTeamNicknameErrorMessage', () => {
  it('403·422는 코드별 한국어 안내', () => {
    expect(getTeamNicknameErrorMessage(new ApiError('TEAM_FORBIDDEN', 'forbidden', 403))).toContain('활성 멤버');
    expect(getTeamNicknameErrorMessage(new ApiError('VALIDATION_ERROR', 'teamNickname must be...', 422))).toContain('1~20자');
  });

  it('그 밖에는 에러 메시지, 없으면 기본 문구', () => {
    expect(getTeamNicknameErrorMessage(new Error('네트워크 오류'))).toBe('네트워크 오류');
    expect(getTeamNicknameErrorMessage('x')).toBe('팀 닉네임 변경에 실패했습니다.');
  });
});

describe('renameUser', () => {
  const list = [
    { userId: 1, userName: '가' },
    { userId: 2, userName: '나' },
  ];

  it('해당 userId만 바꾼다', () => {
    expect(renameUser(list, 2, '다')).toEqual([
      { userId: 1, userName: '가' },
      { userId: 2, userName: '다' },
    ]);
  });

  it('없거나 이미 같은 이름이면 같은 배열(멱등)', () => {
    expect(renameUser(list, 3, '다')).toBe(list);
    expect(renameUser(list, 2, '나')).toBe(list);
  });
});

describe('renameTaskCreator', () => {
  it('작성자(crtdBy)가 같은 태스크만 바꾼다', () => {
    const tasks = [
      { taskId: 1, crtdBy: 1, userName: '가' },
      { taskId: 2, crtdBy: 2, userName: '나' },
    ];
    expect(renameTaskCreator(tasks, 1, '새이름').map((t) => t.userName)).toEqual(['새이름', '나']);
    expect(renameTaskCreator(tasks, 3, '새이름')).toBe(tasks);
  });
});

describe('renameInTaskDetail', () => {
  const detail = {
    taskId: 1,
    crtdBy: 1,
    userName: '가',
    comments: [
      { commentId: 1, userId: 2, userName: '나' },
      { commentId: 2, userId: 1, userName: '가' },
    ],
  } as unknown as TaskDetailResponse;

  it('작성자와 그 사람의 댓글을 바꾼다', () => {
    const next = renameInTaskDetail(detail, 1, '새이름');
    expect(next.userName).toBe('새이름');
    expect(next.comments.map((c) => c.userName)).toEqual(['나', '새이름']);
  });

  it('댓글 작성자만 해당되면 태스크 작성자는 그대로', () => {
    const next = renameInTaskDetail(detail, 2, '새이름');
    expect(next.userName).toBe('가');
    expect(next.comments[0].userName).toBe('새이름');
  });

  it('해당 없으면 같은 객체', () => {
    expect(renameInTaskDetail(detail, 3, '새이름')).toBe(detail);
  });
});

describe('renameChatSender', () => {
  const msg = (key: string, userId: number, sender: string, isMine = false): TeamChatMessage => ({
    key,
    clientMsgId: key,
    serverId: null,
    userId,
    sender,
    text: '',
    timestamp: 0,
    isMine,
  });

  it('남의 메시지만 바꾸고 내 메시지(나)는 그대로', () => {
    const messages = [msg('a', 2, '나', true), msg('b', 2, '옛이름'), msg('c', 3, '다')];
    const next = renameChatSender(messages, 2, '새이름');
    expect(next.map((m) => m.sender)).toEqual(['나', '새이름', '다']);
  });

  it('해당 없으면 같은 배열', () => {
    const messages = [msg('a', 3, '다')];
    expect(renameChatSender(messages, 2, '새이름')).toBe(messages);
  });
});
