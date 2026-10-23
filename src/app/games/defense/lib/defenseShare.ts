import type { GenericScoreDetail, ScoreSummary } from '@/types/game';
import { formatDurationMs } from '@/app/games/_shared/lib/format';
import { type ReplayCard, isAscii } from '@/app/games/_shared/lib/replayCard';
import type { ReplayShareSpec } from '@/app/games/_shared/lib/shareSpec';
import { formatDefenseScore, splitDefenseScore } from './defenseGame';

/**
 * 디펜스 리플레이 공유 사양 (defense DESIGN §F11·D-019) — 공유 메뉴·카카오 카드·링크 미리보기·OG 이미지 문구
 * 점수 표기는 "웨이브 n · 진척 p%"(사용자 결정 — 결과·랭킹과 같다). 엔진을 import하지 않는다(서버 메타·OG 번들)
 * 카드 글자는 한글·ASCII만(이모지·특수 기호는 외부 글리프 조회 위험 — §F11)
 */

/** "처치 812 · 남은 목숨 3" (detail 키: 백엔드 defense-verify) */
export function defenseShareStatLine(detail: GenericScoreDetail): string {
  const parts: string[] = [];
  if (Number.isFinite(detail.kills)) parts.push(`처치 ${detail.kills}`);
  if (Number.isFinite(detail.livesLeft)) parts.push(`남은 목숨 ${detail.livesLeft}`);
  return parts.length > 0 ? parts.join(' · ') : '타워 디펜스 기록';
}

export function buildDefenseCard(summary: ScoreSummary<GenericScoreDetail> | null, korean: boolean): ReplayCard {
  if (!summary) {
    return {
      eyebrow: 'TOWER DEFENSE',
      name: null,
      score: null,
      scoreUnit: '',
      stats: korean ? '타워를 세워 웨이브를 막는 디펜스 · 랭킹 · 리플레이' : 'Build, defend, and watch replays',
      footer: 'FiveSouth',
    };
  }
  const { wave, progress } = splitDefenseScore(summary.score);
  const percent = Math.floor(progress / 10);
  const time = formatDurationMs(summary.durationMs);
  // 한글 카드와 같이 처치가 없으면 뺀다
  const asciiStats = [Number.isFinite(summary.detail.kills) ? `${summary.detail.kills} KILLS` : null, time].filter(Boolean).join(' · ');
  return {
    eyebrow: korean ? `타워 디펜스 리플레이 · 전체 ${summary.rank}위` : `TOWER DEFENSE REPLAY · #${summary.rank}`,
    name: korean || isAscii(summary.playerName) ? summary.playerName : null,
    score: korean ? `웨이브 ${wave}` : `WAVE ${wave}`,
    scoreUnit: korean ? `진척 ${percent}%` : `${percent}%`,
    stats: korean ? `${defenseShareStatLine(summary.detail)} · ${time}` : asciiStats,
    footer: 'FiveSouth',
  };
}

export const DEFENSE_SHARE: ReplayShareSpec<GenericScoreDetail> = {
  replayPath: (scoreId) => `/games/defense/replays/${scoreId}`,
  imagePath: (scoreId) => `/games/defense/replays/${scoreId}/og`,
  headline: ({ playerName, score }) => `${playerName}님의 타워 디펜스 ${formatDefenseScore(score)}`,
  statLine: defenseShareStatLine,
  metaDescription: (summary) => `${formatDefenseScore(summary.score)} · ${defenseShareStatLine(summary.detail)} · ${formatDurationMs(summary.durationMs)} · 전체 ${summary.rank}위 — 플레이를 그대로 다시 보세요.`,
  card: buildDefenseCard,
  fallback: {
    title: '타워 디펜스 리플레이',
    description: '타워를 세워 웨이브를 막는 디펜스 — 무한 모드·주간 도전 랭킹과 리플레이.',
    cardTitle: 'TOWER DEFENSE',
  },
};
