/**
 * 포신 각도 규칙 (순수) — 엔진 각도는 0°(오른쪽)~180°(왼쪽) 하나지만, 조작은 원작처럼 "바라보는 쪽 + 높이"로 한다
 * 올리기는 90°(수직) 쪽으로, 내리기는 바라보는 쪽 수평으로. 반대쪽으로 이동하려 하면 먼저 돌아선다(높이는 그대로)
 */

export type Facing = 1 | -1;

/** 각도가 가리키는 쪽 — 수직(90°)이면 이전에 바라보던 쪽 */
export function facingOf(angle: number, fallback: Facing): Facing {
  if (angle < 90) return 1;
  if (angle > 90) return -1;
  return fallback;
}

/** 높이를 delta만큼 — 0°(수평)~90°(수직) 사이에서, 바라보는 쪽은 그대로 */
export function elevate(angle: number, facing: Facing, delta: number): number {
  const height = facing === 1 ? angle : 180 - angle;
  const next = Math.max(0, Math.min(90, height + delta));
  return facing === 1 ? next : 180 - next;
}

/** 돌아서기 — 높이를 지킨 채 좌우를 뒤집는다 */
export function turnAround(angle: number): number {
  return 180 - angle;
}

/** 턴 첫 조준 기본값 — 가까운 적 쪽으로 60° */
export function defaultAngleToward(fromX: number, enemyX: number | null): number {
  return enemyX !== null && enemyX < fromX ? 120 : 60;
}

/** 화면 표기 — 높이(0°~90°)와 방향. 엔진 각도(0~180)는 서버 계약 그대로 두고 보여 주기만 원작처럼 */
export type AngleView = { height: number; dir: Facing | 0; arrow: string; word: string };

/** facing을 주면 수직(90°)에서도 그 쪽을 보인다(조준 중) — 없으면(지난 발) 수직은 방향 없음 */
export function angleView(angle: number, facing?: Facing): AngleView {
  const dir: Facing | 0 = angle === 90 ? (facing ?? 0) : facingOf(angle, 1);
  const height = angle <= 90 ? angle : 180 - angle;
  return { height, dir, arrow: dir === 1 ? "▶" : dir === -1 ? "◀" : "", word: dir === 1 ? "오른쪽" : dir === -1 ? "왼쪽" : "수직" };
}

/** 낭독용 — "오른쪽 60도" · "수직 90도" */
export function angleSpeech(angle: number, facing?: Facing): string {
  const v = angleView(angle, facing);
  return `${v.word} ${v.height}도`;
}
