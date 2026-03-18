# 先别买 · Sealos 部署指南

> 目标：以最小改动将项目部署到 Sealos，用于面试演示。

---

## 1. 项目简介

「先别买」是一款移动端优先的冷静消费决策工具。用户输入想买的商品，AI 分析价格是否合理、列出种草/拔草点、推荐平替，并支持开启冷静期后再做决策。

---

## 2. 当前部署架构

```
┌─────────────────────────────────────────┐
│              Sealos                     │
│  ┌─────────────────────────────────┐   │
│  │   Next.js App (前端 + 后端 API) │   │
│  │   next start  · port 3000       │   │
│  └──────────────────┬──────────────┘   │
│                     │ Prisma ORM        │
└─────────────────────┼───────────────────┘
                      │
              ┌───────▼────────┐
              │  Neon PG (云端) │
              └────────────────┘
```

- **前后端**：同一个 Next.js 项目，API Routes 承担全部后端逻辑
- **数据库**：Neon PostgreSQL（已托管，无需自建）
- **图片存储**：当前存本地 `public/uploads/`，适合演示；长期运行建议迁移对象存储
- **AI 服务**：DeepSeek + 通义千问 VL + Tavily（外部 API，按需配置）

---

## 3. 部署前检查清单

- [ ] `DATABASE_URL` 已填写 Neon 连接字符串（含 `?sslmode=require`）
- [ ] `DEEPSEEK_API_KEY` 已填写（AI 分析核心依赖）
- [ ] `QWEN_API_KEY` 已填写（图片识别，可选）
- [ ] `TAVILY_API_KEY` 已填写（搜索增强，可选）
- [ ] `next.config.ts` 已设置 `output: 'standalone'`（已完成）
- [ ] `.gitignore` 已排除 `.env`、`node_modules`、`.next`、`public/uploads/*`
- [ ] Prisma migrations 已跑通（`npx prisma migrate deploy`）
- [ ] 本地 `npm run build` 通过无报错

---

## 4. 必要环境变量

| 变量名 | 类型 | 说明 | 是否必填 |
|--------|------|------|----------|
| `DATABASE_URL` | 服务端私密 | Neon PostgreSQL 连接字符串 | **必填** |
| `DEEPSEEK_API_KEY` | 服务端私密 | DeepSeek 分析 API Key | **必填**（AI 功能） |
| `DEEPSEEK_BASE_URL` | 服务端私密 | DeepSeek 接口地址，默认 `https://api.deepseek.com` | 可选 |
| `QWEN_API_KEY` | 服务端私密 | 通义千问 VL 图片识别 Key | 可选 |
| `QWEN_BASE_URL` | 服务端私密 | 千问接口地址 | 可选 |
| `TAVILY_API_KEY` | 服务端私密 | Tavily 搜索 API Key | 可选 |

> 所有变量均为服务端私密变量，不需要 `NEXT_PUBLIC_` 前缀，不会暴露到浏览器。

---

## 5. Prisma / 数据库迁移注意事项

### 首次部署前（本地执行）

```bash
cd backend

# 确认连接 Neon 正常
npx prisma db pull

# 将现有 migrations 应用到 Neon
npx prisma migrate deploy

# 验证表结构
npx prisma studio
```

### 生产环境迁移原则

- 生产环境**只用** `migrate deploy`，不用 `migrate dev`
- `migrate dev` 会重置数据，仅限本地开发使用
- 新增字段时，先写 migration，测试后再部署
- Neon 已内置连接池，`DATABASE_URL` 直接使用 Neon 提供的连接字符串即可

---

## 6. Sealos 部署步骤

### 方式一：通过 Sealos App Launchpad（推荐，最快）

1. 登录 [Sealos Cloud](https://cloud.sealos.io)
2. 进入 **App Launchpad** → 新建应用
3. 填写配置：
   - **镜像**：选择「从 GitHub 部署」或上传代码
   - **构建命令**：`npm install && npx prisma generate && npm run build`
   - **启动命令**：`npm start`
   - **端口**：`3000`
4. 在「环境变量」中填入所有必要变量（见第 4 节）
5. 点击部署，等待构建完成

### 方式二：Docker 部署（next.config 已启用 standalone）

```bash
# 在 backend/ 目录
npm run build

# standalone 产物位于 .next/standalone/
# 启动：
node .next/standalone/server.js
```

> Sealos 支持直接部署 Node.js 应用，无需手写 Dockerfile。
> 如需 Dockerfile，可在 `backend/` 根目录创建，基础版如下：

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", ".next/standalone/server.js"]
```

---

## 7. 上线后验证清单

```bash
# 替换为你的实际域名
BASE_URL="https://your-app.sealos.io"

# 1. 服务是否正常响应
curl $BASE_URL

# 2. 数据库连接是否正常（创建一条测试商品）
curl -X POST $BASE_URL/api/items \
  -H 'Content-Type: application/json' \
  -H 'x-device-id: test-device-001' \
  -d '{"name":"测试商品","price":99,"inputType":"MANUAL"}'

# 3. 统计接口
curl $BASE_URL/api/stats \
  -H 'x-device-id: test-device-001'

# 4. 检查返回的 JSON 结构是否正常
```

验证要点：
- [ ] 首页正常加载（HTML 返回正常）
- [ ] `POST /api/items` 成功创建记录（返回 `itemId`）
- [ ] `GET /api/stats` 返回统计数据
- [ ] `POST /api/items/:id/analysis` 触发分析（返回 `status: ANALYZING`）
- [ ] 数据库中可查到对应记录（Neon 控制台验证）

---

## 8. 当前部署条件结论

### ✅ 已具备部署条件

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `package.json` scripts | ✅ | 包含 `dev` / `build` / `start` |
| Next.js 版本 | ✅ | 16.x，支持 App Router |
| Prisma Schema | ✅ | 完整，已有 migrations |
| 数据库 | ✅ | 接入 Neon，读取 `DATABASE_URL` 环境变量 |
| `output: standalone` | ✅ | 已配置，适合容器部署 |
| 环境变量管理 | ✅ | 无硬编码敏感信息，均通过 `process.env` 读取 |
| `.gitignore` | ✅ | 已排除 `.env`、`node_modules`、`.next`、上传图片 |

### ⚠️ 部署时注意

| 注意点 | 说明 |
|--------|------|
| 图片上传 | 当前存本地 `public/uploads/`，容器重启后**会丢失**。演示可接受，长期运行需接入对象存储 |
| AI Key 配置 | `DEEPSEEK_API_KEY` 未配置时，AI 分析功能不可用，需在 Sealos 环境变量中填写 |
| 首次迁移 | 部署前需在本地执行 `npx prisma migrate deploy` 确保 Neon 表结构正确 |

---

*文档生成于项目部署准备阶段，基于当前代码状态。*
