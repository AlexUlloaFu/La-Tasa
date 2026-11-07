import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ponytail: proxy local al Nest; cuando haya deploy, usar env API_URL.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:3124'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
