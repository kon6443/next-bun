/**
 * 다음 발 전 카메라 대기 (순수, D-024) — AI 발사·리플레이 자동 재생은 다음 발을 미리 안다
 * 카메라가 그 발을 컷 없이 따라갈 수 있는 자리(useBattleView.cameraReadyFor)에 오면 바로, 늦어도 CAMERA_WAIT_MAX_MS 뒤에는 쏜다
 * 사람 차례(입력·타이머)는 기다리지 않는다. 움직임 줄이기 설정이면 카메라가 늘 컷이라 cameraReadyFor가 곧바로 준비됨을 돌려준다
 */

/** 카메라를 기다리는 최대 시간(ms) — 이보다 늦으면 그냥 쏜다(그때는 비행 시작에 한 번 컷) */
export const CAMERA_WAIT_MAX_MS = 1000;
/** 기다리는 동안 다시 확인하는 간격(ms) */
export const CAMERA_WAIT_POLL_MS = 50;

/** 쏠 때가 됐나 — 카메라가 준비됐거나 상한만큼 기다렸으면 */
export function cameraWaitDone(waitedMs: number, ready: boolean): boolean {
  return ready || waitedMs >= CAMERA_WAIT_MAX_MS;
}
