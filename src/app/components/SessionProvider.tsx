'use client';

import { useEffect } from 'react';
import type { Session } from 'next-auth';
import { SessionProvider as Provider, signOut, useSession } from 'next-auth/react';

type Props = {
  children: React.ReactNode;
  session?: Session | null;
};

function BackendAccessTokenCookieSync() {
  const { data: session } = useSession();

  useEffect(() => {
    const accessToken = session?.user?.accessToken ?? null;
    const expiresAt = session?.expires ? new Date(session.expires).getTime() : null;
    const maxAgeFromSession =
      expiresAt && Number.isFinite(expiresAt) ? Math.floor((expiresAt - Date.now()) / 1000) : null;
    const isSecureContext = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
    const domainAttr = domain ? `; Domain=${domain}` : '';
    const secureAttr = isSecureContext ? '; Secure' : '';

    if (accessToken) {
      const maxAge =
        typeof maxAgeFromSession === 'number' && maxAgeFromSession > 0
          ? maxAgeFromSession
          : 30 * 24 * 60 * 60;
      document.cookie = `access_token=${accessToken}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureAttr}${domainAttr}`;
    } else {
      document.cookie = `access_token=; Path=/; Max-Age=0; SameSite=Lax${secureAttr}${domainAttr}`;
    }
  }, [session?.user?.accessToken, session?.expires]);

  return null;
}

export default function SessionProvider({ children, session }: Props) {
  useEffect(() => {
    const onUnauthorized = () => {
      document.cookie = `access_token=; Path=/; Max-Age=0; SameSite=Lax`;
      signOut({ callbackUrl: '/auth/signin' });
    };

    window.addEventListener('backend:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('backend:unauthorized', onUnauthorized);
    };
  }, []);

  return (
    <Provider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      <BackendAccessTokenCookieSync />
      {children}
    </Provider>
  );
}
