# migrations/

B-01 只建目录，**不放任何迁移**。首个迁移由 B-06 产出。

## 迁移工作流（B-06 落地时按此执行）

1. `npx prisma migrate dev --create-only --name init` 生成空迁移文件，**不要直接 apply**；
2. 在生成的文件里手工插入 PG 专有 DDL（Prisma 表达不了的部分）：
   - `CREATE SCHEMA audit;`
   - `audit.audit_log` 按月分区：`PARTITION BY RANGE (ts)` + `generate_series` 预建分区
   - `BEFORE UPDATE OR DELETE ... RAISE EXCEPTION 'audit_log is append-only'` 触发器
   - `REVOKE UPDATE, DELETE, TRUNCATE ON audit.audit_log FROM app_rw;`
   - `GRANT INSERT, SELECT ON audit.audit_log TO app_audit_w;`
3. `npx prisma migrate deploy` 验证可回放；
4. 分区表的 `DETACH PARTITION` 用于归档——**不用 `DELETE`**（后者直接违反只追加，架构决策.md:676）。

## 为什么目录先空着

B-06 的验收第 ⑤ 条要求"若分区 + 触发器 + 列级授权无法用 Prisma 表达 → 触发决策 B-03 回退到 Kysely"。
先建空目录是为了让这条判定在 W1 末有明确的落点，而不是等到 W2 才发现无处可放。
