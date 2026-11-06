/**
 * 对象存储 adapter（录制 / 附件 / 影像）。R11：境内存储，前端不得持有长期凭证，
 * 所以只下发短期签名 URL（ttl 由调用方按场景给）。
 */
export interface StoredObject {
  key: string
  size: number
}

export interface StorageProvider {
  put(key: string, body: Uint8Array): Promise<StoredObject>
  /** 短期可访问地址，禁止返回长期凭证 */
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>
  remove(key: string): Promise<void>
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER')

/** 骨架占位：内存 Map，无真实对象存储 */
export class FakeStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, Uint8Array>()

  /** 置为 true 后，下一次调用即抛错（模拟上传 / 下载失败） */
  failNext = false

  async put(key: string, body: Uint8Array): Promise<StoredObject> {
    this.raiseIfArmed()
    this.objects.set(key, body)
    return { key, size: body.byteLength }
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    this.raiseIfArmed()
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds
    return `/fake-storage/${key}?expires=${expires}`
  }

  async remove(key: string): Promise<void> {
    this.raiseIfArmed()
    this.objects.delete(key)
  }

  private raiseIfArmed(): void {
    if (this.failNext) {
      this.failNext = false
      throw new Error('FakeStorageProvider simulated failure: object storage unavailable')
    }
  }
}
