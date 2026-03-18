import { NextRequest } from 'next/server'
import { ok } from '@/lib/response'
import { serverError } from '@/lib/errors'
import { join } from 'path'
import { readFile } from 'fs/promises'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.type === 'IMAGE' && (body.imageUrl || body.localPath)) {
      const result = await recognizeWithQwen(body.imageUrl || body.localPath)
      return ok(result)
    }
    return ok({ name: '', category: null, estimatedPrice: null, description: '' })
  } catch (e) {
    console.error('[recognize]', e)
    return serverError()
  }
}

async function recognizeWithQwen(imageUrl: string) {
  const apiKey = process.env.QWEN_API_KEY
  const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  if (!apiKey) {
    console.warn('[recognize] QWEN_API_KEY not set')
    return { name: '', category: null, estimatedPrice: null, description: '' }
  }

  try {
    let imageContent: any

    if (imageUrl.startsWith('/uploads/')) {
      // 本地文件转 base64
      const filePath = join(process.cwd(), 'public', imageUrl)
      const buffer = await readFile(filePath)
      const base64 = buffer.toString('base64')
      let mimeType = 'image/jpeg'
      if (imageUrl.endsWith('.png')) mimeType = 'image/png'
      if (imageUrl.endsWith('.webp')) mimeType = 'image/webp'
      imageContent = { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
    } else {
      // 远程 URL 直接用
      imageContent = { type: 'image_url', image_url: { url: imageUrl } }
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-vl-plus',
        messages: [{
          role: 'user',
          content: [
            imageContent,
            {
              type: 'text',
              text: '请识别图片中的商品，用JSON格式回答（只输出JSON，不要其他内容）：{"name":"商品完整名称，包含品牌、颜色、款式，15-40字","category":"服饰/数码/美妆/家居/奢侈品/运动/食品/其他","description":"外观特征描述20-40字","estimatedPrice":预估人民币售价数字或null}',
            },
          ],
        }],
        max_tokens: 300,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      const err = await res.text()
      console.warn('[qwen recognize]', res.status, err)
      return { name: '', category: null, estimatedPrice: null, description: '' }
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    console.log('[qwen recognize result]', text)

    // 清理可能的 markdown 包裹
    const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/g, '').trim()
    const parsed = JSON.parse(jsonStr)

    return {
      name: parsed.name || '',
      category: parsed.category || null,
      estimatedPrice: typeof parsed.estimatedPrice === 'number' ? parsed.estimatedPrice : null,
      description: parsed.description || '',
    }
  } catch (e) {
    console.warn('[recognizeWithQwen]', e)
    return { name: '', category: null, estimatedPrice: null, description: '' }
  }
}
