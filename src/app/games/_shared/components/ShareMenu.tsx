"use client";

import { useId, useState } from "react";
import toast from "react-hot-toast";
import { useDialog } from "@/app/hooks";
import type { KakaoStatus } from "../hooks/useKakaoReady";
import { sendKakaoFeed } from "../lib/kakao";
import { canWebShare, copyText, webShare } from "../lib/share";
import type { ShareContent } from "../lib/shareSpec";

type ShareMenuProps = {
  /** 게임별 공유 사양으로 만든 내용 (buildShareContent) */
  content: ShareContent;
  /** 카카오 SDK 상태(useKakaoReady) — ready면 카카오톡 버튼, loading이면 비활성 자리, failed면 안내, off면 없음 */
  kakao: KakaoStatus;
  onClose: () => void;
};

// 앱처럼 설치한 경우(PWA standalone)에는 주소창이 없다 — 메뉴 안의 링크를 가리킨다
const COPY_FAILED = "복사에 실패했습니다. 위의 링크를 길게 눌러 복사해 주세요.";

const itemStyles =
  "flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-800/70 px-4 text-left text-base font-semibold text-slate-100 transition hover:border-white/30 hover:bg-slate-800";

/**
 * 리플레이 공유 메뉴 — 모바일은 아래에서 올라오는 시트, 넓은 화면은 가운데 대화상자
 * [카카오톡](SDK 준비 시) · [링크 복사] · [더보기](Web Share 지원 시)
 */
export function ShareMenu({ content, kakao, onClose }: ShareMenuProps) {
  const titleId = useId();
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  // Web Share 지원 여부는 열린 뒤(브라우저)에서만 판단한다
  const [webShareSupported] = useState(canWebShare);

  const { url, text } = content;

  const handleKakao = () => {
    const sent = sendKakaoFeed({ ...content.kakao, url });
    if (sent) onClose();
    else toast.error("카카오톡 공유를 열지 못했습니다. 링크 복사를 이용해 주세요.");
  };

  const handleCopy = async () => {
    const result = await copyText(url);
    if (result === "copied") {
      toast.success("리플레이 링크를 복사했어요.");
      onClose();
    } else {
      toast.error(COPY_FAILED);
    }
  };

  const handleMore = async () => {
    const result = await webShare({ title: content.title, text, url });
    // 사용자가 공유 시트를 닫은 것(취소)은 실패가 아니다
    if (result === "failed") toast.error("공유하지 못했습니다. 링크 복사를 이용해 주세요.");
    if (result === "shared") onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      style={{ touchAction: "auto" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] focus:outline-none sm:rounded-3xl sm:pb-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-white">
            리플레이 공유
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-400 hover:text-slate-200"
          >
            ×
          </button>
        </div>
        <p className="truncate text-sm text-slate-400">{text}</p>
        {/* 복사가 안 되는 환경에서도 직접 선택해 복사할 수 있게 링크를 보인다 */}
        <p className="mb-4 mt-1 select-all break-all rounded-lg bg-slate-950/60 px-3 py-2 font-mono text-xs text-sky-300">
          {url}
        </p>
        <div className="flex flex-col gap-2">
          {/* 받는 중에도 자리를 잡아 둔다 — 늦게 생기며 시트가 밀리지 않게. 실패면 이유를 한 줄로 (FE-49) */}
          {(kakao === "ready" || kakao === "loading") && (
            <button type="button" onClick={handleKakao} disabled={kakao !== "ready"} aria-busy={kakao === "loading"} className={`${itemStyles} disabled:opacity-50`}>
              <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FEE500] text-sm text-[#181600]">
                K
              </span>
              {kakao === "ready" ? "카카오톡" : "카카오톡 준비 중…"}
            </button>
          )}
          {kakao === "failed" && <p className="text-xs text-slate-400">카카오톡 공유를 불러오지 못했어요. 링크 복사를 이용해 주세요.</p>}
          <button type="button" onClick={handleCopy} className={itemStyles}>
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-sm">
              🔗
            </span>
            링크 복사
          </button>
          {webShareSupported && (
            <button type="button" onClick={handleMore} className={itemStyles}>
              <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-sm">
                ⋯
              </span>
              더보기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
