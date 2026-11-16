"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ShareMenu } from "@/app/games/_shared/components/ShareMenu";
import { useKakaoReady } from "@/app/games/_shared/hooks/useKakaoReady";
import type { ShareContent } from "@/app/games/_shared/lib/shareSpec";
import { Button } from "@/app/teams/components/Button";
import { uploadFortressSoloMatch } from "@/services/fortressService";
import type { MatchState } from "../engine";
import type { Controller } from "../lib/controllers";
import type { ReplayData } from "../lib/replay";
import { buildSoloUpload, isPermanentSoloUploadError, soloShareContent, soloUploadErrorMessage } from "../lib/soloUpload";

/**
 * 경기별 공유 상태 — 결과 ↔ 다시 보기를 오가며 결과 화면이 다시 마운트돼도 같은 기록을 두 번 올리지 않는다
 * - upload: 올리는 중(또는 끝난) 요청 — 화면을 떠났다 와도 같은 요청을 기다린다. 일시적 실패면 지워 다음 누름에서 다시 올린다
 * - matchId: 받은 경기 id — 다시 누르면 바로 메뉴를 연다
 * - rejected: 다시 보내도 소용없는 실패(엔진 버전·기록 검증·크기)의 안내 — 그 경기에서는 버튼을 막는다
 * 기록은 요청 쪽에서 남긴다(누른 화면이 사라져도 남게). 열쇠는 그 경기의 기록 객체 — 새 판이면 새 객체라 다시 올린다
 */
type Shared = { upload?: Promise<string>; matchId?: string; rejected?: string };
const shared = new WeakMap<ReplayData, Shared>();
const sharedOf = (data: ReplayData): Shared => {
  let rec = shared.get(data);
  if (!rec) shared.set(data, (rec = {}));
  return rec;
};

type Status = { kind: "idle" } | { kind: "uploading" } | { kind: "error"; message: string; permanent: boolean };

/** 마운트 때의 상태 — 다른 화면에서 시작한 요청이 아직 진행 중이거나 영구 실패로 끝났으면 그대로 보인다 */
function initialStatus(data: ReplayData): Status {
  const rec = shared.get(data);
  if (rec?.rejected) return { kind: "error", message: rec.rejected, permanent: true };
  if (rec?.upload && !rec.matchId) return { kind: "uploading" };
  return { kind: "idle" };
}

/**
 * 결과 화면 "기록 공유"(D-027 보충 2) — 누를 때 한 번만 서버에 올려 matchId를 받고 공유 메뉴(카톡·기본 공유·링크 복사)를 연다
 * 자동 업로드하지 않는다. 같은 경기를 다시 누르면 받은 matchId로 바로 연다. 올릴 수 없는 기록(중단·이 기기 밖 자리)이면 버튼을 그리지 않는다
 */
export function SoloShareButton({ data, controllers, final, className }: { data: ReplayData; controllers: readonly Controller[]; final: MatchState; className?: string }) {
  const { data: session, status: sessionStatus } = useSession();
  const accessToken = session?.user?.accessToken;
  const [status, setStatus] = useState<Status>(() => initialStatus(data));
  const [content, setContent] = useState<ShareContent | null>(null);
  const { kakao, kakaoScript } = useKakaoReady();
  const request = useMemo(() => buildSoloUpload(data, controllers), [data, controllers]);
  /** 다른 화면에서 시작한 요청을 기다리는 동안 눌렀다 — 끝나면 메뉴를 연다 */
  const openWhenDoneRef = useRef(false);
  const openRef = useRef<(matchId: string) => void>(() => {});
  // 다른 화면에서 시작한 요청이 진행 중이면 끝날 때 버튼 상태를 맞춘다(그사이 눌렀으면 메뉴도 연다)
  useEffect(() => {
    const pending = shared.get(data)?.upload;
    if (!pending || shared.get(data)?.matchId) return;
    let alive = true;
    pending.then(
      (matchId) => {
        if (!alive) return;
        setStatus({ kind: "idle" });
        if (openWhenDoneRef.current) openRef.current(matchId);
      },
      (error: unknown) => alive && setStatus({ kind: "error", message: soloUploadErrorMessage(error), permanent: isPermanentSoloUploadError(error) }),
    );
    return () => {
      alive = false;
    };
  }, [data]);
  if (!request) return null;

  const open = (matchId: string) => setContent(soloShareContent(matchId, final, controllers));
  openRef.current = open;
  const onClick = async () => {
    const rec = sharedOf(data);
    if (rec.rejected) return setStatus({ kind: "error", message: rec.rejected, permanent: true });
    if (rec.matchId) return open(rec.matchId);
    // 올리는 중(다른 화면에서 시작한 요청 포함)이면 끝날 때 연다
    if (status.kind === "uploading") {
      openWhenDoneRef.current = true;
      return;
    }
    // 로그인 확인 중이면 기다린다 — 게스트로 올리면 첫 사람 자리의 계정 스킨이 빠진다
    if (sessionStatus === "loading") return;
    if (!rec.upload) {
      const upload: Promise<string> = uploadFortressSoloMatch(request, accessToken).then(
        (res) => (rec.matchId = res.data.matchId),
        (error: unknown) => {
          if (rec.upload === upload) rec.upload = undefined;
          if (isPermanentSoloUploadError(error)) rec.rejected = soloUploadErrorMessage(error);
          throw error;
        },
      );
      rec.upload = upload;
    }
    setStatus({ kind: "uploading" });
    try {
      const matchId = await rec.upload;
      setStatus({ kind: "idle" });
      open(matchId);
    } catch (error) {
      setStatus({ kind: "error", message: soloUploadErrorMessage(error), permanent: isPermanentSoloUploadError(error) });
    }
  };
  const uploading = status.kind === "uploading";
  // disabled 대신 aria-disabled — 누른 버튼이 disabled가 되면 키보드 포커스가 body로 빠진다(클릭은 위에서 무시)
  const blocked = status.kind === "error" && status.permanent;

  return (
    <>
      <Button type="button" variant="secondary" size="md" fullWidth className={`${className ?? ""} ${blocked ? "cursor-not-allowed opacity-50" : ""}`} onClick={() => void onClick()} aria-disabled={blocked || undefined} aria-haspopup="dialog" aria-busy={uploading || undefined} data-testid="fortress-solo-share">
        {uploading ? "올리는 중…" : "기록 공유"}
      </Button>
      {/* 실패 안내 — 라이브 영역은 늘 마운트하고 내용만 바꾼다 */}
      <p className={status.kind === "error" ? "col-span-2 text-center text-sm text-rose-300" : "sr-only"} role="status" data-testid="fortress-solo-share-status">
        {status.kind === "error" ? status.message : uploading ? "기록을 올리는 중이에요." : ""}
      </p>
      {kakaoScript}
      {content ? <ShareMenu content={content} kakao={kakao} subject="경기 기록" onClose={() => setContent(null)} /> : null}
    </>
  );
}
