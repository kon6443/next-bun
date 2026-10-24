import type { SoundCue } from '../../lib/effects';
import { REPLAY_BIG_CUES_ONLY_SPEED, replayCues } from '../../lib/sound/soundPlayer';

/**
 * 대전 다시보기 연출 규칙 (games-polish P7) — 소리는 판 하나만, 공격 궤적은 보이는 판 사이에만
 * 실시간 대전(useAttackTrails·useBattlePlay)은 그대로 — 여기는 재생기 전용
 */

/** 빠른 배속에서 궤적을 그릴 최소 줄 수 — 작은 공격까지 날리면 화면이 어지럽다 */
export const FAST_ATTACK_TRAIL_MIN_LINES = 4;

/** 소리를 낼 판 — 크게 보는 판, 없으면 1위 판 */
export function soundBoardId(players: readonly { playerId: string; place: number }[], focusedId: string | null): string | null {
  return focusedId ?? players.find((p) => p.place === 1)?.playerId ?? null;
}

/** 소리 판의 신호 — 탈락은 어느 판이든 ko로 따로 울리므로 gameOver는 뺀다. 빠른 배속은 큰 사건만 */
export function boardCues(cues: readonly SoundCue[], speed: number): readonly SoundCue[] {
  return replayCues(
    cues.filter((cue) => cue.kind !== 'gameOver'),
    speed,
  );
}

/**
 * 받은 가비지에 공격 궤적을 그릴지 — 보낸 사람을 알고(garbageFrom이 생긴 뒤 경기), 두 판이 다 보이고(크게 보기 중이면 "+N"만),
 * 빠른 배속이면 큰 공격만. 연출 줄이기는 useAttackTrails가 거른다
 */
export function shouldFireAttack(from: string | null, to: string, lines: number, speed: number, focusedId: string | null): from is string {
  if (from === null || lines <= 0) return false;
  if (focusedId !== null && (focusedId !== from || focusedId !== to)) return false;
  return speed < REPLAY_BIG_CUES_ONLY_SPEED || lines >= FAST_ATTACK_TRAIL_MIN_LINES;
}
