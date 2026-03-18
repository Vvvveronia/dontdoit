import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getOrCreateUser } from '@/lib/identity'
import { ok, created } from '@/lib/response'
import { notFound, serverError, unauthorized, badRequest } from '@/lib/errors'

const createSchema = z.object({
  duration: z.union([z.literal(24), z.literal(48), z.literal(72)]),
})

// ─── POST /api/items/:id/cooldown ─────────────────────────────
// 为指定商品开启冷静期
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateUser(req)
    if (!user) return unauthorized('请提供设备标识（x-device-id）')

    const { id } = await params

    const item = await prisma.item.findFirst({
      where: { id, userId: user.id },
      include: { cooldown: true },
    })

    if (!item) return notFound('商品不存在')
    if (item.cooldown) return badRequest('该商品已有冷静期记录')

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? '参数错误')
    }

    const { duration } = parsed.data
    const startedAt = new Date()
    const expiresAt = new Date(startedAt.getTime() + duration * 60 * 60 * 1000)

    const cooldown = await prisma.cooldown.create({
      data: { itemId: id, duration, startedAt, expiresAt },
    })

    await prisma.item.update({
      where: { id },
      data: { status: 'COOLING' },
    })

    return created({
      cooldownId: cooldown.id,
      expiresAt: cooldown.expiresAt.toISOString(),
    })
  } catch (e) {
    console.error('[cooldown POST]', e)
    return serverError()
  }
}

// ─── GET /api/items/:id/cooldown ──────────────────────────────
// 查询冷静期状态（前端用于倒计时）
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateUser(req)
    if (!user) return unauthorized('请提供设备标识（x-device-id）')

    const { id } = await params

    const item = await prisma.item.findFirst({
      where: { id, userId: user.id },
      include: { cooldown: true },
    })

    if (!item) return notFound('商品不存在')
    if (!item.cooldown) return notFound('尚未开启冷静期')

    const now = new Date()
    const isExpired = now >= item.cooldown.expiresAt
    const remainingMs = Math.max(0, item.cooldown.expiresAt.getTime() - now.getTime())

    return ok({
      expiresAt: item.cooldown.expiresAt.toISOString(),
      duration: item.cooldown.duration,
      isExpired,
      remainingMs,
    })
  } catch (e) {
    console.error('[cooldown GET]', e)
    return serverError()
  }
}
