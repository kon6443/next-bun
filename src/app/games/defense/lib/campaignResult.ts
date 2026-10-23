import { type Difficulty, starsFor } from './campaign';
import { LOCAL_REPLAY_VERSION, saveLocalReplayIfBest } from './localReplay';
import { loadProgress, recordStars, saveProgress } from './progress';

/**
 * 캠페인 판이 끝났을 때 — 별 계산 · 진행 저장(이겼을 때) · 다시보기 저장(그 스테이지 최고면)
 * 화면(DefensePlay)과 분리해 단위 테스트한다. 저장 실패(사파리 비공개 모드·용량)는 progressSaved=false로 알려 화면이 안내한다
 */

export type CampaignOutcome = { stars: number; progressSaved: boolean; replaySaved: boolean };

type Finished = {
  stageId: string;
  difficulty: Difficulty;
  boardKey: string;
  seed: number;
  engineVersion: number;
  victory: boolean;
  livesLeft: number;
  endTick: number;
  inputs: number[];
};

export function settleCampaign(game: Finished, now = Date.now()): CampaignOutcome {
  if (!game.victory) return { stars: 0, progressSaved: true, replaySaved: false };
  const stars = starsFor(game.livesLeft);
  const before = loadProgress();
  const after = recordStars(before, game.stageId, game.difficulty, stars);
  // 별이 오르지 않았으면 쓸 것이 없다 — 이전 저장이 그대로 유효
  const progressSaved = after === before || saveProgress(after);
  const replaySaved = saveLocalReplayIfBest(game.stageId, {
    v: LOCAL_REPLAY_VERSION,
    engineVersion: game.engineVersion,
    boardKey: game.boardKey,
    difficulty: game.difficulty,
    seed: game.seed,
    ticks: game.endTick,
    inputs: game.inputs,
    stars,
    livesLeft: game.livesLeft,
    savedAt: now,
  });
  return { stars, progressSaved, replaySaved };
}
