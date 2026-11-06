import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SORT_ORDERS } from '../common/pagination';

/**
 * 契约基元 + 分页契约 —— 架构决策.md 3.5B / 3.5C / A-08
 *
 * 请求侧 schema 是唯一校验源；实体类型由 schema `z.infer` 派生（见 types/），
 * 保证「文档说一套、代码写一套」不会发生（S-10）。
 */

/** ISO 8601 带时区：`2026-10-23T09:12:00+08:00`（3.4A 传输格式） */
export const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

/** 仅日期：`2026-10-23`（3.4A 日期范围搜索） */
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 16–32 位十六进制（3.8.4A5） */
export const TRACE_ID_PATTERN = /^[0-9a-f]{16,32}$/;

/** `sha256:<64 位小写十六进制>`；允许省略前缀（3.8.4C1 / C3） */
export const CONTENT_HASH_PATTERN = /^(?:sha256:)?[0-9a-f]{64}$/;

export const isoDateTimeSchema = z
  .string()
  .regex(ISO_DATETIME_PATTERN, '时间必须是 ISO 8601 带时区格式，如 2026-10-23T09:12:00+08:00');

export const dateOnlySchema = z.string().regex(DATE_ONLY_PATTERN, '日期必须是 yyyy-MM-dd');

export const idSchema = z.string().min(1).max(64);

export const traceIdSchema = z.string().regex(TRACE_ID_PATTERN, 'traceId 必须是 16–32 位小写十六进制');

export const contentHashSchema = z
  .string()
  .regex(CONTENT_HASH_PATTERN, '内容哈希必须是 sha256:<64 位小写十六进制>');

export const GENDERS = ['MALE', 'FEMALE', 'UNKNOWN'] as const;
export const genderSchema = z.enum(GENDERS);

/**
 * 患者脱敏视图（共享内核 patientContext，3.2）
 * 字段一律为**后端已脱敏**的展示值，前端不持有明文、不解掩码（A-06）。
 */
export const patientBriefSchema = z.object({
  patientId: idSchema,
  /** 脱敏姓名，如 `李*` */
  nameMasked: z.string().min(1).max(64),
  gender: genderSchema,
  age: z.number().int().min(0).max(150),
  idCardMasked: z.string().max(64).nullable(),
  phoneMasked: z.string().max(32).nullable(),
  /** 住院号/病历号，后 4 位可见 */
  inpatientNoMasked: z.string().max(64).nullable(),
  orgId: idSchema,
  departmentName: z.string().max(64).nullable(),
});

/** 分页请求：page 从 1 起；pageSize 默认 20、上限 100；业务筛选参数平铺在 query 上 */
export const pageQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.string().max(64).optional(),
  sortOrder: z.enum(SORT_ORDERS).optional(),
});

/** 分页响应：`data: { list, total, page, pageSize }` */
export function pageResultSchema<TItem extends z.ZodTypeAny>(itemSchema: TItem) {
  return z.object({
    list: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
  });
}

/** 统一响应体外壳；`code = 0` 为成功 */
export function apiResponseSchema<TData extends z.ZodTypeAny>(dataSchema: TData) {
  return z.object({
    code: z.number().int().min(0),
    message: z.string(),
    data: dataSchema,
    traceId: traceIdSchema,
    timestamp: isoDateTimeSchema,
  });
}
