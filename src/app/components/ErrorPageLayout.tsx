import Link from 'next/link';

type ErrorPageLayoutProps = {
  /** 에러 코드 또는 제목 (예: "404", "500", "오류 발생") */
  title: string;
  /** 제목 색상 클래스 (기본: text-red-400) */
  titleColor?: string;
  /** 부제목 */
  subtitle: string;
  /** 설명 문구 */
  description: string;
  /** 버튼 텍스트 */
  buttonText: string;
  /** 버튼 클릭 핸들러 (있으면 button, 없으면 Link) */
  onButtonClick?: () => void;
  /** 링크 URL (onButtonClick이 없을 때 사용) */
  href?: string;
};

/**
 * 에러 페이지 공통 레이아웃 컴포넌트
 *
 * 404, 500, 일반 에러 페이지에서 재사용됩니다.
 */
export function ErrorPageLayout({
  title,
  titleColor = 'text-red-400',
  subtitle,
  description,
  buttonText,
  onButtonClick,
  href = '/',
}: ErrorPageLayoutProps) {
  const containerStyles =
    'min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 px-4';
  const buttonStyles =
    'px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors';

  return (
    <div className={containerStyles}>
      <h1 className={`text-6xl font-bold ${titleColor} mb-4`}>{title}</h1>
      <h2 className="text-2xl font-semibold mb-2">{subtitle}</h2>
      <p className="text-slate-400 mb-8 text-center max-w-md">{description}</p>
      {onButtonClick ? (
        <button onClick={onButtonClick} className={buttonStyles}>
          {buttonText}
        </button>
      ) : (
        <Link href={href} className={buttonStyles}>
          {buttonText}
        </Link>
      )}
    </div>
  );
}

/**
 * global-error.tsx 전용 레이아웃 (html, body 태그 포함)
 */
export function GlobalErrorLayout({
  title,
  titleColor = 'text-red-400',
  subtitle,
  description,
  buttonText,
  onButtonClick,
}: Omit<ErrorPageLayoutProps, 'href'> & { onButtonClick: () => void }) {
  const containerStyles =
    'min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 px-4';
  const buttonStyles =
    'px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors';

  return (
    <html>
      <body className={containerStyles}>
        <h1 className={`text-6xl font-bold ${titleColor} mb-4`}>{title}</h1>
        <h2 className="text-2xl font-semibold mb-2">{subtitle}</h2>
        <p className="text-slate-400 mb-8 text-center max-w-md">{description}</p>
        <button onClick={onButtonClick} className={buttonStyles}>
          {buttonText}
        </button>
      </body>
    </html>
  );
}
