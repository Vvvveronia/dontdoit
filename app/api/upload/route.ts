import { NextRequest } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { created } from '@/lib/response'
import { badRequest, serverError } from '@/lib/errors'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return badRequest('请上传文件')
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return badRequest('仅支持 JPG、PNG、WebP、GIF 格式')
    }

    if (file.size > 10 * 1024 * 1024) {
      return badRequest('文件大小不能超过 10MB')
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const ext = file.type.split('/')[1]
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const uploadDir = join(process.cwd(), 'public', 'uploads')

    await mkdir(uploadDir, { recursive: true })
    await writeFile(join(uploadDir, filename), buffer)

    return created({ url: `/uploads/${filename}` })
  } catch (e) {
    console.error('[upload]', e)
    return serverError()
  }
}
