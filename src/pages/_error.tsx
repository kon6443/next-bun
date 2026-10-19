/**
 * Custom Error Page for Pages Router
 *
 * Next.js의 내장 pages/_error.js는 styled-jsx를 사용하는데,
 * styled-jsx가 React 19와 호환되지 않아 빌드 에러가 발생합니다.
 *
 * 이 파일은 Next.js 기본 에러 페이지를 styled-jsx 없이 오버라이드하여
 * React 19 호환성 문제를 해결합니다.
 *
 * 참고: App Router의 error.tsx, not-found.tsx, global-error.tsx와 함께 사용됩니다.
 */

import type { NextPageContext } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';

type ErrorPageProps = {
  statusCode?: number;
};

function ErrorPage({ statusCode }: ErrorPageProps) {
  const is404 = statusCode === 404;
  const title = is404 ? '페이지를 찾을 수 없습니다' : '오류가 발생했습니다';
  const description = is404
    ? '요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.'
    : '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';

  return (
    <div style={containerStyle}>
      <section style={cardStyle}>
        <div style={iconWrapStyle}>
          <span style={iconStyle}>{is404 ? '🔍' : '⚠️'}</span>
        </div>
        <p style={eyebrowStyle}>{statusCode ? `오류 ${statusCode}` : '오류'}</p>
        <h1 style={titleStyle}>{title}</h1>
        <p style={descriptionStyle}>{description}</p>
        <div style={buttonGroupStyle}>
          <Link href="/" style={primaryButtonStyle}>
            홈으로 돌아가기
          </Link>
        </div>
      </section>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): ErrorPageProps => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};

export default ErrorPage;

// Inline styles (styled-jsx 대신 사용)
const containerStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  background:
    'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.28), transparent 55%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.2), transparent 60%), #020617',
};

const cardStyle: CSSProperties = {
  width: 'min(430px, 100%)',
  background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(15,23,42,0.75))',
  border: '1px solid rgba(148,163,184,0.25)',
  borderRadius: '28px',
  padding: '2.75rem',
  boxShadow: '0 35px 65px rgba(2,6,23,0.75), inset 0 1px 0 rgba(255,255,255,0.05)',
  textAlign: 'center',
};

const iconWrapStyle: CSSProperties = {
  width: 80,
  height: 80,
  margin: '0 auto 1rem',
  borderRadius: '9999px',
  background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const iconStyle: CSSProperties = {
  fontSize: '2.25rem',
};

const eyebrowStyle: CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.35em',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: '0.5rem',
};

const titleStyle: CSSProperties = {
  fontSize: '2.15rem',
  fontWeight: 700,
  color: '#e2e8f0',
  marginBottom: '0.75rem',
};

const descriptionStyle: CSSProperties = {
  fontSize: '1rem',
  color: '#cbd5f5',
  lineHeight: 1.6,
  marginBottom: '1.85rem',
};

const buttonGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const primaryButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  borderRadius: '9999px',
  border: 'none',
  padding: '0.95rem 1.25rem',
  fontSize: '1rem',
  fontWeight: 600,
  textDecoration: 'none',
  background: 'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(99,102,241,0.4))',
  color: '#f8fafc',
  boxShadow: '0 18px 35px rgba(59,130,246,0.35)',
};
