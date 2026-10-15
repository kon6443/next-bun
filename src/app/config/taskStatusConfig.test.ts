import { describe, it, expect } from 'vitest';
import {
  TASK_STATUS,
  STATUS_TO_COLUMN,
  COLUMN_TO_STATUS,
  getStatusMeta,
  getStatusLabel,
  getStatusTextColor,
  getWorkflowStatuses,
  getAllStatuses,
  type TaskStatusKey,
  type ColumnKey,
} from './taskStatusConfig';

const STATUS_KEYS = Object.keys(TASK_STATUS).map(Number) as TaskStatusKey[];

describe('상태 ↔ 칸반 컬럼 매핑', () => {
  it('모든 상태가 컬럼으로 갔다가 같은 상태로 돌아온다', () => {
    for (const key of STATUS_KEYS) {
      expect(COLUMN_TO_STATUS[STATUS_TO_COLUMN[key]]).toBe(key);
    }
  });

  it('모든 컬럼이 상태로 갔다가 같은 컬럼으로 돌아온다 (1:1)', () => {
    for (const column of Object.keys(COLUMN_TO_STATUS) as ColumnKey[]) {
      expect(STATUS_TO_COLUMN[COLUMN_TO_STATUS[column]]).toBe(column);
    }
    expect(Object.keys(COLUMN_TO_STATUS)).toHaveLength(STATUS_KEYS.length);
  });

  it('메타의 key가 레코드 키와 일치한다', () => {
    for (const key of STATUS_KEYS) {
      expect(TASK_STATUS[key].key).toBe(key);
    }
  });
});

describe('getStatusMeta 폴백', () => {
  it.each([0, 6, -1, NaN, 1.5])('미정의 키 %s는 1(Ideation)로 폴백한다', key => {
    expect(getStatusMeta(key)).toBe(TASK_STATUS[1]);
    expect(getStatusLabel(key)).toBe(TASK_STATUS[1].label);
  });

  it('정의된 키는 자기 메타를 반환한다', () => {
    expect(getStatusMeta(3).name).toBe('COMPLETED');
  });
});

describe('getStatusTextColor', () => {
  it('배지 클래스의 text 색상 계열을 400으로 뽑는다', () => {
    expect(getStatusTextColor(1)).toBe('text-yellow-400');
    expect(getStatusTextColor(5)).toBe('text-red-400');
  });
});

describe('상태 목록', () => {
  it('order 오름차순이고 중복 order가 없다', () => {
    const orders = getAllStatuses().map(s => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('워크플로우 상태는 isWorkflow인 것만', () => {
    expect(getWorkflowStatuses().every(s => s.isWorkflow)).toBe(true);
  });
});
