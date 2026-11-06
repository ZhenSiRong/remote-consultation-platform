/**
 * 签名摘要规范化（架构决策.md:864,871）：签摘要不签正文。
 * 规范化 = 键排序 / UTF-8 / 去空白 / 时间转 UTC，再 SHA-256。
 * 纯 TS：不 import Nest / Prisma（规则 3），可脱离数据库单测。
 *
 * TODO(B-1x)：实现 canonicalize。**未实现前不得用于真实签署**——
 * 摘要算错会让签名与内容对不上，R6 直接失效，故此处故意抛错而不是返回假值。
 */
export interface DigestInput {
  recordVersionId: string
  versionNo: number
  consultationNo: string
  content: string
  participants: readonly { role: string; name: string }[]
}

export interface SignatureDigest {
  algorithm: 'sha256'
  canonical: string
  hash: string
}

export function canonicalize(_input: DigestInput): string {
  throw new Error('canonicalize 尚未实现：B-1x 落地签名摘要规范化')
}
