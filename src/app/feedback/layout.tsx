import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '피드백',
  description: '기능 제안, 버그 리포트, 개선 요청을 보내고 답변을 확인하세요.',
  // 로그인 사용자 전용 화면이라 검색 노출하지 않는다 (robots.ts disallow와 같은 이유)
  robots: { index: false, follow: false },
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
