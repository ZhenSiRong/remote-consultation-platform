/**
 * 验签状态字典
 * 依据：架构决策.md 3.8.4C4（`GET /consultations/{id}/signatures` 返回 verifyStatus）
 * 由 schemas/record 与 ports/signature-provider 共同引用，避免两处各写一份。
 */
export const SIGNATURE_VERIFY_STATUSES = [
  'VALID',
  'CONTENT_CHANGED',
  'CERT_EXPIRED',
  'REVOKED',
] as const;

export type SignatureVerifyStatus = (typeof SIGNATURE_VERIFY_STATUSES)[number];

export interface SignatureVerifyMeta {
  readonly code: SignatureVerifyStatus;
  readonly label: string;
  readonly token: string;
  /** 归档前置校验：非 VALID 一律阻断归档（40002 / 40003） */
  readonly blocksArchive: boolean;
}

export const SIGNATURE_VERIFY_META: Readonly<Record<SignatureVerifyStatus, SignatureVerifyMeta>> = {
  VALID: { code: 'VALID', label: '验签通过', token: '--status-success', blocksArchive: false },
  CONTENT_CHANGED: {
    code: 'CONTENT_CHANGED',
    label: '内容已变更',
    token: '--status-danger',
    blocksArchive: true,
  },
  CERT_EXPIRED: {
    code: 'CERT_EXPIRED',
    label: '证书过期',
    token: '--status-warning',
    blocksArchive: true,
  },
  REVOKED: { code: 'REVOKED', label: '证书已吊销', token: '--status-danger', blocksArchive: true },
};
