/**
 * 내 스킨 장착 상태(D-003) — 계정에 저장된다. 게스트는 늘 기본, 로그인하면 GET /users/me/skins로 불러온다
 * 화면 여러 곳(설정 모달·도감·내 판·화면 바탕)이 같은 값을 보도록 모듈 저장소 + useSyncExternalStore(useMySkins)
 * 장착 변경은 낙관적으로 먼저 반영하고, 응답·실패는 그 슬롯에만 반영한다(다른 슬롯을 연달아 바꿔도 서로 덮지 않게)
 * 세대(generation) — 로그아웃·다른 토큰으로 다시 불러오면 바뀐다. 이전 세대의 응답·실패는 무시한다(게스트·다른 계정 상태를 덮지 않게)
 */

import { getMySkins, type SkinCatalogItem, type SkinSlotName, updateMySkins } from '@/services/userService';
import { isAuthExpired } from '@/app/games/_shared/lib/submitError';
import { DEFAULT_EQUIPPED_SKINS, type EquippedSkins, toEquippedSkins } from './skins';

export type SkinCatalog = Record<SkinSlotName, SkinCatalogItem[]>;

export type MySkinsState = {
  /**
   * guest = 로그인 안 함(늘 기본) · loading = 불러오는 중(기본으로 그린다) · ready
   * error = 불러오기 실패(기본으로 그린다) · expired = 로그인 만료 401(기본으로 그린다, 다시 로그인하면 불러온다)
   */
  status: 'guest' | 'loading' | 'ready' | 'error' | 'expired';
  equipped: EquippedSkins;
  catalog: SkinCatalog | null;
};

export const GUEST_SKINS_STATE: MySkinsState = { status: 'guest', equipped: DEFAULT_EQUIPPED_SKINS, catalog: null };

let state: MySkinsState = GUEST_SKINS_STATE;
/** 지금 상태가 어느 토큰으로 불러온 것인지 — 토큰이 바뀌면(다른 계정·재로그인) 다시 불러온다 */
let loadedToken: string | null = null;
let generation = 0;
/** 슬롯별 장착 요청 순번 — 같은 슬롯의 늦게 온 이전 응답·실패가 새 선택을 덮지 않게 */
const slotSeq: Record<SkinSlotName, number> = { block: 0, effect: 0, board: 0, background: 0 };
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
  generation++;
  loadedToken = null;
  if (state !== GUEST_SKINS_STATE) setState(GUEST_SKINS_STATE);
}

/** 이 토큰으로 아직 안 불러왔으면 불러온다(같은 토큰은 한 번만 — 화면마다 다시 부르지 않게. 만료 401도 같은 토큰으로는 다시 부르지 않는다) */
export async function loadMySkins(accessToken: string): Promise<void> {
  if (loadedToken === accessToken) return;
  loadedToken = accessToken;
  const mine = ++generation;
  // 다른 계정·새 토큰 — 이전 장착을 남기지 않고 기본으로 그리며 기다린다
  setState({ status: 'loading', equipped: DEFAULT_EQUIPPED_SKINS, catalog: null });
  try {
    const { data } = await getMySkins(accessToken);
    if (mine !== generation) return;
    setState({ status: 'ready', equipped: toEquippedSkins(data?.equipped), catalog: normalizeCatalog(data?.catalog) });
  } catch (err) {
    if (mine !== generation) return;
    const expired = isAuthExpired(err);
    // 일시 실패면 다음 화면 진입 때 다시 시도하게 — 만료는 다시 로그인해 토큰이 바뀔 때까지 같은 결과라 기억한다
    if (!expired) loadedToken = null;
    setState({ status: expired ? 'expired' : 'error', equipped: DEFAULT_EQUIPPED_SKINS, catalog: null });
  }
}

/** 한 슬롯 장착 — 낙관적 반영 후 PUT. 실패하면 그 슬롯을 이전 값으로 되돌리고 에러를 다시 던진다(호출부가 토스트) */
export async function equipMySkin(slot: SkinSlotName, id: string, accessToken: string): Promise<void> {
  const previous = state.equipped[slot];
  if (previous === id) return;
  const gen = generation;
  const mine = ++slotSeq[slot];
  const current = () => gen === generation && mine === slotSeq[slot];
  setState({ ...state, equipped: { ...state.equipped, [slot]: id } });
  try {
    const { data } = await updateMySkins({ [slot]: id }, accessToken);
    if (!current()) return;
    // 이 슬롯만 서버 값으로 — 다른 슬롯은 그 슬롯의 요청이 맡는다(응답 순서가 바뀌어도 서로 덮지 않게)
    const saved = toEquippedSkins(data?.equipped)[slot];
    setState({ ...state, equipped: { ...state.equipped, [slot]: saved }, catalog: normalizeCatalog(data?.catalog) ?? state.catalog });
  } catch (err) {
    if (current()) {
      setState({
        ...state,
        equipped: { ...state.equipped, [slot]: previous },
        // 만료면 이후 장착도 같은 결과 — 다시 로그인하라고 안내하게 상태로 남긴다
        ...(isAuthExpired(err) ? { status: 'expired' as const } : {}),
      });
    }
    throw err;
  }
}

/** 테스트용 */
export function __resetMySkinsForTests(): void {
  generation = 0;
  loadedToken = null;
  for (const key of Object.keys(slotSeq) as SkinSlotName[]) slotSeq[key] = 0;
  state = GUEST_SKINS_STATE;
  listeners.clear();
}
