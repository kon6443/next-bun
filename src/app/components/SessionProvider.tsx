"use client";

import { useEffect } from "react";
import type { Session } from "next-auth";
import { SessionProvider as Provider, signOut, useSession } from "next-auth/react";

type Props = {
  children: React.ReactNode;
  session?: Session | null;
};

function DevBackendAccessTokenCookieSync() {
  const { data: session } = useSession();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const accessToken = session?.user?.accessToken ?? null;
    const expiresAt = session?.expires ? new Date(session.expires).getTime() : null;
    const maxAgeFromSession =
      expiresAt && Number.isFinite(expiresAt) ? Math.floor((expiresAt - Date.now()) / 1000) : null;
    const isSecureContext = typeof window !== "undefined" && window.location.protocol === "https:";
    const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
    const domainAttr = domain ? `; Domain=${domain}` : "";
    const secureAttr = isSecureContext ? "; Secure" : "";

    if (accessToken) {
      // session.expires가 있으면 그 기준으로, 없으면 30일로 세팅
      const maxAge =
        typeof maxAgeFromSession === "number" && maxAgeFromSession > 0
          ? maxAgeFromSession
          : 30 * 24 * 60 * 60;
      document.cookie = `access_token=${accessToken}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureAttr}${domainAttr}`;
    } else {
      // 로그아웃/세션 없음이면 쿠키 제거
      document.cookie = `access_token=; Path=/; Max-Age=0; SameSite=Lax${secureAttr}${domainAttr}`;
    }
  }, [session?.user?.accessToken, session?.expires]);

  return null;
}

export default function SessionProvider({ children, session }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!window.location.search.includes("authTiming=1")) {
      return;
    }

    const start = performance.now();
    const url = `/api/auth/session?timing=1&ts=${Date.now()}`;

    fetch(url, { credentials: "same-origin" })
      .then(response => {
        const elapsed = Math.round(performance.now() - start);
        console.info(
          `[next-auth] /api/auth/session ${response.status} ${elapsed}ms`,
        );
      })
      .catch(error => {
        const elapsed = Math.round(performance.now() - start);
        console.info(
          `[next-auth] /api/auth/session failed ${elapsed}ms`,
          error,
        );
      });
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      if (process.env.NODE_ENV === "development") {
        // 로컬 편의 쿠키도 같이 정리
        document.cookie = `access_token=; Path=/; Max-Age=0; SameSite=Lax`;
      }
      // 백엔드 accessToken 만료/무효화 등으로 401이 오면 세션을 정리하고 재로그인 화면으로 이동
      signOut({ callbackUrl: "/auth/signin" });
    };

    window.addEventListener("backend:unauthorized", onUnauthorized);
    return () => {
      window.removeEventListener("backend:unauthorized", onUnauthorized);
    };
  }, []);

  return (
    <Provider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      <DevBackendAccessTokenCookieSync />
      {children}
    </Provider>
  );
}
