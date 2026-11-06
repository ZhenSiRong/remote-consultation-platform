/**
 * 电子签名 adapter（架构决策.md:916，P-04 未定）。
 * 签摘要不签正文；降级时 provider=MOCK + legalEffect=false，页面须常显"演示环境，不具法律效力"。
 * **禁止**用"算个 hash 存库"冒充签名（3.8.4 C5）——Mock 也必须是真签名、可自验。
 */
export type SignerRole = 'DO' | 'EXP'
export type VerifyStatus = 'VALID' | 'CONTENT_CHANGED' | 'CERT_EXPIRED' | 'REVOKED'

export interface SignatureRequest {
  /** 记录版本规范化后的 SHA-256，形如 sha256:... */
  contentHash: string
  signerId: string
  signerRole: SignerRole
  /** 服务端授时，不接受客户端时间 */
  serverTime: string
}

export interface SignatureResult {
  signatureId: string
  signedAt: string
  provider: 'MOCK' | 'CA'
  legalEffect: boolean
  verifyStatus: VerifyStatus
}

export interface CertInfo {
  subject: string
  issuer: string
  notAfter: string
}

export interface SignatureProvider {
  sign(request: SignatureRequest): Promise<SignatureResult>
  verify(signatureId: string): Promise<VerifyStatus>
  getCertInfo(): Promise<CertInfo>
}

export const SIGNATURE_PROVIDER = Symbol('SIGNATURE_PROVIDER')

/**
 * 骨架占位：形状齐全，但**尚未做 ECDSA 签名**。
 * TODO(B-1x)：ECDSA P-256 自签、私钥本地加密存放（仅开发环境）、verify 能验过自己的 sign。
 * 在实现之前，本类返回 legalEffect=false，不得用于任何"已签署"判定。
 */
export class MockSignatureProvider implements SignatureProvider {
  /** 置为 true 后，下一次 sign 抛错（模拟验签失败 / CA 不可用） */
  failNext = false

  async sign(request: SignatureRequest): Promise<SignatureResult> {
    this.raiseIfArmed()
    return {
      signatureId: `mock-signature-${request.signerId}-${request.serverTime}`,
      signedAt: request.serverTime,
      provider: 'MOCK',
      legalEffect: false,
      verifyStatus: 'VALID',
    }
  }

  async verify(_signatureId: string): Promise<VerifyStatus> {
    this.raiseIfArmed()
    return 'VALID'
  }

  async getCertInfo(): Promise<CertInfo> {
    return { subject: 'CN=RCP-MOCK', issuer: 'CN=RCP-MOCK', notAfter: '2099-12-31T00:00:00Z' }
  }

  private raiseIfArmed(): void {
    if (this.failNext) {
      this.failNext = false
      throw new Error('MockSignatureProvider simulated failure: sign unavailable')
    }
  }
}
