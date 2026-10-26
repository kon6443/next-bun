import '@testing-library/jest-dom';

/**
 * ResizeObserver 공용 대역 — jsdom에는 없다(캔버스·칸반이 크기 측정에 쓴다)
 * 예전에는 테스트 파일마다 beforeEach stubGlobal·afterEach unstubAllGlobals로 걸고 풀었다. 디펜스 RankedPlay.test가 전체 실행 중 한 번
 * "ResizeObserver is not defined"로 실패했는데 원인은 확정하지 못했다(재현 실패) — 대역이 풀리는 구간 자체를 없애는 방어적 정리로 여기에 한 번 둔다
 * 파일이 stubGlobal로 다른 대역을 걸어도 unstubAllGlobals는 이 값으로 되돌린다(미정의로 돌아가지 않는다)
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
