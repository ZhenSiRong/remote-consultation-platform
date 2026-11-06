import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import importPlugin from 'eslint-plugin-import'

/** 四个业务域（架构决策.md 3.2）：域间只允许文档登记的 3 条单向依赖，其余一律禁止 */
const VIEW_DOMAINS = ['consult', 'record', 'emr', 'audit']

/** 禁令①：views/<域A> 不得 import views/<域B> 的任何文件 */
const domainIsolationZones = VIEW_DOMAINS.map((domain) => ({
  target: `./src/views/${domain}`,
  from: './src/views',
  except: [`./src/views/${domain}`],
  message: `禁令①：views/${domain} 不得 import 其它 views/<域> 的文件（架构决策.md 3.1 三条禁令）`,
}))

/** 禁令②：会诊记录域不得依赖处方域 */
const recordPrescriptionZone = {
  target: './src/views/record',
  from: './src/views/prescription',
  message: '禁令②：views/record/** 不得 import views/prescription/**（架构决策.md 3.1 三条禁令）',
}

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'shared/**', 'server/**', '**/*.d.ts'],
  },
  {
    files: ['**/*.{js,ts,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: { extensions: ['.js', '.mjs', '.ts', '.vue'] },
      },
    },
    rules: {
      'import/no-restricted-paths': [
        'error',
        { zones: [...domainIsolationZones, recordPrescriptionZone] },
      ],
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      // 占位参数用下划线前缀（如 buildMenu(_permissions)）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // 页面文件按架构文档命名（Login.vue / RecordList.vue），不强制多词
      'vue/multi-word-component-names': 'off',
    },
  },
)
