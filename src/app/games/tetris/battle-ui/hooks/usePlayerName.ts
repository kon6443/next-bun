"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { loadLastName, saveLastName } from "../../lib/storage";
import { normalizePlayerName, validatePlayerName } from "../../lib/playerName";

/**
 * 대전에서 쓸 이름 — 기본값은 마지막에 쓴 이름 → 로그인 닉네임(규칙을 통과하는 것만). 랭킹 등록 이름과 같은 저장값을 쓴다
 */
export function usePlayerName() {
  const { data: session, status } = useSession();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (status === "loading" || touched) return;
    const candidate = [loadLastName(), session?.user?.userName ?? ""].find((n) => n && validatePlayerName(n) === null);
    if (candidate) setName(normalizePlayerName(candidate));
  }, [status, session?.user?.userName, touched]);

  /** 규칙을 통과하는 이름이면 바로 저장한다 — 로비에서 적은 이름이 방 화면(새 훅)으로 이어지게 */
  const change = (value: string) => {
    setTouched(true);
    setName(value);
    if (validatePlayerName(value) === null) saveLastName(normalizePlayerName(value));
  };

  /** 보낼 이름 — 문제가 있으면 error */
  const resolve = (): { name: string; error: null } | { name: null; error: string } => {
    const error = validatePlayerName(name);
    return error ? { name: null, error } : { name: normalizePlayerName(name), error: null };
  };

  return { name, change, resolve, remember: saveLastName };
}
