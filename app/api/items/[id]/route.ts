import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOrCreateUser } from '@/lib/identity'
import { ok } from '@/lib/response'
import { notFound, serverError, unauthorized } from '@/lib/errors'

// ─── GET /api/items/:id ────────────────────────────────────────
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
      include: { analysis: true, cooldown: true, decision: true },
    })
    if (!item) return notFound('商品不存在')
    return ok({ item })
  } catch (e) {
    console.error('[items/:id GET]', e)
    return serverError()
  }
}

// ─── DELETE /api/items/:id ─────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateUser(req)
    if (!user) return unauthorized('请提供设备标识')
    const { id } = await params
    const item = await prisma.item.findFirst({ where: { id, userId: user.id } })
    if (!item) return notFound('商品不存在')
    await prisma.item.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (e) {
    console.error('[items/:id DELETE]', e)
    return serverError()
  }
}

