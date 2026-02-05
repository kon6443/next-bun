/**
 * Custom App for Pages Router
 *
 * pages/_error.tsx를 사용하기 위해 필요한 최소한의 _app.tsx입니다.
 * App Router(src/app)와 함께 사용되며, Pages Router 에러 페이지만 처리합니다.
 */

import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
