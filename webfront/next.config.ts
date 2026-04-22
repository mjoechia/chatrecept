import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  generateBuildId: () => String(Date.now()),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
