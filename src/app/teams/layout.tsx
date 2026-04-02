import type { Metadata } from 'next';
import { SITE_CONFIG } from '../config/siteConfig';

export const metadata: Metadata = {
  title: '팀 협업',
  description: '칸반 보드, 실시간 태스크 관리, 역할 기반 권한, 팀원 초대까지. 팀 프로젝트를 한곳에서 관리하세요.',
  openGraph: {
    title: `팀 협업 | ${SITE_CONFIG.name}`,
    description: '칸반 보드, 실시간 태스크 관리, 팀원 초대까지.',
    type: 'website',
    locale: SITE_CONFIG.locale,
  },
  keywords: ['팀 협업', '프로젝트 관리', '칸반 보드', '실시간 협업', '태스크 관리', '팀 관리 도구', '투두리스트', '할일 관리', '팀 투두', '업무 관리', '일정 관리'],
  alternates: { canonical: '/teams' },
};

export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
