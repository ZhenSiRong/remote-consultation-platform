# `@rcp/shared` · 前后端共享契约包

> 单一事实源（S-10）：22 条 story 的四类强契约——7 态状态机、6×11 权限矩阵、统一响应体、分段错误码——全部在这里**只写一次**，前后端各自 import，不做任何拷贝。

---

## 1. 模块策略（B-04 硬验收：双端能 import 同一类型）

| 消费方 | 解析方式 | 拿到的东西 |
|---|---|---|
| 后端（NestJS） | `import { ... } from '@rcp/shared'` → **`shared/dist`**（CJS + `.d.ts`） | 编译产物 |
| 前端（Vite） | Vite `resolve.alias` 把 `@rcp/shared` 指向 **`shared/src/index.ts`** | TypeScript 源码 |
| 单测 / 脚本 | 同后端（走 `dist`），或 `ts-node`/`vitest` 直接引 `src` | — |

**为什么构建产物必须是 CommonJS**：后端用 CJS + `emitDecoratorMetadata`，Nest 的 DI 依赖 `design:paramtypes` 元数据；一旦 `shared` 产出 ESM，`require` 侧会退化为异步加载，构造函数参数类型丢失，DI 直接断。所以：

- `shared/tsconfig.json` 固定 `module: CommonJS` / `moduleResolution: node` / `rootDir: src` / `outDir: dist`；
- `shared/package.json` 固定 `"type": "commonjs"` —— **根 `package.json` 是 `"type": "module"`**，若 `shared` 不显式声明，`dist/*.js` 会被 Node 当成 ESM 而报 `ERR_REQUIRE_ESM`；
- `exports` 只给 `require` / `default` 条件，不给 `import` 条件（没有 ESM 产物，给了就是骗解析器）。

**为什么前端指向源码而不是 dist**：前端不需要等 `shared` 构建；改 schema 后热更新立刻生效；Vite 只对 `src` 做转译，CJS/ESM 互操作问题不存在。代价是前端必须能编译 `shared/src` 的 TS——根 `tsconfig.base.json` 与 `shared/tsconfig.json` 共用同一份严格度基线，正是为此。

> 前端别名已由 K-01 落地（`vite.config.ts` 的 `resolve.alias` + 根 `tsconfig.json` 的 `paths`，两处都指向 `shared/src/index.ts`）。约定如下，**改契约不需要改这两处**：
>
> ```ts
> // vite.config.ts
> '@rcp/shared': path.resolve(repoRoot, 'shared/src/index.ts')
> ```
>
> 只配这一条根入口。前端**只用根入口** `@rcp/shared`（含 `RtcProvider` 等 port 类型）；`@rcp/shared/ports` 子路径是给后端走 `dist` 用的（`exports` 已声明）。

**明确禁止**（A-01 调和条款）：

- Turborepo / Nx / pnpm workspace 编排；
- 独立发包、版本号管理、`publishConfig`；
- 在 `src/api/types` 或 `server/**/dto` 复制本包类型。

---

## 2. 目录与五类导出

```
shared/src/
├── index.ts               # 汇总出口
├── common/                # ApiResponse / PageQuery / PageResult + 分页常量
├── types/                 # 实体类型（全部 z.infer 自 schemas/，不手写第二份）
│   ├── consult.ts  room.ts  emr.ts  record.ts  col.ts  audit.ts  org.ts
├── schemas/               # Zod schema（唯一校验源）
│   ├── common.ts          # 基元 + 分页 + 统一响应体工厂
│   ├── consult.ts av.ts emr.ts record.ts col.ts audit.ts org.ts
├── authz/permissions.ts   # 8 资源 × 11 权限点 × 6 角色矩阵
├── dict/                  # 7 主态 / 叠加 flag / 会场态 / 留痕动作 / 验签态
├── errors/codes.ts        # 分段错误码 + HTTP 映射 + 前端分流提示
└── ports/                 # RtcProvider / DicomProvider / SignatureProvider（只定接口）
```

**同源规则**：`schemas/` 是唯一校验源，`types/` 只做 `z.infer`。改字段只改 schema，类型自动跟随；若发现某类型在 `types/` 里被手写了一遍，等同于在造第二个事实源，按违规处理。

**字典归属**：`ConsultStatus`（7 态）、`ConsultFlag`、`RoomPresenceState`、`AuditAction`、`SignatureVerifyStatus` 的声明都在 `dict/`，由根出口统一导出——`types/` 不重复声明，避免同一名字出现两个符号。

---

## 3. 常用入口

```ts
// 后端：错误码 + 统一响应体 + 权限点
import { ERROR_CODES, httpStatusOf, PERMISSIONS, hasPermission } from '@rcp/shared';

// 后端：DTO 校验（Zod Pipe 直接消费，dto/ 里不再写一份）
import { createConsultationSchema } from '@rcp/shared';

// 前端：状态字典 + 色 token
import { CONSULT_STATUS_META, consultStatusColorVar } from '@rcp/shared';

// 前端：只读类型
import type { ConsultOrder, PageResult } from '@rcp/shared';

// 后端 adapter：三个 port（走 dist，exports 已声明子路径）
import type { RtcProvider } from '@rcp/shared/ports';
```

**页面禁止出现十六进制色值**：状态色一律经 `consultStatusColorVar()` 或 `StatusTag` 取 `var(--status-*)`。

---

## 4. 命令

```bash
npm run build -w shared      # tsc -p tsconfig.json → dist（CJS + d.ts）
npm run typecheck -w shared  # tsc --noEmit -p tsconfig.json
npm run dev -w shared        # watch 模式，后端开发时挂着
```

**构建顺序**：`shared` → `server` → 前端。根 `npm run build` 已按此排序；单独构建后端前必须先构建 `shared`，否则 `@rcp/shared` 解析不到 `dist`。

---

## 5. 契约变更流程

1. 只改 `shared/`，一个 PR 改一处契约；
2. 双端 review（前端 + 后端各一人），并在 `WBS-施工期.md` 附录 C 登记；
3. 变更若改了既有字段签名，按 R6 走「新增版本 + 保留旧版本」而非原地替换；
4. 合并后双方各自跑 `typecheck`，任一端报错即回滚。

契约冻结后（B-05）**只允许新增**；改签名必须走上述流程。
