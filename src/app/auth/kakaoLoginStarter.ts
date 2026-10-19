/**
 * 카카오 로그인 시작을 한 번만 보내는 잠금
 *
 * 버튼을 연타하거나 같은 화면의 로그인 버튼 두 개를 연달아 누르면 signIn 이 여러 번 나가
 * next-auth 의 state 쿠키(하나뿐)가 덮어써지고, 먼저 시작한 흐름의 콜백이 OAuthCallback 으로 실패한다.
 * 화면 전환 전까지 두 번째 시작을 무시하고, 시작이 실패해 화면에 남으면 잠금을 푼다.
 */
type StarterDeps = {
  signIn: () => Promise<unknown>;
  /** 시작 시 표시(로딩 오버레이 플래그 등) */
  onStart?: () => void;
  /** 실패하거나 잠금을 풀 때 표시 정리 */
  onReset?: () => void;
};

export function createLoginStarter() {
  let inFlight = false;

  return {
    isInFlight: () => inFlight,

    /**
     * @returns 이번 호출이 실제로 시작했으면 true, 이미 진행 중이라 무시했으면 false
     * @throws signIn 이 실패하면 잠금을 푼 뒤 그대로 던진다 (호출부가 사용자에게 알린다)
     */
    async start({ signIn, onStart, onReset }: StarterDeps): Promise<boolean> {
      if (inFlight) return false;
      inFlight = true;
      onStart?.();
      try {
        await signIn();
        // 성공하면 카카오로 화면이 넘어간다 — 잠금은 페이지와 함께 사라진다
        return true;
      } catch (error) {
        inFlight = false;
        onReset?.();
        throw error;
      }
    },

    /** 뒤로가기로 페이지가 bfcache 에서 복원되는 등, 화면에 남게 됐을 때 잠금을 푼다 */
    reset(onReset?: () => void) {
      inFlight = false;
      onReset?.();
    },
  };
}
