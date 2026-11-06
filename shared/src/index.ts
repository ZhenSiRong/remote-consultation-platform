/**
 * @rcp/shared —— 前后端唯一契约事实源（S-10）
 *
 * 五类导出：
 * 1. 实体类型        types/     —— 全部由 schemas/ 派生，不手写第二份
 * 2. Zod schema      schemas/   —— 六域基础对象 + 分页契约 + 统一响应体
 * 3. 权限点常量      authz/     —— 8 资源 × 11 权限点 × 6 角色矩阵（与 3.6 逐格一致）
 * 4. 状态字典        dict/      —— 7 主态 + 叠加 flag + 会场态 + 留痕动作 + 验签态
 * 5. 错误码          errors/    —— 0 / 1xxxx / 2xxxx / 3xxxx / 4xxxx / 5xxxx / 6xxxx / 9xxxx
 *
 * 另有：common/（ApiResponse / PageQuery / PageResult）、ports/（三个外部能力接口，只定不实现）。
 *
 * 构建形态：CommonJS（`dist/*.js` + `.d.ts`）。后端 `@rcp/shared` → dist；
 * 前端走 Vite alias → `shared/src` 源码。详见 shared/README.md。
 */
export * from './common';
export * from './dict';
export * from './authz';
export * from './errors';
export * from './schemas';
export * from './types';
export * from './ports';
