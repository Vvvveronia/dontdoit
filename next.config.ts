import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 适合容器部署（Sealos / Docker）
  output: 'standalone',

  // 构建时跳过类型检查（加快 CI 构建速度）
  typescript: {
    ignoreBuildErrors: true,
  },

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
