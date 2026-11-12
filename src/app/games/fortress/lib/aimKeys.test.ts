import { describe, it, expect } from "vitest";
import { type KeyInput, aimKeyAction } from "./aimKeys";

const key = (k: string, extra: Partial<KeyInput> = {}): KeyInput => ({ key: k, code: "", repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });

describe("조준 키 규칙 (D-022 원작 배치)", () => {
  it("←→·A/D 이동, ↑↓·W/S 포신, Q/E 파워", () => {
    expect(aimKeyAction(key("ArrowLeft"), "none")).toEqual({ kind: "move", dir: -1 });
    expect(aimKeyAction(key("ArrowRight"), "none")).toEqual({ kind: "move", dir: 1 });
    expect(aimKeyAction(key("a", { code: "KeyA" }), "none")).toEqual({ kind: "move", dir: -1 });
    expect(aimKeyAction(key("d", { code: "KeyD" }), "none")).toEqual({ kind: "move", dir: 1 });
    expect(aimKeyAction(key("ArrowUp"), "none")).toEqual({ kind: "elevate", delta: 1 });
    expect(aimKeyAction(key("ArrowDown"), "none")).toEqual({ kind: "elevate", delta: -1 });
    expect(aimKeyAction(key("w", { code: "KeyW" }), "none")).toEqual({ kind: "elevate", delta: 1 });
    expect(aimKeyAction(key("s", { code: "KeyS" }), "none")).toEqual({ kind: "elevate", delta: -1 });
    expect(aimKeyAction(key("q", { code: "KeyQ" }), "none")).toEqual({ kind: "power", delta: -1 });
    expect(aimKeyAction(key("e", { code: "KeyE" }), "none")).toEqual({ kind: "power", delta: 1 });
  });

  it("포커스가 없으면(마우스로 누른 버튼 포함) 스페이스는 충전 — 핫시트에서 앞사람이 클릭한 버튼을 누르지 않는다", () => {
    expect(aimKeyAction(key(" "), "none")).toEqual({ kind: "charge" });
    expect(aimKeyAction(key(" ", { repeat: true }), "none")).toEqual({ kind: "hold" });
  });

  it("키보드로 들어간 버튼에서는 스페이스·Enter를 버튼에 양보, 화살표는 조작", () => {
    expect(aimKeyAction(key(" "), "button")).toBeNull();
    expect(aimKeyAction(key("Enter"), "button")).toBeNull();
    expect(aimKeyAction(key("ArrowLeft"), "button")).toEqual({ kind: "move", dir: -1 });
  });

  it("키보드로 들어간 파워 슬라이더에서는 화살표 넷이 슬라이더 몫(파워) — 글자 키·스페이스는 그대로", () => {
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "Home"]) expect(aimKeyAction(key(k), "range")).toBeNull();
    expect(aimKeyAction(key("d", { code: "KeyD" }), "range")).toEqual({ kind: "move", dir: 1 });
    expect(aimKeyAction(key("w", { code: "KeyW" }), "range")).toEqual({ kind: "elevate", delta: 1 });
    expect(aimKeyAction(key(" "), "range")).toEqual({ kind: "charge" });
  });

  it("수정키가 붙으면 브라우저 단축키(⌘D·Ctrl+A·Alt+←·Ctrl+W)라 손대지 않는다", () => {
    expect(aimKeyAction(key("d", { code: "KeyD", metaKey: true }), "none")).toBeNull();
    expect(aimKeyAction(key("a", { code: "KeyA", ctrlKey: true }), "none")).toBeNull();
    expect(aimKeyAction(key("ArrowLeft", { altKey: true }), "none")).toBeNull();
    expect(aimKeyAction(key("w", { code: "KeyW", ctrlKey: true }), "none")).toBeNull();
  });

  it("글자 키는 물리 키 — 한글 입력 상태(ㅁ·ㅇ·ㅈ·ㄴ·ㅂ·ㄷ)에서도, 글 입력 중엔 손대지 않는다", () => {
    expect(aimKeyAction(key("ㅁ", { code: "KeyA" }), "none")).toEqual({ kind: "move", dir: -1 });
    expect(aimKeyAction(key("ㅇ", { code: "KeyD" }), "none")).toEqual({ kind: "move", dir: 1 });
    expect(aimKeyAction(key("ㅈ", { code: "KeyW" }), "none")).toEqual({ kind: "elevate", delta: 1 });
    expect(aimKeyAction(key("ㄴ", { code: "KeyS" }), "none")).toEqual({ kind: "elevate", delta: -1 });
    expect(aimKeyAction(key("ㅂ", { code: "KeyQ" }), "none")).toEqual({ kind: "power", delta: -1 });
    expect(aimKeyAction(key("ㄷ", { code: "KeyE" }), "none")).toEqual({ kind: "power", delta: 1 });
    expect(aimKeyAction(key("d", { code: "KeyD" }), "text")).toBeNull();
  });
});
