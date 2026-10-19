import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getArchiveDaysLeft, getTaskDeadlineInfo, applyAllFilters } from './taskUtils';
import type { Task } from '../types/task';

// taskUtils.test.ts 에서 다루지 않는 함수: 아카이브 남은 일수, 마감 정보 통합, 필터 조합
// 날짜는 DST 전환이 없는 구간(2026-10-15 ~ 10-24)의 로컬 생성자로 만든다 — 실행 환경 TZ와 무관

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 20, 10, 0); // 2026-10-20(화) 10:00 로컬

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: 1,
    teamId: 1,
    taskName: 'T',
    taskDescription: '',
    taskStatus: 2,
    actStatus: 1,
    startAt: null,
    endAt: null,
    completedAt: null,
    crtdAt: new Date(2026, 9, 1),
    crtdBy: 1,
    userName: 'U',
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getArchiveDaysLeft', () => {
  const completedAgo = (ms: number, taskStatus = 3) =>
    makeTask({ taskStatus, completedAt: new Date(NOW.getTime() - ms) });

  it('방금 완료하면 14일', () => {
    expect(getArchiveDaysLeft(completedAgo(0))).toBe(14);
  });

  it('남은 시간이 하루 미만이어도 1일로 올림', () => {
    expect(getArchiveDaysLeft(completedAgo(13.5 * DAY_MS))).toBe(1);
  });

  it('정확히 14일이 지나면 0, 그 이후에도 음수가 아니라 0', () => {
    expect(getArchiveDaysLeft(completedAgo(14 * DAY_MS))).toBe(0);
    expect(getArchiveDaysLeft(completedAgo(30 * DAY_MS))).toBe(0);
  });

  it('취소 상태도 아카이브 대상', () => {
    expect(getArchiveDaysLeft(completedAgo(DAY_MS, 5))).toBe(13);
  });

  it('완료·취소가 아니면 completedAt이 있어도 null', () => {
    expect(getArchiveDaysLeft(completedAgo(DAY_MS, 2))).toBeNull();
    expect(getArchiveDaysLeft(completedAgo(DAY_MS, 4))).toBeNull();
  });

  it('completedAt이 없으면 null', () => {
    expect(getArchiveDaysLeft(makeTask({ taskStatus: 3, completedAt: null }))).toBeNull();
  });

  it('completedAt이 ISO 문자열(직렬화된 응답)이어도 계산한다', () => {
    const iso = new Date(NOW.getTime() - DAY_MS).toISOString() as unknown as Date;
    expect(getArchiveDaysLeft(makeTask({ taskStatus: 3, completedAt: iso }))).toBe(13);
  });
});

describe('getTaskDeadlineInfo', () => {
  it('마감이 지난 진행 중 태스크: overdue + "N일 지남" + 알림', () => {
    expect(getTaskDeadlineInfo(makeTask({ endAt: new Date(2026, 9, 18, 23, 59) }))).toEqual({
      status: 'overdue',
      label: '2일 지남',
      showAlert: true,
    });
  });

  it('오늘 늦은 시각 마감은 today', () => {
    expect(getTaskDeadlineInfo(makeTask({ endAt: new Date(2026, 9, 20, 23, 59) }))).toEqual({
      status: 'today',
      label: '오늘 마감',
      showAlert: true,
    });
  });

  it('오늘 이른 시각(이미 지난 시각) 마감도 날짜 기준이라 today', () => {
    expect(getTaskDeadlineInfo(makeTask({ endAt: new Date(2026, 9, 20, 0, 0) })).status).toBe('today');
  });

  it('D-3까지는 soon, D-4부터 normal(라벨·알림 없음)', () => {
    expect(getTaskDeadlineInfo(makeTask({ endAt: new Date(2026, 9, 23, 0, 0) }))).toEqual({
      status: 'soon',
      label: 'D-3',
      showAlert: true,
    });
    expect(getTaskDeadlineInfo(makeTask({ endAt: new Date(2026, 9, 24, 0, 0) }))).toEqual({
      status: 'normal',
      label: '',
      showAlert: false,
    });
  });

  it('마감일 없으면 none + "마감일 없음", 알림 없음', () => {
    expect(getTaskDeadlineInfo(makeTask({ endAt: null }))).toEqual({
      status: 'none',
      label: '마감일 없음',
      showAlert: false,
    });
  });

  it('완료·취소 태스크는 마감이 지나도 경고하지 않는다', () => {
    const past = new Date(2026, 9, 15);
    for (const taskStatus of [3, 5]) {
      expect(getTaskDeadlineInfo(makeTask({ taskStatus, endAt: past }))).toEqual({
        status: 'normal',
        label: '',
        showAlert: false,
      });
    }
  });

  it('보류(4)는 종료 상태가 아니라 경고 대상', () => {
    expect(getTaskDeadlineInfo(makeTask({ taskStatus: 4, endAt: new Date(2026, 9, 15) })).showAlert).toBe(true);
  });
});

describe('applyAllFilters', () => {
  const todayMine = makeTask({ taskId: 1, taskName: '로그인 수정', crtdBy: 1, taskStatus: 2, endAt: new Date(2026, 9, 20, 18) });
  const todayOther = makeTask({ taskId: 2, taskName: '로그인 화면', crtdBy: 2, taskStatus: 2, endAt: new Date(2026, 9, 20, 18) });
  const todayMineDone = makeTask({ taskId: 3, taskName: '로그인 테스트', crtdBy: 1, taskStatus: 3, endAt: new Date(2026, 9, 20, 18) });
  const tomorrowMine = makeTask({ taskId: 4, taskName: '로그인 배포', crtdBy: 1, taskStatus: 2, endAt: new Date(2026, 9, 21, 18) });
  const otherName = makeTask({ taskId: 5, taskName: '채팅', crtdBy: 1, taskStatus: 2, endAt: new Date(2026, 9, 20, 18) });
  const all = [todayMine, todayOther, todayMineDone, tomorrowMine, otherName];

  it('기본값(빈 검색어·null·all·all)이면 전부 통과', () => {
    expect(applyAllFilters(all, '', null, 'all', 'all')).toEqual(all);
  });

  it('검색어·담당자·기간·상태를 모두 AND로 적용한다', () => {
    expect(applyAllFilters(all, '로그인', 1, 'today', 2)).toEqual([todayMine]);
  });

  it('필터 하나만 바꿔도 나머지 조건은 유지된다', () => {
    expect(applyAllFilters(all, '로그인', 1, 'today', 'all')).toEqual([todayMine, todayMineDone]);
    expect(applyAllFilters(all, '로그인', null, 'today', 2)).toEqual([todayMine, todayOther]);
  });

  it('입력 배열을 변경하지 않는다', () => {
    const copy = [...all];
    applyAllFilters(all, '로그인', 1, 'today', 2);
    expect(all).toEqual(copy);
  });
});
