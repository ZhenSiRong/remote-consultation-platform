/**
 * RTC 实现的注入令牌。
 *
 * 单独成文件而不是放在 `index.ts`：`index.ts` 同时要导出 `FakeRtcProvider` 类，
 * 若模块文件既 import 类又 import 令牌，容易形成「模块 ↔ adapter」的循环引用。
 * 令牌只依赖 `Symbol`，放这里最安全。
 */
export const RTC_PROVIDER = Symbol('RTC_PROVIDER')
