import type { NextConfig } from 'next';

// The browser calls /api/*, which Next.js forwards to the backend: same origin, no CORS.
const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
