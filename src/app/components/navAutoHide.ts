/**
 * 하단 내비 자동 숨김 판정(ui-bnb-autohide) — 아이폰 Safari 툴바처럼
 * - 아래로 HIDE_THRESHOLD px 이상 이어서 내리면 숨는다(조금씩 흔들리는 스크롤로는 숨지 않게 같은 방향으로 쌓인 거리)
 * - 위로 SHOW_THRESHOLD px만 올려도 다시 보인다
 * - 맨 위(바운스로 음수 포함)·맨 아래(바운스로 넘친 것 포함)에서는 늘 보인다 — 맨 아래 내용(내비를 피하려 둔 여백 위)을 가리지 않게
 * - 스크롤할 거리가 MIN_SCROLL_RANGE보다 짧은 화면은 늘 보인다 — 숨자마자 맨 아래에 닿아 다시 나오는 깜빡임이 없게
 * DOM 없이 숫자만 받는다(useNavAutoHide가 스크롤마다 넣는다)
 */

export const HIDE_THRESHOLD = 10;
export const SHOW_THRESHOLD = 2;
/** 맨 아래 판정 여유(px) — 소수 px·주소창 높이 변화로 딱 맞지 않아도 맨 아래로 본다 */
const BOTTOM_SLACK = 2;
/** 이보다 짧게만 스크롤되는 화면은 숨기지 않는다(내비 높이 + 문턱 정도) */
export const MIN_SCROLL_RANGE = 120;

export type ScrollSample = {
  /** window.scrollY — iOS 바운스면 음수·문서 끝보다 클 수 있다 */
  y: number;
  /** 보이는 높이(innerHeight) */
  viewport: number;
  /** 문서 높이(scrollHeight) */
  document: number;
};

export type NavAutoHide = {
  /** 스크롤 한 번 — 숨김 여부를 돌려준다 */
  update: (sample: ScrollSample) => boolean;
  /**
   * 크기 바뀜(키보드·주소창·회전)·경로 이동 직후 — 아래로 간 이동량은 세지 않고 기준점만 지금 위치로 옮긴다(키보드가 입력칸을 밀어 올리는 스크롤·스크롤 복원 점프로 숨지 않게)
   * 위로 올린 것(SHOW_THRESHOLD 이상)과 맨 위·맨 아래·짧은 화면은 보인다 — 모바일은 위로 끌면 주소창이 펴지며 resize가 나는데 그 올림을 버리지 않게. 숨김 여부를 돌려준다
   */
  settle: (sample: ScrollSample) => boolean;
  readonly hidden: boolean;
};

export function createNavAutoHide(): NavAutoHide {
  let lastY: number | null = null;
  /** 같은 방향으로 쌓인 거리 — 아래 +, 위 − */
  let travel = 0;
  let hidden = false;

  /** 끝(맨 위·맨 아래)·짧은 화면이면 보이고 기준점을 범위 안으로 — 처리했으면 true */
  const pinAtEdge = ({ y, viewport, document }: ScrollSample): boolean => {
    const atTop = y <= 0;
    const atBottom = y + viewport >= document - BOTTOM_SLACK;
    if (!atTop && !atBottom && document - viewport >= MIN_SCROLL_RANGE) return false;
    hidden = false;
    travel = 0;
    lastY = Math.max(0, Math.min(y, Math.max(0, document - viewport)));
    return true;
  };

  return {
    update(sample) {
      if (pinAtEdge(sample)) return hidden;
      const { y } = sample;
      if (lastY === null) {
        lastY = y;
        return hidden;
      }
      const delta = y - lastY;
      lastY = y;
      if (delta === 0) return hidden;
      // 방향이 바뀌면 다시 센다
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      if (travel >= HIDE_THRESHOLD) hidden = true;
      else if (travel <= -SHOW_THRESHOLD) hidden = false;
      return hidden;
    },
    settle(sample) {
      if (pinAtEdge(sample)) return hidden;
      if (lastY !== null && sample.y - lastY <= -SHOW_THRESHOLD) hidden = false;
      lastY = sample.y;
      travel = 0;
      return hidden;
    },
    get hidden() {
      return hidden;
    },
  };
}
