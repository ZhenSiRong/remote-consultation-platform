import type { SignatureVerifyStatus } from '../dict/signature-verify';

/**
 * 电子签名能力 port —— 架构决策.md 3.8.5（P-04）/ 3.8.4C / R6
 *
 * 只定接口，不实现。Mock / CA 实现都在 `server/src/adapters/sign/`（B-10）。
 *
 * 硬约束：
 * 1. **签摘要不签正文**：输入只有 `contentHash`（规范化序列化后的 SHA-256）。
 * 2. 私钥、证书、可信时间全在服务端；前端只展示待签摘要、触发签名、展示验签结果（A-12）。
 * 3. Mock 实现的签名值必须**真实可验**，且篡改内容后 `verify` 必须失败 ——
 *    否则 R6 连流程都验不了（禁止「前端算个 hash 存库」冒充签名）。
 */

/** 实现方标识；与 schemas/record 的 SIGNATURE_PROVIDERS 取值一致 */
export type SignatureProviderId = 'MOCK' | 'CA' | 'UKEY';

export interface SignatureSigner {
  id: string;
  /** 应签方仅 DO / EXP（3.8.4C1） */
  role: 'DO' | 'EXP';
  orgId: string;
}

export interface SignatureSignInput {
  /** `sha256:<64 位小写十六进制>` */
  contentHash: string;
  signer: SignatureSigner;
  /** 服务端授时，不接受客户端时间（3.7C） */
  serverTime: string;
}

export interface SignatureSignResult {
  signatureId: string;
  contentHash: string;
  /** 签名值（前端只展示，不参与任何计算） */
  signatureValue: string;
  provider: SignatureProviderId;
  /** P-04 未定期间固定 false，页面须常显「演示环境，不具法律效力」 */
  legalEffect: boolean;
  verifyStatus: SignatureVerifyStatus;
  signedAt: string;
  certSerial: string | null;
}

export interface SignatureVerifyInput {
  contentHash: string;
  signatureValue: string;
  certSerial?: string | null;
}

export interface SignatureVerifyOutput {
  verifyStatus: SignatureVerifyStatus;
  verifiedAt: string;
  reason: string | null;
}

export interface SignatureCertInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  algorithm: string;
  /** 自签证书（Mock 实现固定 true） */
  selfSigned: boolean;
}

export type SignatureErrorCode =
  | 'SIGN_FAILED'
  | 'CONTENT_CHANGED'
  | 'CERT_EXPIRED'
  | 'CERT_REVOKED'
  | 'PROVIDER_UNAVAILABLE';

export class SignatureProviderError extends Error {
  readonly code: SignatureErrorCode;

  constructor(code: SignatureErrorCode, message: string) {
    super(message);
    this.name = 'SignatureProviderError';
    this.code = code;
  }
}

export interface SignatureProvider {
  sign(input: SignatureSignInput): Promise<SignatureSignResult>;
  verify(input: SignatureVerifyInput): Promise<SignatureVerifyOutput>;
  getCertInfo(signerId: string): Promise<SignatureCertInfo>;
}
