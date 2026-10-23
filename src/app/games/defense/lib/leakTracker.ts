import { EVENT, EVENT_STRIDE, type GameState } from '../engine';

/**
 * 누수 집계 (§F0-3 실패 원인 — 가장 많이 샌 적·웨이브) — 렌더 이벤트에서 모은다(판 상태·해시와 무관)
 * 누수 이벤트 때 그 적은 이미 배열에서 빠져 있어, 스폰 때 [종류, 웨이브]를 적어 둔다
 * 플레이 루프(useDefensePlay)와 이어하기 다시 돌리기(restoreGame)가 같은 집계를 쓴다 — 이어한 판도 처음부터의 원인이 남는다
 */
export class LeakTracker {
  private readonly spawned = new Map<number, [number, number]>();
  readonly byEnemy: number[] = [];
  readonly byWave: number[] = [];

  /** 한 틱의 이벤트 — state는 그 틱을 마친 상태(새 적은 배열 끝에 있다) */
  onEvents(events: readonly number[], state: GameState): void {
    for (let i = 0; i < events.length; i += EVENT_STRIDE) {
      const type = events[i];
      const id = events[i + 1];
      if (type === EVENT.SPAWN) {
        let wave = 0;
        for (let k = state.enemies.length - 1; k >= 0; k--) {
          if (state.enemies[k].id === id) {
            wave = state.enemies[k].wave;
            break;
          }
        }
        this.spawned.set(id, [events[i + 2], wave]);
      } else if (type === EVENT.LEAK) {
        const spawned = this.spawned.get(id);
        if (!spawned) continue;
        this.byEnemy[spawned[0]] = (this.byEnemy[spawned[0]] ?? 0) + events[i + 2];
        this.byWave[spawned[1]] = (this.byWave[spawned[1]] ?? 0) + events[i + 2];
        this.spawned.delete(id);
      } else if (type === EVENT.DEATH) {
        this.spawned.delete(id);
      }
    }
  }

  /** 가장 많이 샌 웨이브 (1부터, 없으면 0) */
  worstWave(): number {
    let worst = 0;
    for (let w = 1; w < this.byWave.length; w++) if ((this.byWave[w] ?? 0) > (this.byWave[worst] ?? 0)) worst = w;
    return (this.byWave[worst] ?? 0) > 0 ? worst : 0;
  }
}
