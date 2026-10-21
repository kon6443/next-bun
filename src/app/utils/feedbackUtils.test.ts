import { describe, it, expect } from 'vitest';
import { buildFeedbackHref, isFeedbackDraftValid, toBuildSha, toFeedbackPagePath } from './feedbackUtils';
import { getFeedbackCategoryLabel, getFeedbackStatusMeta } from '@/app/config/feedbackConfig';

describe('buildFeedbackHref', () => {
  it('지금 경로를 from으로 인코딩해 붙인다', () => {
    expect(buildFeedbackHref('/teams/3/tasks/7')).toBe('/feedback?from=%2Fteams%2F3%2Ftasks%2F7');
    expect(buildFeedbackHref('/')).toBe('/feedback?from=%2F');
  });

  it('피드백 화면 안이거나 경로가 없으면 붙이지 않는다', () => {
    expect(buildFeedbackHref('/feedback')).toBe('/feedback');
    expect(buildFeedbackHref('/feedback/me')).toBe('/feedback');
    expect(buildFeedbackHref('')).toBe('/feedback');
  });
});

describe('toFeedbackPagePath', () => {
  it('내부 경로는 그대로 쓴다', () => {
    expect(toFeedbackPagePath('/teams/3')).toBe('/teams/3');
    expect(toFeedbackPagePath('/')).toBe('/');
  });

  it('쿼리·해시는 버린다 (초대 토큰 등이 실리지 않게)', () => {
    expect(toFeedbackPagePath('/teams/invite/accept?token=secret')).toBe('/teams/invite/accept');
    expect(toFeedbackPagePath('/fishing#top')).toBe('/fishing');
  });

  it('외부 URL·프로토콜 상대 URL·피드백 화면·과도한 길이·배열·없음은 생략', () => {
    expect(toFeedbackPagePath('https://evil.example')).toBeUndefined();
    expect(toFeedbackPagePath('//evil.example')).toBeUndefined();
    expect(toFeedbackPagePath('/feedback/me')).toBeUndefined();
    expect(toFeedbackPagePath(`/${'a'.repeat(500)}`)).toBeUndefined();
    expect(toFeedbackPagePath(`/${'a'.repeat(499)}`)).toHaveLength(500);
    expect(toFeedbackPagePath(['/a', '/b'])).toBeUndefined();
    expect(toFeedbackPagePath(undefined)).toBeUndefined();
  });
});

describe('toBuildSha', () => {
  it('7~40자 hex만 받는다', () => {
    expect(toBuildSha('ae05efd')).toBe('ae05efd');
    expect(toBuildSha('a'.repeat(40))).toBe('a'.repeat(40));
    expect(toBuildSha('ae05ef')).toBeUndefined();
    expect(toBuildSha('a'.repeat(41))).toBeUndefined();
    expect(toBuildSha('zzzzzzz')).toBeUndefined();
    expect(toBuildSha('')).toBeUndefined();
    expect(toBuildSha(undefined)).toBeUndefined();
  });
});

describe('isFeedbackDraftValid', () => {
  const valid = { category: 'BUG' as const, title: '제목', content: '내용' };

  it('카테고리·제목·내용이 모두 있으면 통과', () => {
    expect(isFeedbackDraftValid(valid)).toBe(true);
  });

  it('카테고리 미선택·공백뿐인 제목/내용은 실패', () => {
    expect(isFeedbackDraftValid({ ...valid, category: null })).toBe(false);
    expect(isFeedbackDraftValid({ ...valid, title: '   ' })).toBe(false);
    expect(isFeedbackDraftValid({ ...valid, content: '\n\n' })).toBe(false);
  });

  it('길이 한도는 trim 후 기준 (제목 100·내용 5000)', () => {
    expect(isFeedbackDraftValid({ ...valid, title: 'a'.repeat(100) })).toBe(true);
    expect(isFeedbackDraftValid({ ...valid, title: 'a'.repeat(101) })).toBe(false);
    expect(isFeedbackDraftValid({ ...valid, title: ` ${'a'.repeat(100)} ` })).toBe(true);
    expect(isFeedbackDraftValid({ ...valid, content: 'a'.repeat(5000) })).toBe(true);
    expect(isFeedbackDraftValid({ ...valid, content: 'a'.repeat(5001) })).toBe(false);
  });
});

describe('feedbackConfig 표시명', () => {
  it('코드 → 표시명', () => {
    expect(getFeedbackCategoryLabel('IMPROVEMENT')).toBe('개선 요청');
    expect(getFeedbackStatusMeta('IN_PROGRESS').label).toBe('검토 중');
  });

  it('모르는 코드는 코드 그대로', () => {
    expect(getFeedbackCategoryLabel('NEW_ONE')).toBe('NEW_ONE');
    expect(getFeedbackStatusMeta('ARCHIVED').label).toBe('ARCHIVED');
  });
});
