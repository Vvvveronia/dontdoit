import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getOrCreateUser } from '@/lib/identity'
import { ok, created } from '@/lib/response'
import { badRequest, serverError, unauthorized } from '@/lib/errors'

// ─── POST /api/items ───────────────────────────────────────────
// 创建一条新的商品记录
const createSchema = z.object({
  name: z.string().min(1, '商品名称不能为空').max(200),
  price: z.number().positive('价格必须大于 0'),
  inputType: z.enum(['MANUAL', 'IMAGE', 'LINK']),
  imageUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  category: z.string().optional(),
  reason: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateUser(req)
    if (!user) return unauthorized('请提供设备标识（x-device-id）')

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? '参数错误')
    }

    const item = await prisma.item.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        price: parsed.data.price,
        inputType: parsed.data.inputType,
        imageUrl: parsed.data.imageUrl,
        sourceUrl: parsed.data.sourceUrl,
        category: parsed.data.category,
        reason: parsed.data.reason,
        status: 'PENDING',
      },
    })

    return created({ itemId: item.id, status: item.status })
  } catch (e) {
    console.error('[items POST]', e)
    return serverError()
  }
}

// ─── GET /api/items ────────────────────────────────────────────
// 获取当前用户的商品记录列表
export async function GET(req: NextRequest) {
  try {
    const user = await getOrCreateUser(req)
    if (!user) return unauthorized('请提供设备标识（x-device-id）')

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') ?? undefined
    const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100)
    const offset = Number(searchParams.get('offset') ?? 0)

    const items = await prisma.item.findMany({
      where: {
        userId: user.id,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        analysis: { select: { id: true, createdAt: true } },
        cooldown: { select: { expiresAt: true } },
        decision: { select: { outcome: true } },
      },
    })

    return ok({ items })
  } catch (e) {
    console.error('[items GET]', e)
    return serverError()
  }
}
