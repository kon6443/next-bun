import type { Metadata } from 'next';
import { SITE_CONFIG } from '../config/siteConfig';

const FISHING_DESC = '브라우저에서 바로 즐기는 방치형 멀티플레이어 낚시 미니게임. 12종의 물고기를 낚아보세요!';

export const metadata: Metadata = {
  title: {
    default: '낚시 게임',
    template: `%s | ${SITE_CONFIG.name}`,
  },
  description: FISHING_DESC,
  openGraph: {
    title: `낚시 게임 | ${SITE_CONFIG.name}`,
    description: FISHING_DESC,
    type: 'website',
    locale: SITE_CONFIG.locale,
  },
  twitter: {
    card: 'summary_large_image',
    title: `낚시 게임 | ${SITE_CONFIG.name}`,
    description: FISHING_DESC,
  },
  keywords: ['낚시 게임', '웹 낚시', '온라인 낚시', '방치형 게임', '미니게임', '멀티플레이어 낚시'],
};

export default function FishingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
