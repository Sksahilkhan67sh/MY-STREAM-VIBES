/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  // Required for Socket.io + LiveKit WebSockets through Vercel
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'localhost:3001',
        '*.vercel.app',
        '*.onrender.com',
      ],
    },
  },

  // Allow images from common streaming / avatar CDNs
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'gravatar.com' },
    ],
  },

  // Silence the "X-Powered-By" header
  poweredByHeader: false,
};

module.exports = nextConfig;
