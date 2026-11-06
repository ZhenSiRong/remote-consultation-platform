/**
 * DICOM 阅片能力 port —— 架构决策.md 3.8.5（P-03）/ US-AV-04
 *
 * 只定接口，不实现。fake / 厂商实现都在 `server/src/adapters/dicom/`（B-09）。
 *
 * 硬约束：
 * 1. **不含厂商专有名词**（`dcm4cheeStudyUid` 这类字段一律不得出现）。
 * 2. 后端负责 DICOM 代理，**避免前端直连影像源**；`getFrameUrl` 返回的是短期可用的地址。
 * 3. 实现必须能模拟「影像不可用」与「同步超时」两类失败。
 */

export interface DicomStudyRef {
  patientId: string;
  /** 检查/序列的稳定业务引用，非厂商 ID */
  studyRef: string;
}

export interface DicomSeries {
  seriesId: string;
  studyRef: string;
  modality: string;
  bodyPart: string;
  description: string;
  frameCount: number;
  acquiredAt: string;
}

export interface DicomMetadata {
  seriesId: string;
  studyRef: string;
  /** 患者标识（已脱敏） */
  patientRefMasked: string;
  modality: string;
  bodyPart: string;
  rows: number;
  columns: number;
  pixelSpacing: readonly [number, number] | null;
  /** 窗宽窗位默认值，供工作台初始化 */
  windowCenter: number | null;
  windowWidth: number | null;
}

export interface DicomFrameUrl {
  seriesId: string;
  frameIndex: number;
  url: string;
  expiresAt: string;
  width: number;
  height: number;
}

/** 视口同步：US-AV-04 要求同步翻页/缩放，延迟 < 500ms */
export interface DicomViewport {
  seriesId: string;
  frameIndex: number;
  zoom: number;
  panX: number;
  panY: number;
  windowCenter?: number;
  windowWidth?: number;
}

export interface DicomViewportAck {
  seriesId: string;
  frameIndex: number;
  appliedAt: string;
  participantCount: number;
}

export type DicomErrorCode =
  | 'STUDY_NOT_FOUND'
  | 'IMAGE_UNAVAILABLE'
  | 'SYNC_TIMEOUT'
  | 'NOT_AUTHORIZED'
  | 'PROVIDER_UNAVAILABLE';

export class DicomProviderError extends Error {
  readonly code: DicomErrorCode;

  constructor(code: DicomErrorCode, message: string) {
    super(message);
    this.name = 'DicomProviderError';
    this.code = code;
  }
}

export interface DicomProvider {
  listSeries(ref: DicomStudyRef): Promise<DicomSeries[]>;
  getMetadata(seriesId: string): Promise<DicomMetadata>;
  getFrameUrl(seriesId: string, frameIndex: number): Promise<DicomFrameUrl>;
  syncViewport(roomId: string, viewport: DicomViewport): Promise<DicomViewportAck>;
}
