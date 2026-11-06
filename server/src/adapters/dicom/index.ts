/**
 * DICOM adapter（架构决策.md:915，P-03 未定）。
 * 后端做影像代理，避免前端直连影像源；标注与记录业务不因换 SDK 而改。
 * port 应定义在 shared/ports（3.8.5 规则 1），B-04 产出后改为 import type。
 */
export interface DicomSeries {
  seriesId: string
  studyId: string
  frames: number
}

export interface DicomMetadata {
  studyId: string
  modality: string
  bodyPart?: string
}

export interface ViewportState {
  page: number
  zoom: number
  windowCenter: number
  windowWidth: number
}

export interface DicomProvider {
  listSeries(patientRef: string): Promise<readonly DicomSeries[]>
  getMetadata(seriesId: string): Promise<DicomMetadata>
  getFrameUrl(seriesId: string, frame: number): Promise<string>
  syncViewport(roomId: string, state: ViewportState): Promise<void>
}

export const DICOM_PROVIDER = Symbol('DICOM_PROVIDER')

/** 骨架占位：3 组脱敏样本序列（3.8.5），无真实像素 */
export class FakeDicomProvider implements DicomProvider {
  /** 置为 true 后，下一次调用即抛错（模拟影像源不可用） */
  failNext = false

  async listSeries(patientRef: string): Promise<readonly DicomSeries[]> {
    this.raiseIfArmed()
    return [1, 2, 3].map((n) => ({
      seriesId: `fake-series-${n}`,
      studyId: `fake-study-${patientRef}`,
      frames: 40 * n,
    }))
  }

  async getMetadata(seriesId: string): Promise<DicomMetadata> {
    this.raiseIfArmed()
    return { studyId: `fake-study-${seriesId}`, modality: 'CT', bodyPart: 'CHEST' }
  }

  async getFrameUrl(seriesId: string, frame: number): Promise<string> {
    this.raiseIfArmed()
    return `/fake-dicom/${seriesId}/${frame}.png`
  }

  async syncViewport(_roomId: string, _state: ViewportState): Promise<void> {
    this.raiseIfArmed()
  }

  private raiseIfArmed(): void {
    if (this.failNext) {
      this.failNext = false
      throw new Error('FakeDicomProvider simulated failure: source unavailable')
    }
  }
}
