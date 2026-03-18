import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOrCreateUser } from '@/lib/identity'
import { ok, created } from '@/lib/response'
import { notFound, serverError, unauthorized, badRequest } from '@/lib/errors'
import { join } from 'path'
import { readFile } from 'fs/promises'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateUser(req)
    if (!user) return unauthorized('请提供设备标识')
    const { id } = await params
    const item = await prisma.item.findFirst({
      where: { id, userId: user.id },
      include: { analysis: true },
    })
    if (!item) return notFound('商品不存在')
    if (item.analysis) return ok({ analysisId: item.analysis.id, status: 'ANALYZED' })
    await prisma.item.update({ where: { id }, data: { status: 'ANALYZING' } })
    triggerAnalysis(item).catch((e) => console.error('[analysis trigger]', e))
    return created({ analysisId: null, status: 'ANALYZING' })
  } catch (e) {
    console.error('[analysis POST]', e)
    return serverError()
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateUser(req)
    if (!user) return unauthorized('请提供设备标识')
    const { id } = await params
    const item = await prisma.item.findFirst({
      where: { id, userId: user.id },
      include: { analysis: true },
    })
    if (!item) return notFound('商品不存在')
    return ok({ status: item.status, analysis: item.analysis ?? null })
  } catch (e) {
    console.error('[analysis GET]', e)
    return serverError()
  }
}

// ─── 主分析流程 ────────────────────────────────────────────────
async function triggerAnalysis(item: any) {
  const { id: itemId, name, price, category, imageUrl, reason } = item
  try {
    // 1. DeepSeek 看图（如果有图片）
    let visualDescription = ''
    if (imageUrl) {
      visualDescription = await describeImageWithDeepSeek(imageUrl)
      console.log('[visual]', visualDescription)
    }

    // 用视觉描述或商品名作为搜索词
    const productQuery = visualDescription || name

    // 2. 搜索：Tavily 多维度 + Jina 抓电商
    const [reviewResults, altResults, tPrice1, tPrice2, jinaPrice] = await Promise.all([
      searchWithTavily(`${productQuery} 评价 缺点 吐槽 使用感受`),
      searchWithTavily(`${productQuery} 平替 替代品 类似款 推荐 多少钱`),
      searchWithTavily(`"${productQuery}" 官方售价 原价 正品价格 多少钱`),
      searchWithTavily(`site:item.taobao.com OR site:jd.com OR site:pinduoduo.com ${productQuery} 价格`),
      fetchEcommercePrices(productQuery),
    ])

    console.log('[search] review:', reviewResults.length, 'alt:', altResults.length, 'price1:', tPrice1.length, 'price2:', tPrice2.length)

    const combinedPriceContext = [
      tPrice1.length ? `【价格搜索1】\n${tPrice1.join('\n')}` : '',
      tPrice2.length ? `【价格搜索2】\n${tPrice2.join('\n')}` : '',
      jinaPrice ? `【电商页面数据】\n${jinaPrice.slice(0, 3000)}` : '',
    ].filter(Boolean).join('\n\n')

    // 3. DeepSeek 综合分析
    const result = await callDeepSeekAnalysis({
      name,
      price,
      category,
      visualDescription,
      reason,
      priceContext: combinedPriceContext,
      reviewContext: reviewResults.join('\n'),
      altContext: altResults.join('\n'),
    })

    await prisma.analysis.create({
      data: {
        itemId,
        priceAnalysis: result.priceAnalysis,
        pros: result.pros,
        cons: result.cons,
        alternatives: result.alternatives,
        calmAdvice: result.calmAdvice,
      },
    })
    await prisma.item.update({ where: { id: itemId }, data: { status: 'ANALYZED' } })
  } catch (e) {
    console.error('[triggerAnalysis]', e)
    await prisma.item.update({ where: { id: itemId }, data: { status: 'PENDING' } })
    throw e
  }
}

// ─── 千问 VL 看图描述商品 ─────────────────────────────────────
async function describeImageWithDeepSeek(imageUrl: string): Promise<string> {
  const apiKey = process.env.QWEN_API_KEY
  const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  if (!apiKey) return ''
  try {
    let imageContent: any
    if (imageUrl.startsWith('/uploads/')) {
      const buf = await readFile(join(process.cwd(), 'public', imageUrl))
      const base64 = buf.toString('base64')
      let mimeType = 'image/jpeg'
      if (imageUrl.endsWith('.png')) mimeType = 'image/png'
      if (imageUrl.endsWith('.webp')) mimeType = 'image/webp'
      imageContent = { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
    } else {
      imageContent = { type: 'image_url', image_url: { url: imageUrl } }
    }
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'qwen-vl-plus',
        messages: [{
          role: 'user',
          content: [
            imageContent,
            { type: 'text', text: '这是什么商品？请用30字以内描述品牌、品类、颜色、款式。只输出描述，不要其他内容。' },
          ],
        }],
        max_tokens: 100,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return ''
    const d = await res.json()
    return d.choices?.[0]?.message?.content?.trim() || ''
  } catch (e) {
    console.warn('[describeImage]', e)
    return ''
  }
}

// ─── Tavily 搜索 ───────────────────────────────────────────────
async function searchWithTavily(query: string): Promise<string[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 3, include_answer: true }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    const out: string[] = []
    if (data.answer) out.push(data.answer)
    for (const r of (data.results || [])) if (r.content) out.push(r.content.slice(0, 400))
    return out
  } catch (e) {
    console.warn('[tavily]', e)
    return []
  }
}

// ─── Jina Reader 抓电商价格 ────────────────────────────────────
async function fetchEcommercePrices(productName: string): Promise<string> {
  try {
    const encoded = encodeURIComponent(productName)
    const sources = [
      // 新品电商
      { name: '淘宝', url: `https://r.jina.ai/https://s.taobao.com/search?q=${encoded}&sort=sale-desc` },
      { name: '京东', url: `https://r.jina.ai/https://search.jd.com/Search?keyword=${encoded}&enc=utf-8` },
      { name: '拼多多', url: `https://r.jina.ai/https://mobile.yangkeduo.com/search_result.html?search_key=${encoded}` },
      // 二手平台
      { name: '闲鱼', url: `https://r.jina.ai/https://www.goofish.com/search?q=${encoded}` },
      { name: '转转', url: `https://r.jina.ai/https://www.zhuanzhuan.com/search/recommend/all?kw=${encoded}` },
    ]
    const results = await Promise.allSettled(
      sources.map(({ name, url }) =>
        fetch(url, {
          headers: {
            'Accept': 'text/plain',
            'X-Return-Format': 'text',
            'X-Timeout': '10',
          },
          signal: AbortSignal.timeout(12000),
        }).then(r => r.text()).then(t => ({ name, text: t.slice(0, 1500) }))
      )
    )
    const sections: string[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.text) {
        sections.push(`【${r.value.name}搜索结果】\n${r.value.text}`)
      }
    }
    return sections.join('\n---\n')
  } catch (e) {
    console.warn('[jina prices]', e)
    return ''
  }
}

// ─── DeepSeek 综合分析 ─────────────────────────────────────────
async function callDeepSeekAnalysis({
  name, price, category, visualDescription, reason, priceContext, reviewContext, altContext
}: any) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置')

  const productDesc = visualDescription || name

  const prompt = `你是帮用户做理性消费决策的顾问。请结合搜索数据和你自己的知识综合分析。

【商品信息】
名称：${name}
外观/视觉描述：${visualDescription || '无图片'}
最终确认商品名（以此为准）：${name}
用户买入价：¥${price}
类别：${category || '未知'}
用户购买原因/心理：${reason || '未提供'}

【来自淘宝/京东/拼多多/闲鱼/转转的真实数据】
${priceContext || '暂无数据'}

【来自互联网的真实用户评价】
${reviewContext || '暂无数据'}

【来自互联网的平替/替代品信息】
${altContext || '暂无数据'}

请输出以下JSON（不要输出任何其他内容）：
{
  "priceAnalysis": {
    "userPrice": ${price},
    "marketAvgPrice": 优先从搜索数据提取淘宝/京东均价，数据不足时用你自己的知识给出合理估价（数字，不能为null），
    "secondHandPrice": 从闲鱼/转转数据提取二手均价，无数据填null,
    "pddPrice": 从拼多多数据提取最低价，无数据填null,
    "assessment": "25字以内说明用户出价是否合理，要有明确判断"
  },
  "pros": [
    "结合搜索数据和你的知识，写${name}这个商品真实的种草点，15-25字，要具体",
    "第二个种草点，要和第一个不同角度",
    "第三个种草点"
  ],
  "cons": [
    "结合搜索数据和你的知识，写${name}真实的缺点或用户常见槽点，同时结合用户购买原因'${reason || '未提供'}'指出潜在风险，15-25字",
    "第二个缺点",
    "第三个缺点"
  ],
  "alternatives": [
    {"name": "与${name}完全同品类的真实平替商品完整名称", "price": 该商品在电商平台的实际售价数字（必填，不能为null）, "reason": "为何适合作为平替，15字以内"},
    {"name": "第二个同品类平替完整名称", "price": 实际售价数字（必填）, "reason": "理由15字以内"}
  ],
  "calmAdvice": "结合用户购买原因'${reason || '未提供'}'和商品特点，给出80字个性化冷静建议，不说教，有态度"
}

严格要求：
1. 所有分析必须针对【${name}】这个具体商品，不能分析其他品类
2. alternatives必须与${name}同品类（服饰配服饰，电子产品配电子产品），price字段必须填写具体数字
3. pros和cons要结合搜索数据+你的知识，不能只靠搜索数据，也不能只靠想象
4. 价格从电商数据提取，无数据填null（但alternatives的price必须填）`

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是理性消费决策顾问。严格按JSON格式输出。pros/cons/alternatives必须与用户描述的商品强相关，平替必须是同品类商品。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(40000),
  })

  if (!response.ok) throw new Error(`DeepSeek: ${response.status} ${await response.text()}`)

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 返回为空')

  const parsed = JSON.parse(content)
  const pa = parsed.priceAnalysis || {}

  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives.map((a: any) =>
        typeof a === 'object' ? `${a.name}｜¥${a.price}｜${a.reason}` : String(a)
      )
    : []

  return {
    priceAnalysis: JSON.stringify(pa),
    pros: Array.isArray(parsed.pros) ? parsed.pros : [],
    cons: Array.isArray(parsed.cons) ? parsed.cons : [],
    alternatives,
    calmAdvice: parsed.calmAdvice || '',
  }
}
