/**
 * 사이트 전역 설정 — 앱 이름 변경 시 이 파일만 수정하면 됩니다.
 * metadata, manifest, OG 태그 등에서 공통 참조합니다.
 */
export const SITE_CONFIG = {
  name: 'FiveSouth',
  shortName: '5S',
  url: process.env.NEXT_PUBLIC_DOMAIN?.replace(/\/$/, '') ?? 'https://fivesouth.duckdns.org',
  description: '팀 협업, 태스크 관리, 그리고 방치형 낚시 게임까지.',
  locale: 'ko_KR',
  themeColor: '#0f172a',
  accentColor: '#38bdf8',
} as const;
