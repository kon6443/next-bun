/**
 * 내 스킨 장착 상태(D-003) — 계정에 저장된다. 게스트는 늘 기본, 로그인하면 GET /users/me/skins로 불러온다
 * 화면 여러 곳(설정 모달·도감·내 판·화면 바탕)이 같은 값을 보도록 모듈 저장소 + useSyncExternalStore(useMySkins)
 * 장착 변경은 낙관적으로 먼저 반영하고, 응답·실패는 그 슬롯에만 반영한다(다른 슬롯을 연달아 바꿔도 서로 덮지 않게)
 * 같은 슬롯의 PUT은 한 번에 하나만 보낸다 — 진행 중에 또 고르면 마지막 선택만 기다렸다 보낸다(중간 선택은 보내지 않는다)
 *   보낸 순서 = 서버 저장 순서 = 응답 순서라, 마지막 응답이 곧 서버 최종값이다(응답 순서가 뒤바뀌어 어긋나는 일이 없다)
 * 슬롯마다 서버가 확정한 값(confirmed)을 따로 둔다 — 그 슬롯에 보낼 것이 없어지면 확정값을 보인다(실패하면 저장된 적 없는 값이 남지 않게)
 * 세대(generation) — 로그아웃·다른 토큰으로 다시 불러오면 바뀐다. 이전 세대의 응답·실패는 반영하지도 알리지도 않는다
 *   (같은 계정으로 다시 로그인한 직후 이전 세대 PUT이 늦게 저장되면 화면과 어긋날 수 있다 — 토큰 갱신이 없어 재로그인 때만 생기는 좁은 경우라 받아들인다)
 * 레벨·포인트(skin-levels) — 아이템 레벨은 카탈로그 항목(level·nextCost)이 SSOT, 장착 레벨(levels)은 장착 id로 카탈로그에서 찾는다(낙관적 장착도 바로 그 레벨로 그리게)
 *   강화는 잔액을 함께 쓰니 계정 전체에서 한 번에 하나만(upgrading) — 응답(GET과 같은 모양)으로 카탈로그·포인트를 바꾼다. 장착은 장착 PUT이 맡아 건드리지 않는다
 *   장착 PUT·강화·다시 맞추기 응답은 서로 순서가 뒤바뀔 수 있다 — 늦게 온 옛 응답이 강화 결과를 되돌리지 않게 합친다(mergeServerData)
 *     레벨은 내려가지 않는다 → 아이템마다 높은 레벨(과 그 nextCost) · 적립(earned)·소비(spent)는 줄지 않는다 → 각각 큰 값, 잔액은 max(0, earned − spent)로 다시 계산
 */

import { getMySkins, type SkinCatalogItem, type SkinSlotName, updateMySkins, upgradeMySkin as requestUpgrade } from '@/services/userService';
import { isAuthExpired } from '@/app/games/_shared/lib/submitError';
import { ApiError } from '@/types/api';
import type { SkinPoints } from '@/types/game';
import {
  DEFAULT_EQUIPPED_SKINS,
  DEFAULT_EQUIPPED_SKIN_LEVELS,
  type EquippedSkinLevels,
  type EquippedSkins,
  MAX_SKIN_LEVEL,
  toEquippedSkins,
  toSkinLevel,
} from './skins';

export type SkinCatalog = Record<SkinSlotName, SkinCatalogItem[]>;

export type MySkinsState = {
  /**
   * guest = 로그인 안 함(늘 기본) · loading = 불러오는 중(기본으로 그린다) · ready
   * error = 불러오기 실패(기본으로 그린다) · expired = 로그인 만료 401(불러오기 만료면 기본으로, 장착 중 만료면 확정된 장착 그대로 그린다 — 다시 로그인하면 불러온다)
   */
  status: 'guest' | 'loading' | 'ready' | 'error' | 'expired';
  equipped: EquippedSkins;
  catalog: SkinCatalog | null;
  /** 장착 아이템의 레벨 — 장착 id로 카탈로그에서 찾는다(setState가 맞춘다). 카탈로그가 없으면 Lv1 */
  levels: EquippedSkinLevels;
  /** 내 포인트 — ready가 아니거나 이 필드 배포 전 서버면 null */
  points: SkinPoints | null;
  /** 강화 요청이 진행 중 — 다른 강화 버튼도 막는다(잔액을 함께 쓴다) */
  upgrading: boolean;
};

export const GUEST_SKINS_STATE: MySkinsState = {
  status: 'guest',
  equipped: DEFAULT_EQUIPPED_SKINS,
  catalog: null,
  levels: DEFAULT_EQUIPPED_SKIN_LEVELS,
  points: null,
  upgrading: false,
};

/** 장착 결과를 기다리는 호출부 — true: 이 선택이 저장됐다 · false: 이미 장착·ready 아님(불러오는 중·실패·만료)·더 새 선택에 밀림·세대 교체(알리지 않는다) · reject: 이 선택이 실패했다 */
type Waiter = { resolve: (applied: boolean) => void; reject: (err: unknown) => void };
type Queued = { id: string; accessToken: string; waiters: Waiter[] };

let state: MySkinsState = GUEST_SKINS_STATE;
/** 지금 상태가 어느 토큰으로 불러온 것인지 — 토큰이 바뀌면(다른 계정·재로그인) 다시 불러온다 */
let loadedToken: string | null = null;
let generation = 0;
/**
 * 쓰기 순번 — 강화를 보낼 때·장착·강화 응답을 반영할 때 올린다. 다시 맞추는 GET(refreshServerData)은 보낼 때 값을 잡아 두고,
 * 응답이 왔을 때 바뀌었으면(그 사이 강화·장착이 있었다 — GET이 그 전 스냅샷일 수 있다) 통째로 바꾸지 않고 합친다(mergeServerData)
 */
let writeSeq = 0;
/** 슬롯별 서버 확정 장착 — 불러오기·장착 성공 때 갱신 */
let confirmed: EquippedSkins = DEFAULT_EQUIPPED_SKINS;
/** 슬롯별 진행 중 PUT 여부와, 그 뒤에 보낼 마지막 선택 */
const inflight: Record<SkinSlotName, boolean> = { block: false, effect: false, board: false, background: false };
const queued: Record<SkinSlotName, Queued | null> = { block: null, effect: null, board: null, background: null };
const listeners = new Set<() => void>();

/** 세대가 바뀔 때 — 진행 중 표시를 지우고 기다리던 선택은 알리지 않고 끝낸다(이전 세대의 진행 중 PUT 결과는 send가 버린다) */
function clearSlots(): void {
  for (const slot of Object.keys(inflight) as SkinSlotName[]) {
    inflight[slot] = false;
    queued[slot]?.waiters.forEach((w) => w.resolve(false));
    queued[slot] = null;
  }
}

/** 카탈로그에서 그 슬롯·아이템의 레벨(없으면 1) */
export function itemLevel(catalog: SkinCatalog | null, slot: SkinSlotName, id: string): number {
  return toSkinLevel(catalog?.[slot].find((item) => item.id === id)?.level);
}

function levelsOf(equipped: EquippedSkins, catalog: SkinCatalog | null): EquippedSkinLevels {
  return {
    block: itemLevel(catalog, 'block', equipped.block),
    effect: itemLevel(catalog, 'effect', equipped.effect),
    board: itemLevel(catalog, 'board', equipped.board),
    background: itemLevel(catalog, 'background', equipped.background),
  };
}

/** 장착 레벨은 장착·카탈로그에서 다시 계산한다 — 같은 값이면 같은 객체(구독하는 판이 다시 그릴 이유가 없게) */
function setState(next: Omit<MySkinsState, 'levels'> & { levels?: EquippedSkinLevels }): void {
  const levels = levelsOf(next.equipped, next.catalog);
  const same = (Object.keys(levels) as SkinSlotName[]).every((slot) => levels[slot] === state.levels[slot]);
  state = { ...next, levels: same ? state.levels : levels };
  for (const listener of listeners) listener();
}

export function subscribeMySkins(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMySkinsState(): MySkinsState {
  return state;
}

export function getServerMySkinsState(): MySkinsState {
  return GUEST_SKINS_STATE;
}

function normalizePoints(value: unknown): SkinPoints | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0);
  return { balance: num(raw.balance), earned: num(raw.earned), spent: num(raw.spent) };
}

/** 아이템마다 레벨이 높은 쪽(같으면 새 응답) — 보유·새 아이템은 새 응답을 따른다 */
function mergeCatalog(current: SkinCatalog | null, incoming: SkinCatalog): SkinCatalog {
  if (!current) return incoming;
  const merge = (slot: SkinSlotName) =>
    incoming[slot].map((item) => {
      const known = current[slot].find((x) => x.id === item.id);
      return known && toSkinLevel(known.level) > toSkinLevel(item.level) ? { ...item, level: known.level, nextCost: known.nextCost } : item;
    });
  return { block: merge('block'), effect: merge('effect'), board: merge('board'), background: merge('background') };
}

/** 적립·소비는 각각 큰 값(줄지 않는다), 잔액은 서버 정의 그대로 max(0, earned − spent) — 순서가 엇갈린 옛 응답이 적립·차감을 되돌리지 않게 */
function mergePoints(current: SkinPoints | null, incoming: SkinPoints): SkinPoints {
  if (!current) return incoming;
  const earned = Math.max(current.earned, incoming.earned);
  const spent = Math.max(current.spent, incoming.spent);
  return { earned, spent, balance: Math.max(0, earned - spent) };
}

/** GET·PUT·강화 응답의 카탈로그·포인트를 지금 상태에 합친다(장착·상태는 건드리지 않는다) */
function mergeServerData(data: unknown): Partial<Pick<MySkinsState, 'catalog' | 'points'>> {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const catalog = normalizeCatalog(raw.catalog);
  const points = normalizePoints(raw.points);
  return {
    ...(catalog ? { catalog: mergeCatalog(state.catalog, catalog) } : {}),
    ...(points ? { points: mergePoints(state.points, points) } : {}),
  };
}

function normalizeCatalog(value: unknown): SkinCatalog | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const slot = (name: SkinSlotName) => (Array.isArray(raw[name]) ? (raw[name] as SkinCatalogItem[]) : []);
  return { block: slot('block'), effect: slot('effect'), board: slot('board'), background: slot('background') };
}

/** 로그아웃·게스트 — 기본으로 */
export function resetMySkins(): void {
  generation++;
  loadedToken = null;
  confirmed = DEFAULT_EQUIPPED_SKINS;
  clearSlots();
  if (state !== GUEST_SKINS_STATE) {
    state = GUEST_SKINS_STATE;
    for (const listener of listeners) listener();
  }
}

/** 이 토큰으로 아직 안 불러왔으면 불러온다(같은 토큰은 한 번만 — 화면마다 다시 부르지 않게. 만료 401도 같은 토큰으로는 다시 부르지 않는다) */
export async function loadMySkins(accessToken: string): Promise<void> {
  if (loadedToken === accessToken) return;
  loadedToken = accessToken;
  const mine = ++generation;
  confirmed = DEFAULT_EQUIPPED_SKINS;
  clearSlots();
  // 다른 계정·새 토큰 — 이전 장착을 남기지 않고 기본으로 그리며 기다린다
  setState({ status: 'loading', equipped: DEFAULT_EQUIPPED_SKINS, catalog: null, points: null, upgrading: false });
  try {
    const { data } = await getMySkins(accessToken);
    if (mine !== generation) return;
    confirmed = toEquippedSkins(data?.equipped);
    setState({ status: 'ready', equipped: confirmed, catalog: normalizeCatalog(data?.catalog), points: normalizePoints(data?.points), upgrading: false });
  } catch (err) {
    if (mine !== generation) return;
    const expired = isAuthExpired(err);
    // 일시 실패면 다음 화면 진입 때 다시 시도하게 — 만료는 다시 로그인해 토큰이 바뀔 때까지 같은 결과라 기억한다
    if (!expired) loadedToken = null;
    setState({ status: expired ? 'expired' : 'error', equipped: DEFAULT_EQUIPPED_SKINS, catalog: null, points: null, upgrading: false });
  }
}

/** 일시 실패(error) 뒤 다시 불러오기 — 같은 토큰이어도 다시 부른다 */
export function retryMySkins(accessToken: string): Promise<void> {
  if (loadedToken === accessToken) loadedToken = null;
  return loadMySkins(accessToken);
}

/** 한 슬롯 PUT — 끝나면 기다리던 다음 선택을 보내거나, 보낼 것이 없으면 확정값을 보인다 */
async function send(slot: SkinSlotName, choice: Queued, gen: number): Promise<void> {
  inflight[slot] = true;
  let error: unknown = null;
  try {
    const { data } = await updateMySkins({ [slot]: choice.id }, choice.accessToken);
    if (gen !== generation) return choice.waiters.forEach((w) => w.resolve(false));
    confirmed = { ...confirmed, [slot]: toEquippedSkins(data?.equipped)[slot] };
    const merged = mergeServerData(data);
    writeSeq++;
    if (merged.catalog || merged.points) setState({ ...state, ...merged });
  } catch (err) {
    if (gen !== generation) return choice.waiters.forEach((w) => w.resolve(false));
    error = err;
  }
  inflight[slot] = false;
  const expired = error !== null && isAuthExpired(error);
  // 다른 슬롯에서 이미 만료됐으면 같은 토큰으로 다시 보내도 401 — 기다리던 선택은 보내지 않는다
  const stop = expired || state.status === 'expired';
  const after = queued[slot];
  queued[slot] = null;
  if (after && !stop) {
    // 더 새 선택이 기다린다 — 이 선택은 밀렸다(성공·실패 모두 알리지 않는다), 화면은 그 선택 그대로
    choice.waiters.forEach((w) => w.resolve(false));
    void send(slot, after, gen);
    return;
  }
  // 보낼 것이 없다(또는 만료라 보내도 같다) — 확정값을 보인다
  setState({ ...state, ...(expired ? { status: 'expired' as const } : {}), equipped: { ...state.equipped, [slot]: confirmed[slot] } });
  if (after && expired) {
    // 이 슬롯이 만료라 기다리던 선택을 보내지 않는다 — 실패는 마지막 선택 하나로만 알린다(토스트 한 번), 밀린 앞 선택은 조용히
    after.waiters.forEach((w) => w.reject(error));
    choice.waiters.forEach((w) => w.resolve(false));
    return;
  }
  // 다른 슬롯 만료로 보내지 않은 대기 선택은 조용히(만료 안내는 이미 그 슬롯에서) — 이 선택은 자기 결과대로
  after?.waiters.forEach((w) => w.resolve(false));
  if (error !== null) choice.waiters.forEach((w) => w.reject(error));
  else choice.waiters.forEach((w) => w.resolve(true));
}

/**
 * 한 슬롯 장착 — 낙관적 반영 후 PUT(같은 슬롯은 하나씩). true면 이 선택이 저장됐다, false면 이미 장착·ready 아님·더 새 선택·세대 교체로 밀렸다(알리지 않는다)
 * 이 선택이 실패하면 서버 확정값으로 돌아가고 에러를 다시 던진다(호출부가 토스트)
 */
export function equipMySkin(slot: SkinSlotName, id: string, accessToken: string): Promise<boolean> {
  // 불러온 뒤(ready)에만 — 불러오는 중이면 늦은 GET이 장착을 덮고, 만료·실패면 보유를 모른다(다른 슬롯에서 만료가 났어도 더 보내지 않는다)
  if (state.status !== 'ready' || state.equipped[slot] === id) return Promise.resolve(false);
  setState({ ...state, equipped: { ...state.equipped, [slot]: id } });
  return new Promise<boolean>((resolve, reject) => {
    const choice: Queued = { id, accessToken, waiters: [{ resolve, reject }] };
    if (inflight[slot]) {
      // 진행 중 — 기다리던 이전 선택은 보내지 않고 밀어낸다
      queued[slot]?.waiters.forEach((w) => w.resolve(false));
      queued[slot] = choice;
      return;
    }
    void send(slot, choice, generation);
  });
}

/** 강화 결과 — upgraded: 이 요청으로 올랐다(또는 이미 그 레벨이라 차감 없이 200) · skipped: 보낼 수 없다(ready 아님·강화 중·만렙·미보유) */
export type UpgradeResult = 'upgraded' | 'skipped';

/**
 * 한 아이템을 다음 레벨로 강화 — 계정 전체에서 한 번에 하나(upgrading). 실패하면 에러를 다시 던진다(호출부가 토스트)
 * 409 USER_SKIN_LEVEL_MISMATCH(다른 탭에서 이미 올렸다 등)는 카탈로그·포인트만 서버 값으로 다시 맞춘다(세대·장착은 그대로 — 진행 중 장착을 버리거나 화면이 기본으로 깜빡이지 않게)
 * USER_POINTS_INSUFFICIENT는 details.balance로 잔액을 바로 고치고 서버 값으로 다시 맞춘다
 */
export async function upgradeMySkin(slot: SkinSlotName, id: string, accessToken: string): Promise<UpgradeResult> {
  if (state.status !== 'ready' || state.upgrading) return 'skipped';
  const item = state.catalog?.[slot].find((x) => x.id === id);
  const current = toSkinLevel(item?.level);
  if (!item?.owned || current >= MAX_SKIN_LEVEL) return 'skipped';
  const mine = generation;
  writeSeq++;
  setState({ ...state, upgrading: true });
  try {
    const { data } = await requestUpgrade({ slot, skinId: id, level: current + 1 }, accessToken);
    if (mine !== generation) return 'skipped';
    writeSeq++;
    setState({ ...state, upgrading: false, ...mergeServerData(data) });
    return 'upgraded';
  } catch (err) {
    if (mine !== generation) return 'skipped';
    if (isAuthExpired(err)) {
      setState({ ...state, status: 'expired', upgrading: false });
    } else if (err instanceof ApiError && err.code === 'USER_POINTS_INSUFFICIENT') {
      const details = (err.details ?? {}) as Record<string, unknown>;
      const balance = typeof details.balance === 'number' ? Math.max(0, details.balance) : null;
      setState({ ...state, upgrading: false, points: state.points && balance !== null ? { ...state.points, balance } : state.points });
      // 잔액만 고치면 적립·소비와 어긋난다(다음 합치기가 옛 잔액으로 다시 계산) — 서버 값으로 다시 맞춘다
      void refreshServerData(accessToken, mine);
    } else {
      setState({ ...state, upgrading: false });
      // 레벨이 서버와 어긋났다(다른 탭·기기에서 강화) — 서버 값으로 다시 맞춘다
      if (err instanceof ApiError && err.code === 'USER_SKIN_LEVEL_MISMATCH') void refreshServerData(accessToken, mine);
    }
    throw err;
  }
}

/**
 * 카탈로그·포인트만 서버 값으로 다시 맞춘다(세대·장착은 그대로)
 * 보낸 뒤 강화·장착이 없었으면 서버 값을 그대로 쓴다(레벨이 서버에서 내려가도 따라간다). 있었으면 이 GET이 그 전 스냅샷일 수 있어 합친다(mergeServerData)
 * 실패하면 그대로 둔다(다음 불러오기·응답에서 맞춰진다)
 */
async function refreshServerData(accessToken: string, gen: number): Promise<void> {
  const sentAt = writeSeq;
  try {
    const { data } = await getMySkins(accessToken);
    if (gen !== generation || state.status !== 'ready') return;
    if (writeSeq !== sentAt || state.upgrading) {
      setState({ ...state, ...mergeServerData(data) });
      return;
    }
    const catalog = normalizeCatalog(data?.catalog);
    const points = normalizePoints(data?.points);
    // 이 값이 기준이 됐다 — 이보다 먼저 보낸 다시 맞추기 GET이 늦게 오면 통째로 바꾸지 않고 합치게(옛 스냅샷이 새 값을 덮지 않게)
    writeSeq++;
    setState({ ...state, ...(catalog ? { catalog } : {}), ...(points ? { points } : {}) });
  } catch {
    // 조용히 — 화면은 직전 값 그대로
  }
}

/**
 * 점수 등록 뒤(skin-levels) — 응답에 포인트가 있으면(기록 주인이 있는 테트리스) 내 카탈로그·포인트를 서버에서 다시 맞춘다
 * 등록 응답의 잔액을 그대로 쓰거나 적립만큼 더하지 않는다 — 장착·강화 응답과 순서가 엇갈리면 적립이 사라지거나 두 번 더해지고,
 * 보관 기록을 다른 계정으로 다시 낸 경우 지금 계정 잔액에 더하게 된다. 결과 화면의 "+N P · 보유"는 등록 응답 값을 그대로 보인다
 */
export function syncPointsAfterScore(points: { earned: number; balance: number } | null | undefined): void {
  if (!points || state.status !== 'ready' || !loadedToken) return;
  void refreshServerData(loadedToken, generation);
}

/** 테스트용 */
export function __resetMySkinsForTests(): void {
  generation++;
  loadedToken = null;
  confirmed = DEFAULT_EQUIPPED_SKINS;
  clearSlots();
  state = GUEST_SKINS_STATE;
  listeners.clear();
}
