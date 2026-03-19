FROM node:20-alpine AS base
WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci

# 复制代码并生成 Prisma Client
COPY . .
RUN npx prisma generate

# 构建
RUN npm run build

# 生产镜像（使用 standalone 输出）
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 复制 standalone 产物
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=base /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

CMD ["node", "server.js"]
