FROM node:20-alpine AS builder
WORKDIR /app

# 安装依赖（不跳过 scripts，Prisma 需要 postinstall）
COPY package*.json ./
RUN npm ci

# 复制代码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 构建
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://user:pass@localhost:5432/db
ENV NODE_ENV=production
RUN npm run build

# 生产镜像
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

CMD ["node", "server.js"]
