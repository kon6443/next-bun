/**
 * 팀 태그 유틸 — 한도·이름 비교·색 정규화·칩 대비·필터
 *
 * 한도와 이름 규칙은 백엔드 검증과 같은 값이다 (bun docs/tasks/team-task-tags D-012·D-014).
 * 이름 길이는 백엔드 @MaxLength와 같은 기준(JS 문자열 length)으로 센다.
 */
import type { Task, TaskTag, TeamTag } from '../types/task';

/** 태그 이름 최대 길이 (앞뒤 공백 제거 후) */
export const TAG_NAME_MAX_LENGTH = 20;
/** 팀당 태그 최대 개수 */
export const TEAM_TAG_LIMIT = 100;
/** 태스크당 태그 최대 개수 */
export const TASK_TAG_LIMIT = 10;

/** 추천 색 5개 — 다크 배경 기준 Tailwind 400 계열 (red·amber·emerald·sky·violet) */
export const RECOMMENDED_TAG_COLORS = ['#F87171', '#FBBF24', '#34D399', '#38BDF8', '#A78BFA'] as const;

/** 새 태그 기본 색 — 추천 색을 순환한다 */
export function getNextTagColor(existingTagCount: number): string {
  return RECOMMENDED_TAG_COLORS[existingTagCount % RECOMMENDED_TAG_COLORS.length];
}

/**
 * 태스크 응답·소켓의 tags를 받는 경계에서 쓴다 — 태그 도입 전 백엔드는 tags를 보내지 않는다.
 * 배포 순서(백엔드 → 프론트)가 잠깐 어긋나도 칩·필터가 터지지 않게 빈 배열로 맞춘다
 */
export function normalizeTaskTags(tags: TaskTag[] | null | undefined): TaskTag[] {
  return tags ?? [];
}

/** 저장 전 이름 정규화 (앞뒤 공백 제거) */
export function normalizeTagName(name: string): string {
  return name.trim();
}

/** 이름 유효성 — 정규화 후 1~20자. 유효하면 null, 아니면 한국어 사유 */
export function validateTagName(name: string): string | null {
  const normalized = normalizeTagName(name);
  if (normalized.length === 0) return '태그 이름을 입력해주세요.';
  if (normalized.length > TAG_NAME_MAX_LENGTH) return `태그 이름은 ${TAG_NAME_MAX_LENGTH}자 이하로 입력해주세요.`;
  return null;
}

/** 같은 이름인지 — 앞뒤 공백·대소문자 무시 (백엔드 UPPER(TAG_NAME) 유니크와 같은 기준) */
export function isSameTagName(a: string, b: string): boolean {
  return normalizeTagName(a).toUpperCase() === normalizeTagName(b).toUpperCase();
}

/** 이름이 같은 태그 찾기. exceptTagId는 자기 자신(수정 중인 태그)을 비교에서 뺀다 */
export function findTagByName<T extends TaskTag>(tags: readonly T[], name: string, exceptTagId?: number): T | undefined {
  return tags.find(tag => tag.tagId !== exceptTagId && isSameTagName(tag.tagName, name));
}

const HEX_6 = /^#?([0-9a-fA-F]{6})$/;
const HEX_3 = /^#?([0-9a-fA-F]{3})$/;

/** '#abc'·'abcdef'·'#AbCdEf' → '#AABBCC' 대문자 6자리. 형식이 틀리면 null */
export function normalizeHexColor(input: string): string | null {
  const value = input.trim();
  const six = HEX_6.exec(value);
  if (six) return `#${six[1].toUpperCase()}`;
  const three = HEX_3.exec(value);
  if (three) {
    const [r, g, b] = three[1].toUpperCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex) ?? '#000000';
  return [1, 3, 5].map(i => parseInt(normalized.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 상대 휘도 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 대비율 (1~21) */
export function getContrastRatio(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** 칩이 놓이는 카드 배경 (slate-900) — 앱은 다크 전용이다 */
const CHIP_SURFACE_COLOR = '#0F172A';
/** 대비가 부족할 때 쓰는 글자색 (slate-100) */
const CHIP_FALLBACK_TEXT_COLOR = '#F1F5F9';
/** 본문 글자 기준 WCAG AA */
const MIN_TEXT_CONTRAST = 4.5;

function toRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 칩 스타일 — 저장 색 배경 20% · 테두리 40% · 글자는 대비 계산
 * 어두운 색(남색·검정 등)은 다크 카드 위에서 글자가 안 읽히므로 밝은 글자로 바꾼다
 */
export function getTagChipStyle(tagColor: string): { backgroundColor: string; borderColor: string; color: string } {
  const readable = getContrastRatio(tagColor, CHIP_SURFACE_COLOR) >= MIN_TEXT_CONTRAST;
  return {
    backgroundColor: toRgba(tagColor, 0.2),
    borderColor: toRgba(tagColor, 0.4),
    color: readable ? (normalizeHexColor(tagColor) ?? CHIP_FALLBACK_TEXT_COLOR) : CHIP_FALLBACK_TEXT_COLOR,
  };
}

/**
 * 태스크 칩으로 보여줄 태그 — 팀 태그 목록 기준으로 다시 맞춘다
 * - 팀 태그 순서·현재 이름/색을 따르고, 삭제된 태그는 뺀다 (태스크 객체를 일일이 고치지 않아도 실시간 반영)
 * - 팀 태그를 아직 못 받았으면(null) 태스크 응답의 tags를 그대로 쓴다
 */
export function resolveTaskTags(taskTags: readonly TaskTag[], teamTags: readonly TeamTag[] | null): TaskTag[] {
  if (!teamTags) return [...taskTags];
  const attached = new Set(taskTags.map(tag => tag.tagId));
  return teamTags.filter(tag => attached.has(tag.tagId));
}

/** 태그 필터 (OR) — 고른 태그 중 하나라도 붙은 태스크. 고른 태그가 없으면 전부 */
export function filterByTags(tasks: Task[], tagIds: readonly number[]): Task[] {
  if (tagIds.length === 0) return tasks;
  const selected = new Set(tagIds);
  return tasks.filter(task => task.tags.some(tag => selected.has(tag.tagId)));
}

/** tagIds 순서대로 다시 정렬 — tagIds에 없는 태그는 기존 순서대로 뒤에 둔다 */
export function applyTagOrder<T extends TaskTag>(tags: readonly T[], tagIds: readonly number[]): T[] {
  const rank = new Map(tagIds.map((id, index) => [id, index]));
  return tags
    .map((tag, index) => ({ tag, key: rank.get(tag.tagId) ?? tagIds.length + index }))
    .sort((a, b) => a.key - b.key)
    .map(({ tag }) => tag);
}
