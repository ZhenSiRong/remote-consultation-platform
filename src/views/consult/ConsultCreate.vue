<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ERROR_CODES } from '@rcp/shared'
import PageCard from '@/components/PageCard/PageCard.vue'
import MaskedText from '@/components/MaskedText/MaskedText.vue'
import ConsultCompliancePanel from '@/components/consult/ConsultCompliancePanel.vue'
import { createConsultation, precheckConsult } from '@/api/consult'
import type { PrecheckResult } from '@/api/consult'
import { ApiError } from '@/api/request'
import { maskName } from '@/domain/mask/rules'
import { DOCTOR_OPTIONS, ORG_OPTIONS, PATIENT_OPTIONS } from '@/mock/fixtures'
import type { PatientOption } from '@/mock/fixtures'

/**
 * 发起会诊页（C-02）。
 *
 * 这一页是「合规优先」的表单：先选患者，再由 `precheckConsult` 决定能不能提交。
 * 阻断的判定**只有接口一个来源**——面板展示的是接口返回的 4 项，提交时看的也是
 * `result.blocked`，两者同源，不会出现「面板全绿但提交被 20003 拦下」的割裂。
 *
 * 提交按钮在阻断时**不置灰**：演示和真实使用都需要「点下去才知道为什么不行」，
 * 拦截放在点击之后、请求之前，红条里给原因 + 下一步；后端 20003 走同一个渲染函数兜底。
 *
 * 首诊患者（R3）在候选里直接置灰：能在下拉阶段拦住的，就不要留到提交后才报错。
 * 但真实流程里患者可能是从别的页面带过来的（`?patientId=`），所以预选路径仍要
 * 正常走预检并给出阻断——置灰只约束「在本页手动挑选」这一条路径。
 */

/** 科室候选：与 mock 种子数据里的科室一一对应，避免选到没有申请医师的科室 */
const DEPARTMENT_OPTIONS = ['心内科', '神经内科', '呼吸内科', '影像科', '肿瘤科'] as const

/** 性别枚举（契约层是 MALE/FEMALE/UNKNOWN）→ 中文展示 */
const GENDER_LABEL: Record<string, string> = { MALE: '男', FEMALE: '女', UNKNOWN: '未知' }

/** 受邀医生上限，与契约 createConsultationSchema 的 max(20) 对齐 */
const MAX_INVITED_DOCTORS = 20

interface CreateForm {
  patientId: string
  invitedOrgId: string
  invitedDoctorIds: string[]
  departmentName: string
  consultPurpose: string
  chiefComplaint: string
  diagnosisSummary: string
  /** 空串表示未填；提交时转成 null（契约字段可空） */
  scheduledAt: string
}

const router = useRouter()
const route = useRoute()
const formRef = ref<FormInstance>()

const form = reactive<CreateForm>({
  patientId: '',
  invitedOrgId: '',
  invitedDoctorIds: [],
  departmentName: '',
  consultPurpose: '',
  chiefComplaint: '',
  diagnosisSummary: '',
  scheduledAt: '',
})

const rules: FormRules = {
  patientId: [{ required: true, message: '请选择患者', trigger: 'change' }],
  invitedOrgId: [{ required: true, message: '请选择受邀机构', trigger: 'change' }],
  invitedDoctorIds: [
    {
      required: true,
      type: 'array',
      min: 1,
      message: '至少选择 1 位受邀医生',
      trigger: 'change',
    },
  ],
  departmentName: [{ required: true, message: '请选择会诊科室', trigger: 'change' }],
  consultPurpose: [{ required: true, message: '请填写会诊目的', trigger: 'blur' }],
  chiefComplaint: [{ required: true, message: '请填写主诉', trigger: 'blur' }],
  diagnosisSummary: [{ required: true, message: '请填写诊断摘要', trigger: 'blur' }],
}

const precheck = ref<PrecheckResult | null>(null)
const precheckLoading = ref(false)
const submitting = ref(false)

/**
 * 首诊拦截红条。
 *
 * 为什么按钮不 disabled：这条规则要能被「看见」。灰按钮只能传达「不能点」，
 * 传达不了「首诊不得发起远程会诊」——用户点下去才拿到原因 + 下一步，才算学到规则。
 * 所以拦截发生在点击之后、发请求之前：预检已判死就本地拦，不发无谓请求；
 * 预检结果过期等竞态下真发出去的请求被后端 20003 拒掉，也走同一个渲染函数。
 */
const BLOCK_REASON = '首诊拦截（错误码 20003）：该患者无本院就诊记录，不可发起远程会诊'
const blockVisible = ref(false)
/** 红条自动消失的定时器：5 秒足够读完「原因 + 下一步」，又不会长期占住版面 */
const BLOCK_AUTO_HIDE_MS = 5000
let blockTimer: ReturnType<typeof setTimeout> | null = null

function showBlockBar(): void {
  blockVisible.value = true
  if (blockTimer !== null) {
    clearTimeout(blockTimer)
  }
  blockTimer = setTimeout(() => {
    blockVisible.value = false
    blockTimer = null
  }, BLOCK_AUTO_HIDE_MS)
}

function hideBlockBar(): void {
  blockVisible.value = false
  if (blockTimer !== null) {
    clearTimeout(blockTimer)
    blockTimer = null
  }
}

onBeforeUnmount(hideBlockBar)

const selectedPatient = computed<PatientOption | null>(
  () => PATIENT_OPTIONS.find((item) => item.id === form.patientId) ?? null,
)

/** 受邀医生按机构过滤：跨机构选人必然 20002，不如在候选里就不给 */
const doctorOptions = computed(() =>
  DOCTOR_OPTIONS.filter((item) => item.orgId === form.invitedOrgId),
)

function patientLabel(patient: PatientOption): string {
  // 姓名脱敏后再拼标签：下拉展开、截图、DOM 里都不会出现完整姓名（R8）
  return `${maskName(patient.name)}（${GENDER_LABEL[patient.gender] ?? '未知'} / ${patient.age}岁）`
}

/**
 * 预检请求的序号：连续切换患者时，只认最后一次的响应。
 * 没有这个序号，先发的慢请求后到，会把新患者的结论覆盖成旧患者的。
 */
let precheckSeq = 0

async function runPrecheck(patientId: string): Promise<void> {
  if (!patientId) {
    precheckSeq += 1
    precheck.value = null
    precheckLoading.value = false
    return
  }

  const seq = ++precheckSeq
  precheckLoading.value = true
  try {
    const result = await precheckConsult(patientId)
    if (seq === precheckSeq) {
      precheck.value = result
    }
  } catch (error) {
    if (seq === precheckSeq) {
      precheck.value = null
      ElMessage.error(error instanceof ApiError ? error.message : '合规校验失败，请稍后重试')
    }
  } finally {
    if (seq === precheckSeq) {
      precheckLoading.value = false
    }
  }
}

/** 换患者后旧结论一律作废：预检结果和 20003 提示都属于上一个人 */
watch(
  () => form.patientId,
  (patientId) => {
    precheck.value = null
    hideBlockBar()
    void runPrecheck(patientId)
  },
  { immediate: true },
)

/** 换机构时清掉不属于新机构的医生，否则会带着不可见的脏值提交 */
watch(
  () => form.invitedOrgId,
  () => {
    const allowed = new Set(doctorOptions.value.map((item) => item.id))
    form.invitedDoctorIds = form.invitedDoctorIds.filter((id) => allowed.has(id))
  },
)

function handleBack(): void {
  router.push('/consult')
}

async function handleSubmit(): Promise<void> {
  // 前置拦截：预检已经判死，直接给原因，不发请求（既快又不留无意义的调用痕迹）
  if (precheck.value?.blocked) {
    showBlockBar()
    return
  }

  const instance = formRef.value
  if (!instance) return

  // validate 失败时 reject 成 false：不弹全局错误，字段级红字已经说明了问题
  const valid = await instance.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  hideBlockBar()
  try {
    const order = await createConsultation({
      patientId: form.patientId,
      invitedOrgId: form.invitedOrgId,
      invitedDoctorIds: form.invitedDoctorIds,
      departmentName: form.departmentName,
      consultPurpose: form.consultPurpose.trim(),
      chiefComplaint: form.chiefComplaint.trim(),
      diagnosisSummary: form.diagnosisSummary.trim(),
      scheduledAt: form.scheduledAt || null,
      // 本页只有申请医师本人发起，代发起入口在协调员工作台（3.6B）
      createdOnBehalf: false,
    })
    ElMessage.success('会诊单已创建')
    await router.push(`/consult/${order.id}`)
  } catch (error) {
    handleSubmitError(error)
  } finally {
    submitting.value = false
  }
}

/**
 * 20003 是「拦截类」错误：必须给出原因 + 下一步（3.5D），所以留在页面顶部，
 * 而不是一闪而过的 toast。前端预检与后端兜底共用这一个渲染函数，文案不会两套。
 */
function handleSubmitError(error: unknown): void {
  if (!(error instanceof ApiError)) {
    ElMessage.error('提交失败，请稍后重试')
    return
  }
  if (error.code === ERROR_CODES.FIRST_VISIT_BLOCKED) {
    showBlockBar()
    return
  }
  ElMessage.error(error.message)
}

/**
 * 支持从患者列表/病历页带参进入（`/consult/create?patientId=xxx`）。
 * 带过来的患者可能正是首诊（下拉里置灰的那位），此时不拦入口，
 * 交给预检把阻断原因说清楚——这正是演示 R3 拦截的入口。
 */
const presetPatientId = typeof route.query.patientId === 'string' ? route.query.patientId : ''
if (presetPatientId && PATIENT_OPTIONS.some((item) => item.id === presetPatientId)) {
  form.patientId = presetPatientId
}
</script>

<template>
  <section class="consult-create">
    <header class="consult-create__header">
      <button class="consult-create__back" type="button" @click="handleBack">返回</button>
      <h1 class="consult-create__title">发起会诊</h1>
    </header>

    <!-- 首诊拦截：前端预检与后端 20003 共用，5 秒自动消失，也可手动关闭 -->
    <div v-if="blockVisible" class="consult-create__blocked" role="alert">
      <div class="consult-create__blocked-body">
        <p class="consult-create__blocked-title">{{ BLOCK_REASON }}</p>
        <p class="consult-create__blocked-next">
          下一步：请先为患者补录本院就诊记录，或改选有就诊记录的患者
        </p>
      </div>
      <button
        class="consult-create__blocked-close"
        type="button"
        aria-label="关闭提示"
        @click="hideBlockBar"
      >
        ×
      </button>
    </div>

    <el-form
      ref="formRef"
      class="consult-create__form"
      :model="form"
      :rules="rules"
      label-width="104px"
      label-position="right"
    >
      <!-- ① 患者 -->
      <PageCard title="患者信息">
        <div
          class="consult-create__patient"
          :class="{ 'consult-create__patient--solo': !selectedPatient }"
        >
          <el-form-item label="患者" prop="patientId" class="consult-create__patient-select">
            <el-select
              v-model="form.patientId"
              class="consult-create__control"
              filterable
              placeholder="输入姓名或住院号搜索"
            >
              <el-option
                v-for="patient in PATIENT_OPTIONS"
                :key="patient.id"
                :label="patientLabel(patient)"
                :value="patient.id"
                :disabled="!patient.hasPriorVisit"
              >
                <span>{{ patientLabel(patient) }}</span>
                <span v-if="!patient.hasPriorVisit" class="consult-create__option-note">
                  首诊不可选
                </span>
              </el-option>
            </el-select>
          </el-form-item>

          <div v-if="selectedPatient" class="consult-create__patient-card">
            <p class="consult-create__patient-name">{{ maskName(selectedPatient.name) }}</p>
            <dl class="consult-create__patient-fields">
              <div class="consult-create__patient-field">
                <dt>住院号</dt>
                <dd><MaskedText :value="selectedPatient.inpatientNo" level="inpatientNo" /></dd>
              </div>
              <div class="consult-create__patient-field">
                <dt>性别</dt>
                <dd>{{ GENDER_LABEL[selectedPatient.gender] ?? '未知' }}</dd>
              </div>
              <div class="consult-create__patient-field">
                <dt>年龄</dt>
                <dd>{{ selectedPatient.age }} 岁</dd>
              </div>
            </dl>
            <p v-if="!selectedPatient.hasPriorVisit" class="consult-create__patient-warn">
              无本院就诊记录，不可发起远程会诊（R4 / 20003）
            </p>
          </div>
        </div>
      </PageCard>

      <!-- ② 受邀方 -->
      <PageCard title="受邀方">
        <div class="consult-create__grid">
          <el-form-item label="受邀机构" prop="invitedOrgId">
            <el-select
              v-model="form.invitedOrgId"
              class="consult-create__control"
              placeholder="请选择受邀机构"
            >
              <el-option
                v-for="org in ORG_OPTIONS"
                :key="org.id"
                :label="org.name"
                :value="org.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="受邀医生" prop="invitedDoctorIds">
            <el-select
              v-model="form.invitedDoctorIds"
              class="consult-create__control"
              multiple
              :multiple-limit="MAX_INVITED_DOCTORS"
              :disabled="!form.invitedOrgId"
              :placeholder="form.invitedOrgId ? '可多选，最多 20 位' : '请先选择受邀机构'"
            >
              <el-option
                v-for="doctor in doctorOptions"
                :key="doctor.id"
                :label="`${doctor.name}（${doctor.title}）`"
                :value="doctor.id"
                :disabled="!doctor.qualificationOk"
              >
                <span>{{ doctor.name }}（{{ doctor.title }}）</span>
                <span v-if="!doctor.qualificationOk" class="consult-create__option-note">
                  资质不符（R5）
                </span>
              </el-option>
            </el-select>
          </el-form-item>
        </div>
      </PageCard>

      <!-- ③ 会诊信息 -->
      <PageCard title="会诊信息">
        <div class="consult-create__grid">
          <el-form-item label="会诊科室" prop="departmentName">
            <el-select
              v-model="form.departmentName"
              class="consult-create__control"
              placeholder="请选择科室"
            >
              <el-option
                v-for="department in DEPARTMENT_OPTIONS"
                :key="department"
                :label="department"
                :value="department"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="期望时间" prop="scheduledAt">
            <el-date-picker
              v-model="form.scheduledAt"
              class="consult-create__control"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm:ss+08:00"
              placeholder="可不填，由受邀方排期"
            />
          </el-form-item>

          <el-form-item label="会诊目的" prop="consultPurpose" class="consult-create__grid-full">
            <el-input
              v-model="form.consultPurpose"
              maxlength="500"
              show-word-limit
              placeholder="一句话说明需要专家解决什么问题"
            />
          </el-form-item>

          <el-form-item label="主诉" prop="chiefComplaint" class="consult-create__grid-full">
            <el-input
              v-model="form.chiefComplaint"
              type="textarea"
              :rows="3"
              maxlength="500"
              show-word-limit
              placeholder="主要症状、持续时间、加重诱因"
            />
          </el-form-item>

          <el-form-item label="诊断摘要" prop="diagnosisSummary" class="consult-create__grid-full">
            <el-input
              v-model="form.diagnosisSummary"
              type="textarea"
              :rows="4"
              maxlength="1000"
              show-word-limit
              placeholder="已明确的诊断、关键检查结果、当前治疗"
            />
          </el-form-item>
        </div>
      </PageCard>

      <!-- ④ 合规预检（只读，结论完全来自接口） -->
      <PageCard title="合规预检">
        <ConsultCompliancePanel :result="precheck" :loading="precheckLoading" />
      </PageCard>
    </el-form>

    <footer class="consult-create__actions">
      <el-button @click="handleBack">取消</el-button>
      <el-button
        class="consult-create__submit"
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
      >
        提交
      </el-button>
    </footer>
  </section>
</template>

<style scoped>
.consult-create {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.consult-create__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.consult-create__back {
  padding: var(--spacing-xs) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-container);
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  cursor: pointer;
}

.consult-create__back:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.consult-create__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--color-text-primary);
}

.consult-create__blocked {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border: 1px solid color-mix(in srgb, var(--status-danger) 40%, transparent);
  border-left: 3px solid var(--status-danger);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--status-danger) 10%, transparent);
}

.consult-create__blocked-body {
  flex: 1;
  min-width: 0;
}

.consult-create__blocked-close {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-lg);
  line-height: 1;
  cursor: pointer;
}

.consult-create__blocked-close:hover {
  color: var(--status-danger);
}

.consult-create__blocked-title {
  margin: 0 0 var(--spacing-xs);
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--status-danger);
}

.consult-create__blocked-next {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.consult-create__form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.consult-create__control {
  width: 100%;
}

.consult-create__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--spacing-lg);
}

.consult-create__grid-full {
  grid-column: 1 / -1;
}

/* 患者区左右分栏：左侧选人，右侧回显卡片，避免选完还要往上翻看信息 */
.consult-create__patient {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--spacing-lg);
  align-items: start;
}

/* 未选患者时右侧没有卡片，下拉独占一行——否则左边半个空框看着像缺了东西 */
.consult-create__patient--solo {
  grid-template-columns: minmax(0, 1fr);
}

.consult-create__patient-select {
  margin-bottom: 0;
}

.consult-create__patient-card {
  padding: var(--spacing-md);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-bg-muted);
}

.consult-create__patient-name {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}

.consult-create__patient-fields {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  margin: 0;
}

.consult-create__patient-field {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-xs);
}

.consult-create__patient-field dt {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.consult-create__patient-field dd {
  margin: 0;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.consult-create__patient-warn {
  margin: var(--spacing-sm) 0 0;
  font-size: var(--font-size-xs);
  color: var(--status-danger);
}

/* 下拉里被禁用的选项也要说明原因，否则用户只看到灰条不知道为什么 */
.consult-create__option-note {
  margin-left: var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--status-danger);
}

.consult-create__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
  box-shadow: var(--shadow-sm);
}
</style>
