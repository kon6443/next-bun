/**
 * 내 스킨 장착 상태(D-003) — 계정에 저장된다. 게스트는 늘 기본, 로그인하면 GET /users/me/skins로 불러온다
 * 화면 여러 곳(설정 모달·내 판·화면 바탕)이 같은 값을 보도록 모듈 저장소 + useSyncExternalStore(useMySkins)
 * 장착 변경은 낙관적으로 먼저 반영하고 PUT이 실패하면 그 슬롯만 되돌린다. 응답은 가장 나중 요청 것만 반영한다(빠른 연속 변경)
 */

import { getMySkins, type SkinCatalogItem, type SkinSlotName, updateMySkins } from '@/services/userService';
import { DEFAULT_EQUIPPED_SKINS, type EquippedSkins, toEquippedSkins } from './skins';

export type SkinCatalog = Record<SkinSlotName, SkinCatalogItem[]>;

export type MySkinsState = {
  /** guest = 로그인 안 함(늘 기본) · loading = 불러오는 중(기본으로 그린다) · ready · error = 불러오기 실패(기본으로 그린다) */
  status: 'guest' | 'loading' | 'ready' | 'error';
  equipped: EquippedSkins;
  catalog: SkinCatalog | null;
};

export const GUEST_SKINS_STATE: MySkinsState = { status: 'guest', equipped: DEFAULT_EQUIPPED_SKINS, catalog: null };

let state: MySkinsState = GUEST_SKINS_STATE;
/** 지금 상태가 어느 토큰으로 불러온 것인지 — 토큰이 바뀌면(다른 계정·재로그인) 다시 불러온다 */
let loadedToken: string | null = null;
/** 요청 순번 — 늦게 도착한 이전 응답이 새 상태를 덮지 않게 */
let seq = 0;
const listeners = new Set<() => void>();

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
  seq++;
  loadedToken = null;
  if (state !== GUEST_SKINS_STATE) setState(GUEST_SKINS_STATE);
}

/** 이 토큰으로 아직 안 불러왔으면 불러온다(같은 토큰은 한 번만 — 화면마다 다시 부르지 않게) */
export async function loadMySkins(accessToken: string): Promise<void> {
  if (loadedToken === accessToken) return;
  loadedToken = accessToken;
  const mine = ++seq;
  setState({ ...state, status: 'loading' });
  try {
    const { data } = await getMySkins(accessToken);
    if (mine !== seq) return;
    setState({ status: 'ready', equipped: toEquippedSkins(data?.equipped), catalog: normalizeCatalog(data?.catalog) });
  } catch {
    if (mine !== seq) return;
    // 다음 화면 진입 때 다시 시도하게 — 실패를 기억하지 않는다
    loadedToken = null;
    setState({ ...state, status: 'error' });
  }
}

/** 한 슬롯 장착 — 낙관적 반영 후 PUT. 실패하면 그 슬롯을 이전 값으로 되돌리고 에러를 다시 던진다(호출부가 토스트) */
export async function equipMySkin(slot: SkinSlotName, id: string, accessToken: string): Promise<void> {
  const previous = state.equipped[slot];
  if (previous === id) return;
  const mine = ++seq;
  setState({ ...state, equipped: { ...state.equipped, [slot]: id } });
  try {
    const { data } = await updateMySkins({ [slot]: id }, accessToken);
    if (mine !== seq) return;
    const catalog = normalizeCatalog(data?.catalog);
    setState({ status: 'ready', equipped: toEquippedSkins(data?.equipped), catalog: catalog ?? state.catalog });
  } catch (err) {
    // 그 사이 같은 슬롯을 다시 바꿨으면 그 값을 지운다 — 다른 슬롯 변경은 그대로 둔다
    if (state.equipped[slot] === id) setState({ ...state, equipped: { ...state.equipped, [slot]: previous } });
    throw err;
  }
}

/** 테스트용 */
export function __resetMySkinsForTests(): void {
  seq = 0;
  loadedToken = null;
  state = GUEST_SKINS_STATE;
  listeners.clear();
}
