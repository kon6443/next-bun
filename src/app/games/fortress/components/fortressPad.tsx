import type { GamePadLayout } from "@/app/games/_shared/components/GamePad";
import { type Tank, TANKS, WEAPONS } from "../engine";
import { WeaponIcon } from "./WeaponIcon";

/**
 * 포트리스 터치 패드 배치 (D-025 보충 2) — 테트리스와 같은 공용 GamePad에 넘긴다(터치 기기에서만, 데스크톱은 기존 조작부)
 * - 십자: ◀▶ 이동(반대쪽을 보면 첫 누름은 돌아서기 — 키보드 ←→와 같다), ▲▼ 포신. 모두 누르는 동안 반복(FortressMatch.holdRepeat)
 * - 오른쪽 위(top, 강조색): 발사 — 짧게 누르면 맞춘 파워로, 길게 누르면 충전해 뗄 때 발사(되돌릴 수 없는 동작이라 테트리스 하드 드롭과 같은 자리·색)
 * - a(큰 원): 무기 바꾸기 — 누를 때마다 다음 무기. 필살기가 대기 중이면 건너뛰고 대기 턴을 배지로
 * - 넘기기는 엄지가 닿는 자리에 두지 않는다(파워 슬라이더 줄 오른쪽 글자 버튼)
 * 키보드(D-022)는 그대로 — 패드는 포인터·click만 다룬다
 */
export const PAD = {
  LEFT: 1,
  LEFT_RELEASE: 2,
  RIGHT: 3,
  RIGHT_RELEASE: 4,
  UP: 5,
  UP_RELEASE: 6,
  DOWN: 7,
  DOWN_RELEASE: 8,
  FIRE: 9,
  FIRE_RELEASE: 10,
  WEAPON: 11,
} as const;

/** 지금 고를 수 있는 무기 — 필살기는 대기 중이면 빠진다 */
export function usableWeapons(tank: Pick<Tank, "tankId" | "cooldown">): number[] {
  return TANKS[tank.tankId].weapons.filter((id) => !(WEAPONS[id].cooldown > 0 && tank.cooldown > 0));
}

/** 무기 바꾸기 — 다음 고를 수 있는 무기(끝이면 처음으로). 지금 무기가 못 쓰게 됐으면 첫 무기 */
export function nextWeapon(tank: Pick<Tank, "tankId" | "cooldown">, current: number): number {
  const usable = usableWeapons(tank);
  const i = usable.indexOf(current);
  return usable[(i + 1) % usable.length] ?? current;
}

export function fortressPadLayout(o: {
  tank: Pick<Tank, "tankId" | "cooldown">;
  weaponId: number;
  power: number;
  /** 충전 중이면 0~100, 아니면 null */
  charge: number | null;
  /** 반대쪽을 보고 있으면 첫 누름은 돌아서기 */
  facing: 1 | -1;
  fireAria: string;
  /** 시안(D-025 보충 6) — 무기 버튼에 아이콘, 필살기를 고르면 빛나는 테두리. classic은 글자 그대로 */
  vivid?: boolean;
}): GamePadLayout {
  const weapons = TANKS[o.tank.tankId].weapons;
  const special = weapons.find((id) => WEAPONS[id].cooldown > 0);
  const cooling = special !== undefined && o.tank.cooldown > 0;
  const name = WEAPONS[o.weaponId]?.name ?? "";
  const specialPicked = (WEAPONS[o.weaponId]?.cooldown ?? 0) > 0;
  return {
    dpad: {
      left: { action: { kind: "hold", press: PAD.LEFT, release: PAD.LEFT_RELEASE }, aria: o.facing === -1 ? "왼쪽으로 이동" : "왼쪽으로 돌아서기", label: "◀" },
      right: { action: { kind: "hold", press: PAD.RIGHT, release: PAD.RIGHT_RELEASE }, aria: o.facing === 1 ? "오른쪽으로 이동" : "오른쪽으로 돌아서기", label: "▶" },
      up: { action: { kind: "hold", press: PAD.UP, release: PAD.UP_RELEASE }, aria: "포신 올리기", label: "▲" },
      down: { action: { kind: "hold", press: PAD.DOWN, release: PAD.DOWN_RELEASE }, aria: "포신 내리기", label: "▼" },
    },
    buttons: [
      {
        id: "fire",
        slot: "top",
        action: { kind: "hold", press: PAD.FIRE, release: PAD.FIRE_RELEASE },
        aria: o.fireAria,
        tone: "accent",
        content: (
          <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl" aria-hidden="true" data-special-glow={o.vivid && specialPicked ? "true" : undefined}>
            {/* 충전 막대 — 버튼 안을 왼쪽부터 채운다(시안은 충전 중 맥박) */}
            <span className="absolute inset-y-0 left-0 bg-amber-300/45" style={{ width: `${o.charge ?? 0}%` }} data-charge-bar={o.vivid && o.charge !== null ? "true" : undefined} />
            <span className="relative text-base tabular-nums">{o.charge !== null ? `파워 ${o.charge}` : `발사 ${o.power}`}</span>
          </span>
        ),
      },
      {
        id: "weapon",
        slot: "a",
        action: { kind: "instant", action: PAD.WEAPON },
        aria: `무기 바꾸기 — 지금 ${name}${cooling && special !== undefined ? `, ${WEAPONS[special].name} ${o.tank.cooldown}턴 뒤` : ""}`,
        tone: "primary",
        // 고를 무기가 하나뿐이면 바꿀 것이 없다 — 지금 탱크는 모두 일반 무기 2 + 필살기 1이라 실제로는 켜지지 않는다(구성이 바뀔 때를 위한 안전장치)
        disabled: usableWeapons(o.tank).length <= 1,
        content: o.vivid ? (
          <span className="relative flex h-full w-full flex-col items-center justify-center px-1 text-center leading-none" aria-hidden="true" data-special-glow={specialPicked ? "true" : undefined}>
            <WeaponIcon weaponId={o.weaponId} size={26} />
            <span className="mt-0.5 text-[11px] font-bold">{name}</span>
            {cooling ? <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#160b1c] bg-amber-300 px-1 text-[10px] font-black leading-none text-slate-900">{o.tank.cooldown}</span> : null}
          </span>
        ) : (
          <span className="relative flex h-full w-full flex-col items-center justify-center px-1 text-center leading-tight" aria-hidden="true">
            <span className="text-[11px] font-semibold text-sky-200">무기</span>
            <span className="text-xs">{name}</span>
            {cooling ? <span className="absolute -right-1 -top-1 rounded-full border border-slate-900 bg-amber-400 px-1 text-[10px] font-bold leading-[14px] text-slate-900">{o.tank.cooldown}</span> : null}
          </span>
        ),
      },
    ],
  };
}
