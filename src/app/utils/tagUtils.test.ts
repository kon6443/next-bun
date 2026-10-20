import { describe, it, expect } from 'vitest';
import {
  applyTagOrder,
  filterByTags,
  findTagByName,
  getContrastRatio,
  getNextTagColor,
  getTagChipStyle,
  normalizeHexColor,
  resolveTaskTags,
  validateTagName,
  RECOMMENDED_TAG_COLORS,
} from './tagUtils';
import { applyAllFilters } from './taskUtils';
import type { Task, TaskTag, TeamTag } from '../types/task';

const tag = (tagId: number, tagName = `태그${tagId}`, tagColor = '#38BDF8'): TaskTag => ({ tagId, tagName, tagColor });
const teamTag = (tagId: number, sortOrder: number, tagName = `태그${tagId}`, tagColor = '#38BDF8'): TeamTag => ({
  tagId,
  tagName,
  tagColor,
  sortOrder,
  taskCount: 0,
});

function makeTask(taskId: number, tags: TaskTag[]): Task {
  return {
    taskId,
    teamId: 1,
    taskName: `T${taskId}`,
    taskDescription: '',
    taskStatus: 1,
    actStatus: 1,
    startAt: null,
    endAt: null,
    completedAt: null,
    crtdAt: new Date(2026, 9, 1),
    crtdBy: 1,
    userName: 'U',
    tags,
  };
}

describe('tagUtils', () => {
  describe('validateTagName', () => {
    it('앞뒤 공백을 뺀 1~20자만 허용한다', () => {
      expect(validateTagName('   ')).not.toBeNull();
      expect(validateTagName('  버그  ')).toBeNull();
      expect(validateTagName('가'.repeat(20))).toBeNull();
      expect(validateTagName(` ${'가'.repeat(20)} `)).toBeNull();
      expect(validateTagName('가'.repeat(21))).not.toBeNull();
    });
  });

  describe('findTagByName', () => {
    const tags = [tag(1, 'Bug'), tag(2, '디자인')];

    it('앞뒤 공백·대소문자를 무시하고 같은 이름을 찾는다', () => {
      expect(findTagByName(tags, '  bug ')?.tagId).toBe(1);
      expect(findTagByName(tags, '디자인')?.tagId).toBe(2);
      expect(findTagByName(tags, 'bugs')).toBeUndefined();
    });

    it('수정 중인 자기 자신은 중복으로 보지 않는다', () => {
      expect(findTagByName(tags, 'BUG', 1)).toBeUndefined();
      expect(findTagByName(tags, 'BUG', 2)?.tagId).toBe(1);
    });
  });

  describe('normalizeHexColor', () => {
    it('#RRGGBB 대문자로 맞춘다 (서버 저장 형식)', () => {
      expect(normalizeHexColor('#38bdf8')).toBe('#38BDF8');
      expect(normalizeHexColor('38bdf8')).toBe('#38BDF8');
      expect(normalizeHexColor('#abc')).toBe('#AABBCC');
    });

    it('형식이 틀리면 null', () => {
      expect(normalizeHexColor('#38bdf')).toBeNull();
      expect(normalizeHexColor('#38bdf8ff')).toBeNull();
      expect(normalizeHexColor('blue')).toBeNull();
    });
  });

  describe('getNextTagColor', () => {
    it('추천 색을 순환한다', () => {
      expect(getNextTagColor(0)).toBe(RECOMMENDED_TAG_COLORS[0]);
      expect(getNextTagColor(4)).toBe(RECOMMENDED_TAG_COLORS[4]);
      expect(getNextTagColor(5)).toBe(RECOMMENDED_TAG_COLORS[0]);
    });
  });

  describe('getTagChipStyle', () => {
    it('다크 카드 위에서 읽히는 색은 글자도 그 색으로 쓴다', () => {
      expect(getTagChipStyle('#38BDF8').color).toBe('#38BDF8');
    });

    it('어두운 색은 대비가 부족하므로 밝은 글자로 바꾼다', () => {
      const style = getTagChipStyle('#1E3A8A');
      expect(style.color).not.toBe('#1E3A8A');
      expect(getContrastRatio(style.color, '#0F172A')).toBeGreaterThanOrEqual(4.5);
    });

    it('추천 색 5개는 모두 원색 글자로 읽힌다', () => {
      for (const color of RECOMMENDED_TAG_COLORS) {
        expect(getTagChipStyle(color).color).toBe(color);
      }
    });
  });

  describe('resolveTaskTags', () => {
    const teamTags = [teamTag(3, 1, '새이름', '#F87171'), teamTag(1, 2), teamTag(2, 3)];

    it('팀 태그 순서·현재 이름/색을 따르고 삭제된 태그는 뺀다', () => {
      const resolved = resolveTaskTags([tag(1), tag(3, '옛이름'), tag(99)], teamTags);
      expect(resolved.map(t => t.tagId)).toEqual([3, 1]);
      expect(resolved[0]).toMatchObject({ tagName: '새이름', tagColor: '#F87171' });
    });

    it('팀 태그를 아직 못 받았으면 태스크 응답을 그대로 쓴다', () => {
      expect(resolveTaskTags([tag(1), tag(99)], null).map(t => t.tagId)).toEqual([1, 99]);
    });
  });

  describe('filterByTags (OR)', () => {
    const tasks = [makeTask(1, [tag(1)]), makeTask(2, [tag(2), tag(3)]), makeTask(3, [])];

    it('고른 태그가 없으면 전부', () => {
      expect(filterByTags(tasks, [])).toEqual(tasks);
    });

    it('고른 태그 중 하나라도 붙은 태스크만', () => {
      expect(filterByTags(tasks, [1, 3]).map(t => t.taskId)).toEqual([1, 2]);
      expect(filterByTags(tasks, [99]).map(t => t.taskId)).toEqual([]);
    });

    it('applyAllFilters의 태그 인자는 생략할 수 있고, 주면 다른 필터와 AND로 겹친다', () => {
      expect(applyAllFilters(tasks, '', null, 'all', 'all')).toEqual(tasks);
      expect(applyAllFilters(tasks, 'T2', null, 'all', 'all', [1, 3]).map(t => t.taskId)).toEqual([2]);
    });
  });

  describe('검색에 태그 이름 포함', () => {
    const tasks = [makeTask(1, [tag(1, '버그')]), makeTask(2, [tag(2, '디자인')]), makeTask(3, [])];

    it('태그 이름으로도 찾는다 (대소문자 무시)', () => {
      expect(applyAllFilters(tasks, '버그', null, 'all', 'all').map(t => t.taskId)).toEqual([1]);
    });

    it('팀 태그 목록을 주면 칩에 보이는 현재 이름으로 찾고, 삭제된 태그 이름으로는 찾지 않는다', () => {
      const teamTags = [teamTag(1, 1, 'Bug'), teamTag(3, 2, '기타')]; // 1은 이름이 바뀌었고 2는 삭제됐다
      const search = (query: string) => applyAllFilters(tasks, query, null, 'all', 'all', [], teamTags).map(t => t.taskId);
      expect(search('bug')).toEqual([1]);
      expect(search('버그')).toEqual([]);
      expect(search('디자인')).toEqual([]);
    });
  });

  describe('applyTagOrder', () => {
    it('tagIds 순서로 정렬하고 목록에 없는 태그는 뒤에 둔다', () => {
      const tags = [teamTag(1, 1), teamTag(2, 2), teamTag(3, 3), teamTag(4, 4)];
      expect(applyTagOrder(tags, [3, 1, 2]).map(t => t.tagId)).toEqual([3, 1, 2, 4]);
    });
  });
});
