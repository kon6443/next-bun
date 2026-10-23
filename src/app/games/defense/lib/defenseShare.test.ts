import { describe, it, expect } from 'vitest';
import { buildShareContent } from '@/app/games/_shared/lib/shareSpec';
import { DEFENSE_SHARE, buildDefenseCard } from './defenseShare';

const summary = { rank: 3, scoreId: 46, playerName: '수비왕', score: 24_523_000, detail: { wave: 24, progress: 523, kills: 812, livesLeft: 2 }, durationMs: 1_880_000, createdAt: '2026-10-22T00:00:00Z' };

describe('디펜스 공유 사양 — 점수는 "웨이브 n · 진척 p%"', () => {
  it('제목·요약·메타 설명', () => {
    expect(DEFENSE_SHARE.headline(summary)).toBe('수비왕님의 타워 디펜스 웨이브 24 · 진척 52%');
    expect(DEFENSE_SHARE.statLine(summary.detail)).toBe('처치 812 · 남은 목숨 2');
    expect(DEFENSE_SHARE.metaDescription(summary)).toBe('웨이브 24 · 진척 52% · 처치 812 · 남은 목숨 2 · 31:20 · 전체 3위 — 플레이를 그대로 다시 보세요.');
  });

  it('공유 내용 — 리플레이 경로·고정 og 경로', () => {
    const content = buildShareContent(DEFENSE_SHARE, summary);
    expect(content.url).toMatch(/\/games\/defense\/replays\/46$/);
    expect(content.kakao.imageUrl).toMatch(/\/games\/defense\/replays\/46\/og$/);
    expect(content.text).toBe('수비왕님의 타워 디펜스 웨이브 24 · 진척 52% (처치 812 · 남은 목숨 2) — 리플레이 보기');
  });

  it('카드 — 한글 판, 폰트 없을 때 ASCII만(한글 이름은 빼고), 기록이 없으면 일반 카드', () => {
    expect(buildDefenseCard(summary, true)).toEqual({ eyebrow: '타워 디펜스 리플레이 · 전체 3위', name: '수비왕', score: '웨이브 24', scoreUnit: '진척 52%', stats: '처치 812 · 남은 목숨 2 · 31:20', footer: 'FiveSouth' });
    const ascii = buildDefenseCard(summary, false);
    expect(ascii.name).toBeNull();
    // 한글 없이(기본 Latin 폰트로 그린다 — 가운뎃점 '·'은 테트리스 카드와 같이 Latin-1)
    for (const text of [ascii.eyebrow, ascii.score ?? '', ascii.scoreUnit, ascii.stats, ascii.footer]) expect(/[가-힣ㄱ-ㅎ]/.test(text)).toBe(false);
    expect(ascii.score).toBe('WAVE 24');
    expect(buildDefenseCard(null, false).eyebrow).toBe('TOWER DEFENSE');
  });
});
