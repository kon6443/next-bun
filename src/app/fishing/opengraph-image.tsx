import { ImageResponse } from 'next/og';
import { SITE_CONFIG } from '../config/siteConfig';

export const alt = '낚시 게임 | ' + SITE_CONFIG.name;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0f172a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 100, marginBottom: 16 }}>🎣</div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#38bdf8',
            marginBottom: 12,
          }}
        >
          낚시 게임
        </div>
        <div style={{ fontSize: 28, color: '#94a3b8' }}>
          브라우저에서 바로 즐기는 방치형 멀티플레이어 낚시
        </div>
      </div>
    ),
    { ...size },
  );
}
