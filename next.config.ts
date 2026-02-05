import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  compiler: {
    // styled-jsx 비활성화 (React 19 호환성 문제 해결)
    styledJsx: false,
  },
};

export default nextConfig;
