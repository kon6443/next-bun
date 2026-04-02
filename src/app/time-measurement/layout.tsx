import type { Metadata } from 'next';
import { SITE_CONFIG } from '../config/siteConfig';

export const metadata: Metadata = {
  title: '시간 측정',
  description: '타이머와 다양한 애니메이션으로 시간을 시각적으로 확인하세요. 배터리, 궤도, 파도, 링 4가지 스타일.',
  openGraph: {
    title: `시간 측정 | ${SITE_CONFIG.name}`,
    description: '타이머와 다양한 애니메이션으로 시간을 시각적으로 확인하세요.',
    type: 'website',
    locale: SITE_CONFIG.locale,
  },
  keywords: ['타이머', '시간 측정', '온라인 타이머', '카운트다운', '시각 타이머', '뽀모도로', '집중 타이머', '스톱워치'],
  alternates: { canonical: '/time-measurement' },
};

export default function TimeMeasurementLayout({ children }: { children: React.ReactNode }) {
  return children;
}
