import { ImageResponse } from 'next/og';
import { SITE_CONFIG } from './config/siteConfig';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 280,
          background: SITE_CONFIG.themeColor,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: SITE_CONFIG.accentColor,
          borderRadius: 96,
        }}
      >
        {SITE_CONFIG.shortName}
      </div>
    ),
    { ...size },
  );
}
