# 协作约定 · 远程会诊平台

> 本文是**评审可直接引用**的约定清单。凡违反，PR 驳回，不进入讨论。
> 上位依据：`补充物/架构决策.md`（下称《架构决策》）、`补充物/WBS-施工期.md`。

---

## 0. 契约（最高优先级）

**禁止在 `src/api/types` 或 `server/**/dto` 私自复制 `shared/` 的类型定义。发现即驳回。**

`shared/` 是前后端唯一事实源（S-10）：

- 类型只能 `import`，不能拷贝；DTO 只能由 `shared/schemas` 的 Zod schema 派生，不能另写一份。
- 契约变更 = `shared/` 的一个 PR，双端 review，并在 `WBS-施工期.md` 附录 C 登记。
- 契约冻结（B-05）后只允许新增；改既有签名须走"新增版本 + 保留旧版本"。
- 权限点新增必须前后端**同一 PR** 提交（《架构决策》3.6D），单侧提交视为未完成。

---

## 1. 前端三条禁令（《架构决策》3.1）

1. `views/a` **不得** import `views/b` 的任何文件。
2. `api/` **不得**写业务判断（如"状态是待签署才能归档"属于 `domain/` 或后端）。
3. 组件**不得**直接 import axios / SDK，必须经 `api/` 与 adapter。

配套约束：

- 页面**禁止出现十六进制色值**，状态色只能引用 `var(--status-*)`（《架构决策》3.3）。
- 页面**禁止自行拼接日期/金额字符串**（禁 `getFullYear() + '-'`、禁手写 `toFixed`），统一走 `formatDateTime()` / `formatAmount()`（3.4）。
- 时间一律绝对时间，**禁止相对时间**（"3 分钟前"）；唯一例外是站内消息列表。
- 权限只解决"体验与误操作"，**前端不是安全边界**；任何越权拦截都必须由后端兜底（3.6E）。
- 路由 `meta.permission` 取 `shared` 的权限点常量，菜单由权限点集合生成，不手写死菜单。

---

## 2. 后端六条依赖规则（《架构决策》3.8.3，原文）

> 违反即评审不过。

1. controller 只做 HTTP 映射与校验，**不写业务判断**（与前端 3.1 的"`api/` 不得写业务判断"同构）。
2. service 是**唯一的事务边界**：一个用例一个事务，禁止 controller 开事务。
3. domain 是纯 TS，**不 import Nest / Prisma**——这样状态机与脱敏规则可以脱离数据库单测。
4. repository 只暴露接口，Prisma 实现放 `*.repository.prisma.ts`；**禁止跨模块 import 别人的 repository**。
5. adapters 只被 service 通过 port 接口调用；controller **不得直连 SDK**。
6. 模块间通信只走 service 公开方法或领域事件，**禁止横向读表**（对应前端 3.2 的"域间只允许 3 条依赖"）。

补充红线：

- `AuditWriter` 是审计表**唯一写入口**，不暴露 update / delete；敏感动作走 `writeOrThrow()`（fail-closed，`60001`）。
- `MaskInterceptor` 是脱敏**唯一出口**，规则来自 `shared`；明文不进日志、审计表、错误堆栈、APM、`console`。
- 外部能力（音视频 / DICOM / 签名）只经 `shared/ports` 的三个接口调用，port 里**不得出现厂商专有名词**；禁止在业务里写 `if (provider === 'x')`。

---

## 3. 提交信息

采用 Conventional Commits：

```
<type>(<scope>): <subject>

<body>
```

**type**：`feat` `fix` `refactor` `docs` `test` `chore` `build` `ci` `perf`

**scope**（必填，取目录一级）：

| scope | 范围 |
|---|---|
| `shared` | 契约包（类型 / schema / 权限点 / 字典 / 错误码 / ports） |
| `server` | 后端（含 `common` / `modules` / `adapters` / `prisma`） |
| `web` | 前端（`src/**`） |
| `kernel` | 前端共享内核（`api/request`、`store/kernel`、`components` 基础件） |
| `infra` | 根配置、构建、CI、脚本 |

**subject**：中文，动词开头，不超过 40 字，句末不加句号。

**契约变更**额外规则：

- 改 `shared/` 的既有签名 → type 后加 `!`（如 `feat(shared)!: ConsultOrder 增加 invitedOrgId`），body 必须写「影响面 + 附录 C 登记号」；
- 只新增字段/类型 → 不加 `!`，但仍需双端 review。

示例：

```
feat(shared): 新增 AuthzTicket schema 与票据状态字典

fix(server): 审计写入失败时未回滚业务事务

refactor(kernel): 状态色改由 consultStatusColorVar 统一取 token

feat(shared)!: PageQuery.pageSize 上限由 200 收到 100

影响面：K-17 列表页分页参数、server 分页助手
附录 C 登记：C-012
```

---

## 4. 提交前自查（本地跑通再推）

```bash
npm run typecheck -w shared     # 契约包零报错
npm run lint                    # 0 warning（--max-warnings 0）
npm run typecheck               # 前端（含 shared 源码）
```

- 不跳过 hook（禁 `--no-verify`）；hook 失败先修根因。
- 不提交 `.env`、密钥、证书、脱敏样本之外的任何患者数据。
- 不提交 `dist/`、`node_modules/`。
