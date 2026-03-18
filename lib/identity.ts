import { NextRequest } from 'next/server'
import { prisma } from './prisma'

/**
 * MVP 阶段身份识别：从请求头读取 x-device-id
 * 若用户不存在则自动创建（匿名用户）
 */
export async function getOrCreateUser(req: NextRequest) {
  const deviceId = req.headers.get('x-device-id')

  if (!deviceId) {
    return null
  }

  const user = await prisma.user.upsert({
    where: { deviceId },
    update: {},
    create: { deviceId },
  })

  return user
}
