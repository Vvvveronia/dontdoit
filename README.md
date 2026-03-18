# 先别买 · Backend

> 冷静消费决策工具 — 让冲动先停一停

基于 Next.js App Router + TypeScript + Prisma + PostgreSQL (Neon) 构建的全栈应用。

---

## 技术栈

- **框架**：Next.js 16 (App Router)
- **语言**：TypeScript
- **数据库**：PostgreSQL via Neon（云端托管）
- **ORM**：Prisma
- **AI 服务**：DeepSeek（分析）+ 通义千问 VL（图片识别）+ Tavily（搜索）
- **部署目标**：Sealos

---

## 快速开始（本地开发）

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 Neon DATABASE_URL 和 AI 服务 API Key
```

### 3. 初始化数据库

```bash
# 生成 Prisma Client
npx prisma generate

# 推送 Schema 到 Neon（生产环境用 migrate deploy）
npx prisma db push
```

### 4. 启动开发服务器

```bash
npm run dev
# 服务运行在 http://localhost:3000
```

---

## API 路由总览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/` | 前端页面 (index.html) |
| POST | `/api/upload` | 上传商品图片 |
| POST | `/api/items/recognize` | 预识别商品信息 |
| POST | `/api/items` | 创建商品记录 |
| GET  | `/api/items` | 获取商品列表 |
| GET  | `/api/items/:id` | 获取商品详情 |
| POST | `/api/items/:id/analysis` | 触发 AI 分析 |
| GET  | `/api/items/:id/analysis` | 获取分析结果（轮询） |
| POST | `/api/items/:id/cooldown` | 开启冷静期 |
| GET  | `/api/items/:id/cooldown` | 查询冷静期状态 |
| POST | `/api/items/:id/decision` | 提交最终决策 |
| GET  | `/api/stats` | 获取统计数据 |

---

## 身份识别

MVP 阶段使用匿名 `deviceId` 方案：

- 前端在 `localStorage` 生成并持久化一个 UUID 作为 `deviceId`
- 每次请求在 Header 中携带：`x-device-id: <uuid>`
- 后端自动 upsert 对应的 User 记录，无需登录

---

## 项目结构

```
backend/
├── app/
│   ├── api/
│   │   ├── upload/route.ts           # 图片上传
│   │   ├── items/
│   │   │   ├── route.ts              # GET / POST 商品列表
│   │   │   ├── recognize/route.ts    # POST 图片识别
│   │   │   └── [id]/
│   │   │       ├── route.ts          # GET 商品详情
│   │   │       ├── analysis/route.ts # GET / POST AI 分析
│   │   │       ├── cooldown/route.ts # GET / POST 冷静期
│   │   │       └── decision/route.ts # POST 最终决策
│   │   └── stats/route.ts            # GET 统计数据
│   └── route.ts                      # 前端页面入口
├── lib/
│   ├── prisma.ts     # Prisma Client 单例
│   ├── errors.ts     # 统一错误响应
│   ├── response.ts   # 统一成功响应
│   └── identity.ts   # 用户身份识别（deviceId）
├── prisma/
│   ├── schema.prisma # 数据库 Schema
│   └── migrations/   # 迁移记录
└── public/
    ├── index.html    # 前端页面
    └── uploads/      # 图片上传目录（本地，线上建议换对象存储）
```

---

## 部署

详见 [docs/deploy-sealos.md](docs/deploy-sealos.md)

---

## 数据库实体

| 实体 | 说明 |
|------|------|
| User | 用户（MVP 用 deviceId 匿名识别） |
| Item | 商品记录，整条链路的起点 |
| Analysis | AI 分析结果，与 Item 1:1 |
| Cooldown | 冷静期记录，与 Item 1:1 |
| Decision | 最终决策，与 Item 1:1 |

---

## 图片存储说明

当前图片上传到 `public/uploads/`（本地文件系统），适合面试演示。  
若需长期线上运行，建议迁移到对象存储（如阿里云 OSS / Cloudflare R2）。
