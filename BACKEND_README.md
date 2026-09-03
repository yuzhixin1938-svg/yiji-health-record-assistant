# 医记后端

当前状态：阶段 0 工程骨架完成；阶段 1 已完成登录会话、家庭成员授权、本人建档、初始化任务、病历资料上传/核对/归档、药品、指标、待办、就诊资料包和关键写操作审计基础接口。

## 已实现

- NestJS 11 + TypeScript 6 API 骨架。
- Prisma 7 + PostgreSQL 初始数据模型。
- 用户、登录身份、会话、家庭、成员、成员权限、同意记录和审计事件表。
- 请求 ID、统一错误格式和不读取请求正文的结构化访问日志。
- 健康检查接口。
- Prisma 数据库连接服务。
- Redis `PING` 就绪检查。
- 初始数据库迁移：`prisma/migrations/20260706195000_init/migration.sql`。
- 登录与家庭授权迁移：`prisma/migrations/20260706212000_auth_family_api/migration.sql`。
- 本人建档与病历资料迁移：`prisma/migrations/20260706223000_onboarding_records/migration.sql`。
- 药品、指标、待办、就诊资料包迁移：`prisma/migrations/20260706233000_care_loop/migration.sql`。
- 默认拒绝的成员权限判定及越权测试。
- 短信验证码模拟接口，验证码只存哈希。
- Bearer 会话创建、校验、当前会话撤销和全部会话撤销。
- 家庭成员、邀请和授权 API。
- 本人健康档案补全 API。
- 初始化任务 API。
- 病历资料本地上传、模拟识别、用户核对和归档 API。
- 识别任务和字段级追溯表：当前为文件名/规则 mock 识别，后续可替换为真实 OCR / AI。
- 药品与服药计划 API。
- 指标记录与趋势 API。
- 待办 API。
- 就诊资料包结构化生成 API。
- 关键写操作审计写入。
- 本地 PostgreSQL 与 Redis 容器配置。
- npm 依赖审计通过；通过 `overrides` 固定 `multer` 与 `@hono/node-server` 的安全修复版本。

## 本地启动

前提：Node.js 24、npm，以及可选的 Docker Desktop。

```powershell
Copy-Item .env.example .env
npm install
npm run prisma:generate
docker compose up -d
npm run prisma:migrate
npm run start:dev
```

接口：

- `GET http://127.0.0.1:3001/v1/health/live`
- `GET http://127.0.0.1:3001/v1/health/ready`

登录：

- `POST /v1/auth/sms/send`
- `POST /v1/auth/sms/verify`
- `POST /v1/auth/logout`
- `DELETE /v1/auth/sessions`

本人建档与初始化：

- `GET /v1/onboarding/status`
- `GET /v1/onboarding/tasks`
- `POST /v1/onboarding/profile`
- `GET /v1/profile/me`
- `PATCH /v1/profile/me`

病历资料：

- `GET /v1/records`
- `GET /v1/records/:recordId`
- `GET /v1/records/:recordId/recognition`
- `POST /v1/records/upload`
- `PATCH /v1/records/:recordId/review`
- `POST /v1/records/:recordId/archive`
- `POST /v1/records/:recordId/recognition/rerun`

药品：

- `GET /v1/medicines`
- `POST /v1/medicines`
- `PATCH /v1/medicines/:medicineId`
- `POST /v1/medicines/:medicineId/stop`

指标：

- `GET /v1/metrics`
- `POST /v1/metrics`
- `GET /v1/metrics/trends`

待办：

- `GET /v1/todos`
- `POST /v1/todos`
- `PATCH /v1/todos/:todoId`
- `POST /v1/todos/:todoId/complete`

就诊资料包：

- `GET /v1/visit-packs`
- `POST /v1/visit-packs`
- `GET /v1/visit-packs/:packId`
- `POST /v1/visit-packs/:packId/generate`

家庭成员：

- `GET /v1/households/current`
- `GET /v1/members`
- `POST /v1/members`
- `POST /v1/members/:memberId/invitations`
- `POST /v1/invitations/:token/accept`
- `GET /v1/members/:memberId/access`
- `PATCH /v1/members/:memberId/access/:userId`

`ready` 接口会真实检查 PostgreSQL 和 Redis：

- 两者都可用：HTTP 200，`{"status":"ok"}`。
- 任一不可用：HTTP 503，并在 `checks.database` 或 `checks.redis` 中标记 `error`。

当前机器如果没有安装 Docker，可以先验证 API 能启动；`ready` 会返回 503，这是预期行为，不代表 API 启动失败。

## 数据库迁移

```powershell
$env:DATABASE_URL='postgresql://yiji:yiji_local_only@localhost:5432/yiji?schema=public'
npm run prisma:migrate
```

迁移文件由 Prisma schema 生成，并已与当前 schema 进行哈希一致性校验。

## 验证

```powershell
npm run check
```

该命令依次验证 Prisma 数据模型、TypeScript 构建和权限测试。

如只做快速检查：

```powershell
npm run prisma:validate
npm run build
npm test
npm audit --omit=dev
```

## 上传第一份资料的测试顺序

1. 调用 `POST /v1/auth/sms/send`，响应里会返回开发用 `mockCode`。
2. 调用 `POST /v1/auth/sms/verify`，拿到 `accessToken`。
3. 后续请求加请求头：`Authorization: Bearer <accessToken>`。
4. 调用 `POST /v1/onboarding/profile` 补全本人档案。
5. 用 `multipart/form-data` 调用 `POST /v1/records/upload`，字段名为 `file`。
6. 查看返回的 `extractedFields`，这是当前阶段的模拟识别结果。
7. 调用 `PATCH /v1/records/:recordId/review` 核对字段。
8. 调用 `POST /v1/records/:recordId/archive` 归档。
9. 调用 `POST /v1/medicines` 添加正在使用的药品和服药计划。
10. 调用 `POST /v1/metrics` 记录一次指标。
11. 调用 `POST /v1/todos` 设置复查、用药或资料核对待办。
12. 调用 `POST /v1/visit-packs` 创建资料包，再调用 `POST /v1/visit-packs/:packId/generate` 生成结构化资料包内容。

上传文件会暂存到本地 `storage/medical-records`，数据库只记录路径和文件哈希。

## 下一步

1. 用真实 PostgreSQL / Redis 跑一遍完整 API 流程。
2. 增加验证码限流和失败审计。
3. 接入正式 PDF 渲染导出。
4. 将 mock 识别替换为真实 OCR / AI，并保留字段级追溯结构。
5. 将本地文件存储替换为加密对象存储。
6. 补充端到端 API 测试。
