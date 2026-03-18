import { NextResponse } from 'next/server'

export type ApiError = {
  code: string
  message: string
}

export function errorResponse(message: string, code: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status }
  )
}

export function badRequest(message: string) {
  return errorResponse(message, 'BAD_REQUEST', 400)
}

export function notFound(message = '资源不存在') {
  return errorResponse(message, 'NOT_FOUND', 404)
}

export function serverError(message = '服务器内部错误') {
  return errorResponse(message, 'INTERNAL_ERROR', 500)
}

export function unauthorized(message = '未授权') {
  return errorResponse(message, 'UNAUTHORIZED', 401)
}
