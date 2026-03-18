import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOrCreateUser } from '@/lib/identity'
import { ok } from '@/lib/response'
import { serverError, unauthorized } from '@/lib/errors'

// ─── GET /api/stats ────────────────────────────────────────────
// 获取当前用户的消费行为统计
export async function GET(req: NextRequest) {
  try {
    const user = await getOrCreateUser(req)
    if (!user) return unauthorized('请提供设备标识（x-device-id）')

    const userId = user.id

    // 所有商品记录
    const items = await prisma.item.findMany({
      where: { userId },
      include: { decision: true },
    })

    const totalItems = items.length

    // 忍住次数：最终决策为 SKIPPED
    const resistedItems = items.filter((i: typeof items[number]) => i.decision?.outcome === 'SKIPPED')
    const resistedCount = resistedItems.length

    // 节省金额：SKIPPED 商品的价格总和
    const savedAmount = resistedItems.reduce((sum: number, i: typeof items[number]) => sum + i.price, 0)

    // 购买次数
    const boughtCount = items.filter((i: typeof items[number]) => i.decision?.outcome === 'BOUGHT').length

    // 高发类别：按 category 分组统计（只统计有 SKIPPED 决策的）
    const categoryMap: Record<string, number> = {}
    for (const item of resistedItems) {
      const cat = item.category ?? '未分类'
      categoryMap[cat] = (categoryMap[cat] ?? 0) + 1
    }
    const topCategories = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }))

    // 高发时间：按创建时间的小时统计冲动消费
    const hourMap: Record<number, number> = {}
    for (const item of items) {
      const hour = item.createdAt.getHours()
      hourMap[hour] = (hourMap[hour] ?? 0) + 1
    }
    const peakHours = Object.entries(hourMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour, count]) => ({ hour: Number(hour), count }))

    return ok({
      totalItems,
      resistedCount,
      savedAmount: Math.round(savedAmount * 100) / 100,
      boughtCount,
      topCategories,
      peakHours,
    })
  } catch (e) {
    console.error('[stats GET]', e)
    return serverError()
  }
}
