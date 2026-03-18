import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getOrCreateUser } from '@/lib/identity'
import { created } from '@/lib/response'
import { notFound, serverError, unauthorized, badRequest } from '@/lib/errors'

const schema = z.object({
  outcome: z.enum(['BOUGHT', 'SKIPPED', 'WAITING']),
  note: z.string().max(500).optional(),
})

// POST /api/items/:id/decision
// 提交用户最终决策
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
      include: { decision: true },
    })

    if (!item) return notFound('商品不存在')
    if (item.decision) return badRequest('该商品已有决策记录')

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? '参数错误')
    }

    const { outcome, note } = parsed.data

    const decision = await prisma.decision.create({
      data: { itemId: id, outcome, note },
    })

    await prisma.item.update({
      where: { id },
      data: { status: 'DECIDED' },
    })

    return created({ decisionId: decision.id, outcome: decision.outcome })
  } catch (e) {
    console.error('[decision POST]', e)
    return serverError()
  }
}
