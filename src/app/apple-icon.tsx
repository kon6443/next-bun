import { ImageResponse } from 'next/og';
import { SITE_CONFIG } from './config/siteConfig';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 100,
          background: SITE_CONFIG.themeColor,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: SITE_CONFIG.accentColor,
          borderRadius: 36,
        }}
      >
        {SITE_CONFIG.shortName}
      </div>
    ),
    { ...size },
  );
}
