import { ImageResponse } from 'next/og';
import { SITE_CONFIG } from './config/siteConfig';

export const alt = SITE_CONFIG.name;
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
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            color: '#38bdf8',
            marginBottom: 16,
          }}
        >
          {SITE_CONFIG.name}
        </div>
        <div
          style={{
            fontSize: 32,
            color: '#94a3b8',
          }}
        >
          {SITE_CONFIG.description}
        </div>
      </div>
    ),
    { ...size },
  );
}
