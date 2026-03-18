import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 适合容器部署（Sealos / Docker）
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,x-device-id' },
        ],
      },
    ]
  },

  serverExternalPackages: ['@prisma/client'],
}

export default nextConfig
