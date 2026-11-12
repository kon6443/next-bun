/**
 * 경기 화면 그림(D-025 B → 보충 5에서 vivid가 기본) — ?look=classic이면 예전 화면(되돌리기 경로), ?look=glow면 vivid + WebGL 후처리
 * 쿼리가 없거나 모르는 값이면 기본(vivid). 솔로·온라인·리플레이·결과·미리보기가 모두 이 규칙을 따른다
 * ?look=…은 그 탭에 기억한다(LOOK_STORAGE_KEY, sessionStorage) — 쿼리 없는 링크로 옮겨 가도(로비→방, 홈→플레이) 고른 그림이 이어진다
 * 운영상 전체 되돌리기는 DEFAULT_LOOK을 "classic"으로 바꿔 배포하는 것이다(쿼리는 확인·개인용)
 */
export type Look = "classic" | "vivid" | "glow";

export const LOOKS: readonly Look[] = ["classic", "vivid", "glow"];

/** 쿼리가 없을 때의 그림 */
export const DEFAULT_LOOK: Look = "vivid";

export function toLook(value: string | null | undefined): Look {
  return LOOKS.includes(value as Look) ? (value as Look) : DEFAULT_LOOK;
}

export const LOOK_STORAGE_KEY = "fortress:look";

/**
 * 지금 주소의 ?look — 있으면 그 탭에 기억하고, 없으면 그 탭에 기억한 값, 그것도 없으면 기본값. 서버(창 없음)에서는 기본값
 * 저장소를 못 쓰면(사생활 보호 모드 등) 쿼리만 본다
 */
export function lookFromUrl(): Look {
  if (typeof window === "undefined") return DEFAULT_LOOK;
  const query = new URLSearchParams(window.location.search).get("look");
  try {
    if (query !== null) {
      const look = toLook(query);
      window.sessionStorage.setItem(LOOK_STORAGE_KEY, look);
      return look;
    }
    return toLook(window.sessionStorage.getItem(LOOK_STORAGE_KEY));
  } catch {
    return toLook(query);
  }
}

/** vivid 그림(지형·배경·탄·폭발)을 쓰는 시안 — glow는 vivid 캔버스 위에 후처리만 더한다 */
export function usesVivid(look: Look): boolean {
  return look === "vivid" || look === "glow";
}
