<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ERROR_CODES } from '@rcp/shared'
import type { ConsultOrder } from '@/api/types'
import { ApiError } from '@/api/request'
import { transitionConsult } from '@/api/consult'
import type { ConsultAction } from '@/domain/consult/stateMachine'
import { CONSULT_ACTION_META, getAvailableActions, isTerminal } from '@/domain/consult/stateMachine'

/**
 * 会诊工单动作条（C-06 / A-04）。
 *
 * 本组件是「状态机 → 按钮」的唯一映射点：
 * - 渲染哪些按钮、按什么顺序，全部由 `getAvailableActions(order.status)` 决定，
 *   页面里不写任何 `status === 'xxx'` 判断。一旦允许页面自己判断，
 *   演示时就会出现「按钮能点、接口回 20005」这种最掉分的组合。
 * - 文案、按钮样式、是否需要原因、是否需要二次确认，全部取自 `CONSULT_ACTION_META`，
 *   页面拿不到第二份动作表，也就不会出现「同一个动作两种叫法」。
 *
 * 组件不自己弹错误提示：失败一律 emit 给父页面，由父页面统一渲染红条并刷新状态。
 * 这样「错误展示位置」只有一处，不会出现 Message + 红条 双重提示。
 */
interface Props {
  order: ConsultOrder
  /** 父页面正在加载/刷新详情时，动作条一并置灰，避免拿着旧状态点出新错误 */
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), { loading: false })

const emit = defineEmits<{
  /** 动作成功，回传后端返回的最新工单，父页面直接替换本地状态 */
  done: [next: ConsultOrder]
  /** 动作失败（含 20005 非法流转），父页面据此显示红条 */
  failed: [payload: { code: number; message: string; traceId: string }]
}>()

/** 当前状态下合法的动作，顺序由状态机给定（正向流程在前，作废永远最后） */
const actions = computed<ConsultAction[]>(() => getAvailableActions(props.order.status))

/** 终态（已归档 / 已作废）没有任何可执行动作，页面改为展示结束提示 */
const ended = computed(() => isTerminal(props.order.status))

/**
 * 正在请求的动作。用它而不是布尔值：
 * 只有被点的那一个按钮转 loading，其余按钮只需 disabled，
 * 用户能看清「我刚点的是哪个」，也避免重复提交。
 */
const pendingAction = ref<ConsultAction | null>(null)

/** 请求中或父页面加载中，所有动作一律不可点 */
const busy = computed(() => props.loading || pendingAction.value !== null)

/** 作废原因弹窗 */
const reasonDialogVisible = ref(false)
const reason = ref('')

/** 原因去掉首尾空白后为空即视为未填：只输入空格不算填了原因 */
const reasonInvalid = computed(() => reason.value.trim().length === 0)

/**
 * 按钮 class 里的动作后缀（accept / schedule / ...）。
 * 单独抽出来是为了让验收脚本能用稳定选择器，例如
 * `.action-bar__action--void`，不必依赖按钮文案或渲染顺序。
 */
function actionClass(action: ConsultAction): string {
  return `action-bar__action--${action.toLowerCase()}`
}

/** kind → Element Plus 按钮 type；default 态显式给 'default'，避免默认值语义漂移 */
function buttonType(action: ConsultAction): 'primary' | 'danger' | 'default' {
  const kind = CONSULT_ACTION_META[action].kind
  return kind === 'primary' ? 'primary' : kind === 'danger' ? 'danger' : 'default'
}

/**
 * 统一提交。成功 emit done、失败 emit failed，两种结果都不在组件内弹提示。
 * 用 finally 复位 pendingAction：无论成功失败，按钮都必须恢复可点，
 * 否则一次网络异常就会把整条动作条锁死。
 */
async function submit(action: ConsultAction, reasonText?: string): Promise<void> {
  pendingAction.value = action
  try {
    const next = await transitionConsult(props.order.id, action, reasonText)
    emit('done', next)
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    emit('failed', {
      code: apiError?.code ?? ERROR_CODES.INTERNAL_ERROR,
      message: apiError?.message ?? (error instanceof Error ? error.message : '操作失败'),
      traceId: apiError?.traceId ?? '',
    })
  } finally {
    pendingAction.value = null
  }
}

/** 二次确认；用户点取消/关闭时 ElMessageBox 会 reject，这里转成 false 表示「中止」 */
async function confirmAction(text: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(text, '确认操作', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    return true
  } catch {
    return false
  }
}

async function handleAction(action: ConsultAction): Promise<void> {
  if (busy.value) return
  const meta = CONSULT_ACTION_META[action]

  // 作废必须先填原因，所以先开弹窗，确认环节放到弹窗里继续（见 confirmVoid）
  if (meta.requiresReason) {
    reason.value = ''
    reasonDialogVisible.value = true
    return
  }

  if (meta.confirmText && !(await confirmAction(meta.confirmText))) return

  await submit(action)
}

/**
 * 作废确认：原因已填 → 再走一次不可逆确认 → 提交。
 * 弹窗只在提交成功后关闭：中途取消二次确认时，用户填的原因还在，不用重填。
 */
async function confirmVoid(): Promise<void> {
  if (reasonInvalid.value || busy.value) return

  const { confirmText } = CONSULT_ACTION_META.VOID
  if (confirmText && !(await confirmAction(confirmText))) return

  await submit('VOID', reason.value.trim())
  reasonDialogVisible.value = false
  reason.value = ''
}

/**
 * 演示按钮：无视状态机直接归档，用来演示后端返回 20005 被前端红条接住。
 * **仅用于演示非法流转拦截，生产环境应移除。**
 * 刻意不复用 handleAction：那条路径会先被状态机筛掉，根本发不出请求。
 */
async function demoArchive(): Promise<void> {
  if (busy.value) return
  await submit('ARCHIVE')
}
</script>

<template>
  <div class="consult-action-bar">
    <template v-if="ended">
      <span class="action-bar__terminal">该工单已结束（已归档/已作废）</span>
    </template>

    <template v-else>
      <el-button
        v-for="action in actions"
        :key="action"
        class="action-bar__action"
        :class="actionClass(action)"
        :data-action="action"
        :type="buttonType(action)"
        :disabled="busy"
        :loading="pendingAction === action"
        @click="handleAction(action)"
      >
        {{ CONSULT_ACTION_META[action].label }}
      </el-button>
    </template>

    <el-button class="action-bar__demo" link type="info" :disabled="busy" @click="demoArchive">
      演示：跳过受理直接归档
    </el-button>

    <el-dialog
      v-model="reasonDialogVisible"
      class="action-bar__reason-dialog"
      title="作废会诊单"
      width="480px"
      :close-on-click-modal="false"
    >
      <p class="action-bar__reason-tip">作废后不可恢复，请填写作废原因（必填）。</p>
      <el-input
        v-model="reason"
        class="action-bar__reason-input"
        type="textarea"
        :rows="3"
        maxlength="200"
        show-word-limit
        placeholder="请输入作废原因"
      />

      <template #footer>
        <el-button class="action-bar__reason-cancel" :disabled="busy" @click="reasonDialogVisible = false">
          取消
        </el-button>
        <!-- 原因为空时禁用：必填校验前移到按钮，用户不用点一次才知道漏填 -->
        <el-button
          class="action-bar__reason-confirm"
          type="danger"
          :disabled="reasonInvalid"
          :loading="pendingAction === 'VOID'"
          @click="confirmVoid"
        >
          确认作废
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.consult-action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

/* 终态提示用弱化文字，不与可点按钮抢视觉焦点 */
.action-bar__terminal {
  font-size: var(--font-size-base);
  color: var(--color-text-tertiary);
}

.action-bar__demo {
  margin-left: var(--spacing-xs);
}

.action-bar__reason-tip {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 弹窗挂在 body 上（teleport），scoped 样式靠 :deep 穿透到输入框内部计数 */
.action-bar__reason-input :deep(.el-textarea__inner) {
  border-radius: var(--radius-sm);
}
</style>
