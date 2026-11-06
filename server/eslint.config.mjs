// 远程会诊平台 · 后端 Lint 规则（ESLint 9 flat config）
// 依据：补充物/架构决策.md:749-756「六条依赖规则（违反即评审不过）」
//
// 落地方式说明（不假装全拦住）：
//   规则 2（controller 不开事务）→ 可拦，已用 no-restricted-syntax 拦 $transaction 与 prisma 实例
//   规则 3（domain 纯 TS）      → 可拦，已用 no-restricted-imports 拦 @nestjs/* 与 @prisma/client
//   规则 4（禁跨模块 repository）→ 可拦，按模块生成 import 源串黑名单
//   规则 5（controller 不直连 SDK）→ 可拦，controller 禁 import src/adapters/**
//   规则 1（controller 不写业务判断）、规则 6（禁横向读表）→ 只能近似
//     · 规则 1 的近似：controller 禁 import repository / prisma / common-db（拿到数据层就说明它在算业务）
//     · 规则 6 的近似：Prisma 只允许出现在 common/db 与 *.repository.prisma.ts
//   剩下的语义部分列在 server/README.md「评审项」，靠 code review 与负向用例兜底。
//
// 为什么不用 eslint-plugin-import 的 no-restricted-paths：
//   它按「解析后的路径」判定，更准，但需要额外装 eslint-plugin-import + TS resolver 两个包。
//   本波禁止安装依赖，故改用 ESLint 核心 no-restricted-imports（按 import 源串判定）。
//   代价（已知）：别名外的动态 import()、以及本文件未枚举的相对深度（>4 层）不在拦截范围。

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** 8 个业务模块（架构决策.md:729-737） */
const MODULES = ['auth', 'org', 'consult', 'av', 'emr', 'record', 'col', 'audit']

/** 相对 import 的深度变体：modules/<m>/x.ts → ../<other>；dto/、domain/ 下 → ../../<other> */
const REL_DEPTHS = ['..', '../..', '../../..', '../../../..']

/** 规则 6 的近似：Prisma 只在 common/db 与 *.repository.prisma.ts 出现 */
const PRISMA_PATTERNS = [
  {
    group: ['@prisma/client', '@prisma/*', '.prisma/*'],
    message:
      '规则 6：Prisma 只允许出现在 src/common/db 与 *.repository.prisma.ts（架构决策.md:756「禁止横向读表」）',
  },
]

/** 规则 4：跨模块 import 别人的 repository */
function crossModuleRepositoryPatterns(own) {
  return MODULES.filter((m) => m !== own).flatMap((m) =>
    REL_DEPTHS.flatMap((d) => [`${d}/${m}/*.repository`, `${d}/${m}/*.repository.prisma`]).concat([
      `@/modules/${m}/*.repository`,
      `@/modules/${m}/*.repository.prisma`,
    ]),
  )
}

/**
 * 相对深度变体。no-restricted-imports 匹配的是 **import 源串**（不做路径解析），
 * 所以 `**\/x` 这类写法对 `../x` 不一定生效——一律显式枚举深度，宁可多写不可漏拦。
 */
const relativeVariants = (suffix) => REL_DEPTHS.map((d) => `${d}/${suffix}`)

/** 规则 1 / 2 / 5：controller 的边界 */
const CONTROLLER_PATTERNS = [
  {
    group: [
      '**/*.repository',
      '**/*.repository.prisma',
      './*.repository',
      './*.repository.prisma',
      ...relativeVariants('*.repository'),
      ...relativeVariants('*.repository.prisma'),
      ...relativeVariants('*/*.repository'),
      ...relativeVariants('*/*.repository.prisma'),
    ],
    message: '规则 1/2：controller 只能调 service，不得 import repository（架构决策.md:751-752）',
  },
  {
    group: [
      '**/common/db',
      '**/common/db/*',
      ...relativeVariants('common/db'),
      ...relativeVariants('common/db/*'),
    ],
    message: '规则 2：controller 不得拿到事务助手——service 是唯一事务边界（架构决策.md:752）',
  },
  {
    group: [
      '**/adapters',
      '**/adapters/*',
      '**/adapters/**',
      ...relativeVariants('adapters/*'),
      ...relativeVariants('adapters/**'),
    ],
    message: '规则 5：controller 不得直连 adapter / 厂商 SDK，只能经 service 的 port 调用（架构决策.md:755）',
  },
]

const CONTROLLER_SYNTAX = [
  {
    selector: "CallExpression[callee.property.name='$transaction']",
    message: '规则 2：service 是唯一事务边界，controller 禁止开事务（架构决策.md:752）',
  },
  {
    selector: "MemberExpression[object.name='prisma']",
    message: '规则 2/6：controller 禁止触碰 prisma 实例（架构决策.md:752,756）',
  },
]

/** 规则 3：domain 是纯 TS，不 import Nest / Prisma / 基础设施 */
const DOMAIN_PATTERNS = [
  {
    group: ['@nestjs', '@nestjs/*', '@prisma/client', '@prisma/*', '.prisma/*'],
    message: '规则 3：domain 必须是纯 TS，不 import Nest / Prisma，以便脱离数据库单测（架构决策.md:753）',
  },
  {
    group: [
      '**/common/**',
      '**/adapters/**',
      '**/*.repository',
      '**/*.repository.prisma',
      './*.repository',
      ...relativeVariants('common/**'),
      ...relativeVariants('adapters/**'),
      ...relativeVariants('*.repository'),
      ...relativeVariants('*/*.repository'),
    ],
    message: '规则 3/4：domain 不得依赖 repository、common 基础设施或 adapters（架构决策.md:753-754）',
  },
]

const crossModulePattern = (own) => ({
  group: crossModuleRepositoryPatterns(own),
  message: `规则 4：禁止跨模块 import 别人的 repository（本模块 ${own}），模块间只走 service 公开方法或领域事件（架构决策.md:754,756）`,
})

const crossModuleRule = (own) => ['error', { patterns: [crossModulePattern(own)] }]

/** own 为空表示 src 根下的 controller（无跨模块约束） */
const controllerRule = (own = null) => [
  'error',
  {
    patterns: [
      ...CONTROLLER_PATTERNS,
      ...PRISMA_PATTERNS,
      ...(own ? [crossModulePattern(own)] : []),
    ],
  },
]

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/migrations/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 基线：所有 TS 源文件的公共约束
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': ['error', { patterns: PRISMA_PATTERNS }],
    },
  },

  // 规则 2 / 6 的豁免区：Prisma 唯一允许出现的地方
  {
    files: ['src/common/db/**/*.ts', 'src/**/*.repository.prisma.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // 规则 1 / 2 / 5：src 根下的 controller（app.controller.ts）
  {
    files: ['src/*.controller.ts'],
    rules: {
      'no-restricted-imports': controllerRule(),
      'no-restricted-syntax': ['error', ...CONTROLLER_SYNTAX],
    },
  },

  // 规则 4：每个模块内部——禁止 import 别人的 repository
  ...MODULES.map((own) => ({
    files: [`src/modules/${own}/**/*.ts`],
    rules: { 'no-restricted-imports': crossModuleRule(own) },
  })),

  // 规则 1 / 2 / 4 / 5 / 6：模块内的 controller（叠加跨模块限制）
  ...MODULES.map((own) => ({
    files: [`src/modules/${own}/**/*.controller.ts`],
    rules: {
      'no-restricted-imports': controllerRule(own),
      'no-restricted-syntax': ['error', ...CONTROLLER_SYNTAX],
    },
  })),

  // 规则 3 / 4 / 6：domain 是纯 TS（放在最后，覆盖上面的通用块）
  {
    files: ['src/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...DOMAIN_PATTERNS] }],
    },
  },
)
