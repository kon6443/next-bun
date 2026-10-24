/**
 * 소리 시작 신호 (games-polish P8) — 공통 소리 모달이 켜는 클릭 안에서 각 게임의 오디오를 깨운다
 * Safari·iOS는 사용자 제스처 핸들러 안에서(같은 호출 스택에서) AudioContext를 만들거나 resume해야 소리를 낸다
 * 모달은 게임의 플레이어를 모르므로, 화면에 있는 플레이어가 여기 등록해 두고 모달이 unlockSounds()로 한꺼번에 부른다
 * 각 콜백은 지금 설정(getSoundSettings)을 보고 켜진 것만 깨운다
 */
const unlockers = new Set<() => void>();

/** 등록 — 돌려준 함수로 해제(화면을 떠날 때) */
export function registerSoundUnlock(unlock: () => void): () => void {
  unlockers.add(unlock);
  return () => {
    unlockers.delete(unlock);
  };
}

/** 제스처 핸들러 안에서 부른다 — 하나가 던져도 나머지는 깨운다 */
export function unlockSounds(): void {
  for (const unlock of unlockers) {
    try {
      unlock();
    } catch {
      // 오디오를 막은 기기 — 소리 없이 계속
    }
  }
}
