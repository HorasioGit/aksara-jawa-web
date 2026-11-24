/** @type {import('next').NextConfig} */
const longCache = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];

const nextConfig = {
  async headers() {
    return [
      { source: '/models/:path*', headers: longCache },
      { source: '/vendor/:path*', headers: longCache },
    ];
  },
};
export default nextConfig;
