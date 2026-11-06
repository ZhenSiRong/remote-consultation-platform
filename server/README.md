# @rcp/server · 后端服务（NestJS 11 + Prisma + PostgreSQL 16）

W0 / story **B-01（后端工程骨架与四层目录）** 产出。**本步是骨架，不是实现**：目录、DI 装配、
依赖规则与启动链路齐全，业务逻辑留给后续 story。

## 跑起来

```bash
npm run dev:server          # 根目录；等价于 npm run start:dev -w server
npm run build -w server     # nest build
npm run typecheck -w server # tsc --noEmit
npm run lint -w server      # ESLint 9 flat config，六条依赖规则
```

`GET /health` → `200 { status: 'ok', uptime, timestamp }`，端口取 `PORT`（缺省 3000）。

## 目录（对照 架构决策.md:716-745）

```
server/
├── src/
│   ├── main.ts / app.module.ts / app.controller.ts(health)
│   ├── common/      trace · audit · authz · mask · errors · idempotency · db
│   ├── modules/     auth org consult av emr record col audit
│   │   └── <name>/  <name>.controller.ts · <name>.service.ts · <name>.repository.ts · dto/ · <name>.module.ts
│   ├── adapters/    video · dicom · sign · storage · asr   （port + fake，能模拟失败）
│   └── jobs/
├── prisma/          schema.prisma（占位）· migrations/（空，B-06 建首个迁移）
└── test/            health.e2e-spec.ts
```

比 3.8.3 的树多出两处，都是为了把规则变成可执行的约束：

- 每个模块的 `<name>.module.ts`：8 个模块全部在 `AppModule` 注册，启动即验证 DI 与 import 路径；
- `consult / emr / record / col` 各有 `domain/`：3.8.3 的四层里 domain 是纯 TS 层，
  没有目录就无法用 lint 拦"domain import Nest"。

## 六条依赖规则：哪条真拦住了，哪条只能评审

规则原文见 `架构决策.md:749-756`。落点全在 `eslint.config.mjs`（核心 `no-restricted-imports`
+ `no-restricted-syntax`，未引入 `eslint-plugin-import`——本波禁止装包，见文末"已知偏差"）。

| # | 规则 | Lint | 说明 |
|---|---|---|---|
| 1 | controller 不写业务判断 | ⚠️ 近似 | 拦 `import` repository / prisma / common-db / adapters——拿到数据层就说明它在算业务。**"有没有 if 判业务"拦不住** |
| 2 | service 唯一事务边界 | ✅ | controller 里出现 `$transaction` 或 `prisma` 实例即报错 |
| 3 | domain 纯 TS | ✅ | domain 目录禁 `@nestjs/*`、`@prisma/client`、repository、common、adapters |
| 4 | 禁跨模块 import repository | ✅ | 按模块生成 import 源串黑名单（8 个模块各自排除自己） |
| 5 | controller 不直连 SDK | ✅ | controller 禁 `**/adapters/**`；adapter 只能被 service 经 port 调用 |
| 6 | 禁横向读表 | ⚠️ 近似 | Prisma 只允许出现在 `common/db` 与 `*.repository.prisma.ts`；**跨模块"用别人的表名"拦不住** |

### 评审项（Lint 拦不住，code review 必须看）

1. **规则 1 的语义部分**：controller 里出现分支/计算/状态判断，即使 import 干净也算违规。
   判据：controller 方法体只允许"取参 → 调一个 service 方法 → 返回"。
2. **规则 6 的语义部分**：service 里用 `$queryRaw` 拼别的模块的表、或把别人的表当自己的读——
   lint 只认 Prisma 的 import 位置，认不出 SQL 里的表名。评审看 `prisma/schema.prisma` 的归属注释。
3. **规则 4 的"只暴露接口"**：接口与实现同文件时 lint 无法区分；约定是 Prisma 实现必须落在
   `*.repository.prisma.ts`，且**不得被模块外 import**（lint 已拦 import 路径，实现文件位置靠评审）。
4. **规则 5 的 port 纯度**：port 里出现厂商专有名词（`agoraChannelId`、`dcm4cheeStudyUid`）即抽象漏了
   （架构决策.md:933）——这条只能人看。
5. **`no-restricted-imports` 是"源串匹配"**：绕过写法（`import()` 动态导入、>4 层的相对路径、自定义别名）
   不在拦截范围。发现即补规则，不要靠人记。

## 已知偏差 / 待主进程处理

- **依赖只在 `server/package.json` 声明，未安装**（本波规则：禁止执行任何安装命令）。
- **工具链（typescript / eslint / jest / @nestjs/cli / prisma）暂列在 `dependencies`**，不是
  `devDependencies`——因为本波只允许补 `scripts` 与 `dependencies` 两个字段。建议 W1 迁回 `devDependencies`，
  否则生产镜像会带上编译器与测试框架。
- **`@rcp/shared` 只 import 一次**：`src/common/errors/index.ts` 的 `import type { ApiResponse }`。
  `shared/dist` 未构建时该行会报"找不到模块"，属预期（B-04 并行建设中），**不要删**。
- 未用 `eslint-plugin-import` 的 `no-restricted-paths`（按解析路径判定更准），因为需要额外两个包。
  换成核心规则后，判定从"解析后路径"降级为"import 源串"，代价见上表第 5 条评审项。

## 后续 story 的落点

| story | 落点 |
|---|---|
| B-02 统一响应体 | `common/errors/`（拦截器 + 异常过滤器） |
| B-03 traceId / 日志 | `common/trace/`（中间件 + redact） |
| B-06 Prisma 基线 | `prisma/schema.prisma`、`prisma/migrations/`、`common/db/` |
| B-07 env 校验 / 幂等 | `common/idempotency/`、`main.ts` |
| B-09 AuditWriter | `common/audit/`（唯一写入口） |
| B-10 权限守卫 / 票据 | `common/authz/` |
| B-11 MaskInterceptor | `common/mask/` |

## 验证状态（B-01 交付时）

| 项 | 状态 |
|---|---|
| 61 个相对 import 逐条解析 | ✅ 全部存在（脚本核对，0 missing） |
| `eslint.config.mjs` 语法 | ✅ `node --check` 通过 |
| 4 次违规在配置上命中 | ✅ 5/5（用 picomatch 复现 flat config 的选块 + 源串匹配；**ESLint 本体未运行**） |
| 现有代码误拦 | ✅ 0 条 |
| `npm run lint` / `tsc --noEmit` / `npm run dev:server` / `GET /health` | ❌ **未执行**：`node_modules` 里没有 eslint / typescript / @nestjs（本波禁止安装） |

装包后请依次执行，这四项是 B-01 验收 ③④⑤ 的最终判据：

```bash
npm run lint -w server
npm run typecheck -w server
npm run start:dev -w server   # 另开终端：curl -i http://localhost:3000/health
```

