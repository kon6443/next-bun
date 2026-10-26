"use client";

import { type ReactNode, useRef, useState } from "react";
import { SettingsSheet } from "./SettingsSheet";

export type SettingsGroup = {
  id: string;
  title: string;
  /** 목록 줄의 지금 상태 한 줄(예: "효과음 켜짐 · 배경음 꺼짐") */
  summary: ReactNode;
  /** 목록 줄 왼쪽 미리보기(스킨 등) */
  preview?: ReactNode;
  /** 상세 화면 */
  content: ReactNode;
};

type Props = {
  /** 목록 화면 제목(대화상자 이름) — 상세에서는 그룹 제목 */
  title: string;
  groups: readonly SettingsGroup[];
  onClose: () => void;
  testId?: string;
  /** 처음부터 이 그룹의 상세로 연다(홈의 "내 스킨" 카드 등) — ←는 목록으로 */
  initialGroup?: string;
};

/**
 * 그룹 목록 → 상세 설정 시트(D-006) — 첫 화면은 그룹 줄(이름·지금 상태), 줄을 누르면 그 그룹의 상세(제목 줄 ←로 목록)
 * 한 대화상자 안에서 화면만 바꾼다 — 모달을 겹치지 않는다. 상세로 가면 ←에, 목록으로 돌아오면 누른 줄에 포커스
 * 어떤 그룹을 둘지는 게임이 정한다(테트리스: 스킨·소리·조작·화면 · 디펜스: 소리·화면·플레이)
 */
export function SettingsGroupSheet({ title, groups, onClose, testId, initialGroup }: Props) {
  const [openId, setOpenId] = useState<string | null>(initialGroup ?? null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const open = groups.find((group) => group.id === openId) ?? null;

  const backToList = () => {
    const from = openId;
    setOpenId(null);
    requestAnimationFrame(() => (from ? rowRefs.current.get(from)?.focus() : undefined));
  };

  return (
    <SettingsSheet
      title={open ? open.title : title}
      testId={testId}
      size="md"
      onClose={onClose}
      headerStart={
        open && (
          // 누른 줄이 사라지니 바뀐 화면의 첫 컨트롤로 포커스
          <button
            type="button"
            onClick={backToList}
            aria-label={`${title} 목록으로`}
            autoFocus
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-slate-300 hover:text-white"
          >
            ←
          </button>
        )
      }
    >
      <div className="min-h-0 overflow-y-auto" data-settings-view={open ? open.id : "list"}>
        {open ? (
          open.content
        ) : (
          <ul className="grid gap-1">
            {groups.map((group) => (
              <li key={group.id}>
                <button
                  ref={(el) => {
                    if (el) rowRefs.current.set(group.id, el);
                    else rowRefs.current.delete(group.id);
                  }}
                  type="button"
                  data-testid={`settings-group-${group.id}`}
                  onClick={() => setOpenId(group.id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
                >
                  {group.preview && <span className="shrink-0">{group.preview}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-100">{group.title}</span>
                    <span className="block truncate text-xs text-slate-400">{group.summary}</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsSheet>
  );
}
