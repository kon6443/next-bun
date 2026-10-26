/**
 * 내 스킨 장착 상태(D-003) — 계정에 저장된다. 게스트는 늘 기본, 로그인하면 GET /users/me/skins로 불러온다
 * 화면 여러 곳(설정 모달·도감·내 판·화면 바탕)이 같은 값을 보도록 모듈 저장소 + useSyncExternalStore(useMySkins)
 * 장착 변경은 낙관적으로 먼저 반영하고, 응답·실패는 그 슬롯에만 반영한다(다른 슬롯을 연달아 바꿔도 서로 덮지 않게)
 * 같은 슬롯의 PUT은 한 번에 하나만 보낸다 — 진행 중에 또 고르면 마지막 선택만 기다렸다 보낸다(중간 선택은 보내지 않는다)
 *   보낸 순서 = 서버 저장 순서 = 응답 순서라, 마지막 응답이 곧 서버 최종값이다(응답 순서가 뒤바뀌어 어긋나는 일이 없다)
 * 슬롯마다 서버가 확정한 값(confirmed)을 따로 둔다 — 그 슬롯에 보낼 것이 없어지면 확정값을 보인다(실패하면 저장된 적 없는 값이 남지 않게)
 * 세대(generation) — 로그아웃·다른 토큰으로 다시 불러오면 바뀐다. 이전 세대의 응답·실패는 반영하지도 알리지도 않는다
 *   (같은 계정으로 다시 로그인한 직후 이전 세대 PUT이 늦게 저장되면 화면과 어긋날 수 있다 — 토큰 갱신이 없어 재로그인 때만 생기는 좁은 경우라 받아들인다)
 */

import { getMySkins, type SkinCatalogItem, type SkinSlotName, updateMySkins } from '@/services/userService';
import { isAuthExpired } from '@/app/games/_shared/lib/submitError';
import { DEFAULT_EQUIPPED_SKINS, type EquippedSkins, toEquippedSkins } from './skins';

export type SkinCatalog = Record<SkinSlotName, SkinCatalogItem[]>;

export type MySkinsState = {
  /**
   * guest = 로그인 안 함(늘 기본) · loading = 불러오는 중(기본으로 그린다) · ready
   * error = 불러오기 실패(기본으로 그린다) · expired = 로그인 만료 401(불러오기 만료면 기본으로, 장착 중 만료면 확정된 장착 그대로 그린다 — 다시 로그인하면 불러온다)
   */
  status: 'guest' | 'loading' | 'ready' | 'error' | 'expired';
  equipped: EquippedSkins;
  catalog: SkinCatalog | null;
};

export const GUEST_SKINS_STATE: MySkinsState = { status: 'guest', equipped: DEFAULT_EQUIPPED_SKINS, catalog: null };

/** 장착 결과를 기다리는 호출부 — true: 이 선택이 저장됐다 · false: 더 새 선택에 밀렸거나 세대가 바뀌었다(알리지 않는다) · reject: 이 선택이 실패했다 */
type Waiter = { resolve: (applied: boolean) => void; reject: (err: unknown) => void };
type Queued = { id: string; accessToken: string; waiters: Waiter[] };

let state: MySkinsState = GUEST_SKINS_STATE;
/** 지금 상태가 어느 토큰으로 불러온 것인지 — 토큰이 바뀌면(다른 계정·재로그인) 다시 불러온다 */
let loadedToken: string | null = null;
let generation = 0;
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

function setState(next: MySkinsState): void {
  state = next;
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
  if (state !== GUEST_SKINS_STATE) setState(GUEST_SKINS_STATE);
}

/** 이 토큰으로 아직 안 불러왔으면 불러온다(같은 토큰은 한 번만 — 화면마다 다시 부르지 않게. 만료 401도 같은 토큰으로는 다시 부르지 않는다) */
export async function loadMySkins(accessToken: string): Promise<void> {
  if (loadedToken === accessToken) return;
  loadedToken = accessToken;
  const mine = ++generation;
  confirmed = DEFAULT_EQUIPPED_SKINS;
  clearSlots();
  // 다른 계정·새 토큰 — 이전 장착을 남기지 않고 기본으로 그리며 기다린다
  setState({ status: 'loading', equipped: DEFAULT_EQUIPPED_SKINS, catalog: null });
  try {
    const { data } = await getMySkins(accessToken);
    if (mine !== generation) return;
    confirmed = toEquippedSkins(data?.equipped);
    setState({ status: 'ready', equipped: confirmed, catalog: normalizeCatalog(data?.catalog) });
  } catch (err) {
    if (mine !== generation) return;
    const expired = isAuthExpired(err);
    // 일시 실패면 다음 화면 진입 때 다시 시도하게 — 만료는 다시 로그인해 토큰이 바뀔 때까지 같은 결과라 기억한다
    if (!expired) loadedToken = null;
    setState({ status: expired ? 'expired' : 'error', equipped: DEFAULT_EQUIPPED_SKINS, catalog: null });
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
    const catalog = normalizeCatalog(data?.catalog);
    if (catalog) setState({ ...state, catalog });
  } catch (err) {
    if (gen !== generation) return choice.waiters.forEach((w) => w.resolve(false));
    error = err;
  }
  inflight[slot] = false;
  const expired = error !== null && isAuthExpired(error);
  const after = queued[slot];
  queued[slot] = null;
  if (after && !expired) {
    // 더 새 선택이 기다린다 — 이 선택은 밀렸다(성공·실패 모두 알리지 않는다), 화면은 그 선택 그대로
    choice.waiters.forEach((w) => w.resolve(false));
    void send(slot, after, gen);
    return;
  }
  // 보낼 것이 없다(또는 만료라 보내도 같다) — 확정값을 보인다
  setState({ ...state, ...(expired ? { status: 'expired' as const } : {}), equipped: { ...state.equipped, [slot]: confirmed[slot] } });
  if (after) {
    // 만료라 기다리던 선택을 보내지 않는다 — 실패는 마지막 선택 하나로만 알린다(토스트 한 번), 밀린 앞 선택은 조용히
    after.waiters.forEach((w) => w.reject(error));
    choice.waiters.forEach((w) => w.resolve(false));
  } else if (error !== null) choice.waiters.forEach((w) => w.reject(error));
  else choice.waiters.forEach((w) => w.resolve(true));
}

/**
 * 한 슬롯 장착 — 낙관적 반영 후 PUT(같은 슬롯은 하나씩). true면 이 선택이 저장됐다, false면 이미 장착 중이었거나 더 새 선택·세대 교체로 밀렸다(알리지 않는다)
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

/** 테스트용 */
export function __resetMySkinsForTests(): void {
  generation++;
  loadedToken = null;
  confirmed = DEFAULT_EQUIPPED_SKINS;
  clearSlots();
  state = GUEST_SKINS_STATE;
  listeners.clear();
}
