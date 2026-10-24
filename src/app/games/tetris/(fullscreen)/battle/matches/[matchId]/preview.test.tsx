import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BattleMatch } from '@/services/tetrisBattleService';

const getBattleMatchSummary = vi.fn();
vi.mock('@/services/gameServerService', () => ({ getBattleMatchSummary: (...a: unknown[]) => getBattleMatchSummary(...a) }));
// 폰트는 외부 네트워크 — 테스트에서는 못 받은 경우(ASCII 카드)로 고정
const loadKoreanFont = vi.fn();
vi.mock('@/app/games/_shared/lib/ogFont', () => ({ loadKoreanFont: (...a: unknown[]) => loadKoreanFont(...a) }));

import { generateMetadata } from './page';
import { GET } from '../../../../battle/matches/[matchId]/og/route';
import { absoluteUrl } from '@/app/games/_shared/lib/shareSpec';
import { battleMatchImagePath, buildBattleCard, buildBattleShareContent } from '../../../../battle-ui/lib/battleShare';

const MATCH_ID = 'oFDKsz2Gf-rpDFBa';
const player = (playerId: string, name: string, place: number, kos: number, koReason: BattleMatch['players'][number]['koReason']) => ({
  playerId,
  name,
  place,
  kos,
  sent: 4,
  received: 2,
  pieces: 30,
  maxCombo: 1,
  frames: 1800,
  koReason,
  verdict: 'VERIFIED' as const,
});
const match: BattleMatch = {
  matchId: MATCH_ID,
  roomName: '금요일 대전',
  playerCount: 3,
  startedAt: '2026-10-22T06:52:32.841Z',
  endedAt: '2026-10-22T06:53:38.448Z',
  players: [player('p2', '비', 1, 2, null), player('p1', 'Alice', 2, 0, 'topout'), player('p3', '씨', 3, 0, 'disconnect')],
  disputed: false,
};
const params = (matchId: string) => ({ params: Promise.resolve({ matchId }) });

describe('대전 경기 링크 미리보기 (DESIGN §18)', () => {
  beforeEach(() => {
    getBattleMatchSummary.mockReset();
    loadKoreanFont.mockReset().mockResolvedValue(null);
  });

  it('경기가 있으면 방 이름·우승자 제목, 순위 설명, 고정 og:image, noindex', async () => {
    getBattleMatchSummary.mockResolvedValue(match);
    const meta = await generateMetadata(params(MATCH_ID));
    expect(getBattleMatchSummary).toHaveBeenCalledWith(MATCH_ID);
    expect(meta.title).toBe('금요일 대전 — 비님 우승 | 테트리스 대전');
    expect(meta.description).toContain('3인전 · 우승자 2KO · 1위 비 · 2위 Alice · 3위 씨');
    const og = meta.openGraph as { images: { url: string }[]; url: string; siteName: string };
    expect(og.url).toBe(`/games/tetris/battle/matches/${MATCH_ID}`);
    expect(og.images[0].url).toBe(`/games/tetris/battle/matches/${MATCH_ID}/og`);
    expect(absoluteUrl(battleMatchImagePath(MATCH_ID)).endsWith(og.images[0].url)).toBe(true);
    expect(og.siteName).toBe('FiveSouth');
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('없음·숨김·저장 전(null)이면 일반 대전 메타로 폴백', async () => {
    getBattleMatchSummary.mockResolvedValue(null);
    const meta = await generateMetadata(params(MATCH_ID));
    expect(meta.title).toBe('테트리스 대전 기록');
    expect(meta.alternates).toEqual({ canonical: `/games/tetris/battle/matches/${MATCH_ID}` });
  });

  it('형식이 아닌 matchId는 백엔드에 묻지 않는다', async () => {
    const meta = await generateMetadata(params('../../etc'));
    expect(getBattleMatchSummary).not.toHaveBeenCalled();
    expect(meta.title).toBe('테트리스 대전 기록');
  });

  it('OG 이미지: 경기·폴백 모두 1200×630 PNG (한글 폰트 없이 ASCII 카드), 폰트 없으면 캐시 1분', async () => {
    getBattleMatchSummary.mockResolvedValueOnce(match).mockResolvedValueOnce(null);
    for (const id of [MATCH_ID, 'xxxxxxxxxxxxxxxx']) {
      const res = await GET(new Request('http://x'), params(id));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60');
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(Array.from(bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]); // "PNG"
    }
  }, 30000);

  it('한글 폰트를 받으면 경기 카드 캐시 10분', async () => {
    getBattleMatchSummary.mockResolvedValue(match);
    loadKoreanFont.mockResolvedValueOnce(new Uint8Array(0).buffer);
    const res = await GET(new Request('http://x'), params(MATCH_ID));
    expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=600, stale-while-revalidate=86400');
  });
});

describe('대전 공유 문구', () => {
  it('공유 메뉴·카카오 카드 — 경기 페이지·고정 이미지 절대 URL', () => {
    const content = buildBattleShareContent(match);
    expect(content.url).toBe(absoluteUrl(`/games/tetris/battle/matches/${MATCH_ID}`));
    expect(content.title).toBe('금요일 대전 — 비님 우승');
    expect(content.text).toBe('금요일 대전 — 비님 우승 (3인전 · 우승자 2KO) — 경기 다시 보기');
    expect(content.kakao.imageUrl).toBe(absoluteUrl(`/games/tetris/battle/matches/${MATCH_ID}/og`));
  });

  it('ASCII 카드 — 한글 방 이름은 빼고 한글 이름은 P{순위}', () => {
    const card = buildBattleCard(match, false);
    expect(card.room).toBeNull();
    expect(card.headline).toBe('P1 WINS');
    expect(card.standings).toBe('1. P1 · 2. Alice · 3. P3');
    // 기본 폰트(라틴)로 그릴 수 있게 한글이 없어야 한다 (· 같은 Latin-1 기호는 기존 카드와 같이 허용)
    expect(/[\u3131-\uD79D]/.test(Object.values(card).join(''))).toBe(false);
  });
});
