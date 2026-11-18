/**
 * 기기 배율(devicePixelRatio)만 바뀌면(모니터 이동·확대 비율) 크기 변화가 없어 ResizeObserver가 모른다 —
 * 현재 배율 해상도 질의가 풀리면 onChange를 부르고 새 배율로 다시 건다(games-polish FE-19). 그만 볼 때 쓸 함수를 돌려준다
 * 질의는 실제 배율로 건다 — 백버퍼에 상한(DPR_CAP)을 둬도 다음 변화를 놓치지 않게
 */
export function watchDevicePixelRatio(onChange: () => void): () => void {
  let media: MediaQueryList | null = null;
  const watch = () => {
    media?.removeEventListener("change", onDpr);
    media = typeof window.matchMedia === "function" ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null;
    media?.addEventListener("change", onDpr);
  };
  function onDpr() {
    onChange();
    watch();
  }
  watch();
  return () => media?.removeEventListener("change", onDpr);
}
