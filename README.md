# 医记 Health Record Assistant

医记是一个面向个人和家庭场景的健康资料整理助手原型。项目聚焦“病历资料分散、复诊前难整理、家人健康信息难追踪”的问题，帮助用户完成病历上传、候选识别、人工核对、归档、时间线查看、待办提醒和就诊资料包生成。

> 当前项目为作品集与 MVP 原型，不提供诊断、治疗或用药建议，不能替代医生判断。

## 项目背景

很多个人健康资料分散在纸质病历、检查报告、处方、影像单、聊天记录和手机相册中。用户在复诊、换医院、照顾家人时，常常需要临时翻找资料，难以快速说明“什么时候看过什么病、做过什么检查、吃过什么药、后续还要做什么”。

医记希望把这些资料整理成一个可追溯、可核对、可导出的个人健康资料库，让用户在就诊前能更快准备信息，也能更清楚地管理家庭成员的健康记录。

## 核心目标

- 帮助用户上传并整理病历、检查报告、处方等健康资料。
- 将 OCR/AI 识别结果作为候选字段，要求用户人工核对后再归档。
- 按时间线组织病历、药品、指标和待办事项。
- 生成就诊资料包，方便复诊前准备。
- 支持家庭成员资料管理，但第一版不开放跨账号协作。
- 在产品设计中明确健康数据、权限、审计、删除和隐私边界。

## 核心用户流程

```text
注册/登录
-> 创建本人或家庭成员档案
-> 上传病历资料
-> 系统生成候选识别结果
-> 用户核对字段
-> 归档到时间线
-> 生成待办或复诊准备项
-> 导出就诊资料包
```

## 已实现功能

### 用户与权限

- 邮箱/短信验证码登录基础能力
- 会话创建、校验、撤销
- 当前设备退出和全部设备退出
- 家庭成员资料模型
- 成员权限判定
- 默认拒绝的权限策略
- 跨账号邀请与授权在第一版禁用

### 病历资料整理

- 病历资料上传接口
- OCR 候选识别流程
- 字段级识别追溯
- 用户核对与归档
- 病历时间线
- 资料删除与原件删除
- 关键写操作审计

### 健康管理辅助

- 药品记录
- 指标记录与趋势
- 待办事项
- Agent 规则生成整理提醒
- 复诊资料包生成
- 就诊资料包分享链接
- 分享链接过期、撤销和访问审计

### 安全与合规设计

- 登录验证码不明文存储
- 分享 token 只保存 hash，明文 token 只返回一次
- 访问日志不读取请求正文
- 日志脱敏
- 生产 CORS 限制
- 基础安全响应头
- 隐私政策与服务协议页面
- 账号删除冷静期和清理脚本

## 技术栈

- TypeScript
- NestJS
- Express
- Prisma
- PostgreSQL
- Redis
- Vercel API Routes
- Vercel Blob / 阿里云 OSS 存储适配
- Tesseract.js / 百度 OCR / OpenAI 识别扩展接口
- Node.js 24
- 原生 HTML/CSS/JavaScript 前端原型

## 项目结构

```text
.
├── api/                         # Vercel API 入口
├── apps/api/src/                # NestJS 后端源码
├── apps/api/test/               # 后端测试
├── prisma/                      # Prisma schema 与数据库迁移
├── docs/                        # 产品、测试、技术和上线文档
├── project-docs/                # 构建公开文档页的源文档
├── scripts/                     # 构建、OCR、OSS、账号清理脚本
├── app.html                     # 当前 Web App 页面
├── index.html                   # 早期原型页面
├── project-story.html           # 项目故事/作品集展示页
├── privacy.html                 # 隐私政策
├── terms.html                   # 服务协议
├── package.json
└── vercel.json
```

## 本地运行

前提：

- Node.js 24+
- npm
- PostgreSQL
- Redis

安装依赖：

```bash
npm install
```

准备环境变量：

```bash
cp .env.example .env
```

生成 Prisma Client：

```bash
npm run prisma:generate
```

启动数据库和 Redis：

```bash
docker compose up -d
```

执行迁移：

```bash
npm run prisma:migrate
```

启动开发服务：

```bash
npm run start:dev
```

健康检查：

```text
GET http://127.0.0.1:3001/v1/health/live
GET http://127.0.0.1:3001/v1/health/ready
```

## 验证命令

```bash
npm run check
npm run build:site
npm audit --omit=dev
```

当前验证结果：

```text
npm run check      通过，81 个测试全部通过
npm run build:site 通过
npm audit --omit=dev 通过，0 vulnerabilities
```

## 产品边界

医记不做以下事情：

- 不提供诊断建议
- 不提供治疗建议
- 不提供用药建议
- 不替代医生判断
- 不自动确认 OCR 结果
- 不把低置信度识别结果直接写入关键医疗字段
- 不把病历正文、诊断名称、药品名称或 OCR 原文用于广告、推荐或模型训练
- 第一版不开放跨账号家庭协作

## 隐私与数据安全说明

医记处理的是敏感健康信息，因此产品设计中重点考虑：

- 用户身份与健康资料隔离
- 家庭成员权限控制
- 文件私有存储
- 删除资料后同步删除原件
- 就诊资料包分享链接过期与撤销
- 关键操作审计
- 日志脱敏
- OCR 结果人工核对
- 账号删除和数据导出

如面向中国大陆公众长期运营，还需要进一步完成 ICP 备案、公安备案、个人信息保护法合规评估、敏感个人信息处理规则、备份恢复演练和正式安全审计。

## 作品集说明

这个项目主要展示了一个健康资料管理产品从需求定义、MVP 范围、交互原型、后端数据模型、权限设计、安全边界、OCR 候选识别到上线检查的完整设计与实现过程。

项目重点不是“AI 替用户判断病情”，而是把 AI/OCR 放在资料整理流程中，作为候选识别和补全提醒工具，并通过人工核对、权限控制和审计机制降低健康数据场景中的误用风险。

## 相关文档

- `SPEC.md`：产品规格说明
- `BACKEND_README.md`：后端接口与运行说明
- `TECH_ARCHITECTURE_AND_DATA_PERMISSIONS.md`：技术架构与数据权限设计
- `IMPLEMENTATION_PLAN.md`：实现计划
- `LAUNCH_CHECKLIST.md`：上线检查清单
- `docs/OCR_ACCURACY_TEST_PLAN.md`：OCR 准确性测试计划
- `docs/医记_PRD产品包_整合版_2026-07-10.md`：PRD 产品包
