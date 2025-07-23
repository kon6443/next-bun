import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/next-api/:path*',
        destination: '/api/:path*',
      },
    ];
  },
};

export default nextConfig;
