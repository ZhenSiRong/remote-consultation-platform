<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ERROR_CODES } from '@rcp/shared'
import type { Room } from '@/api/types'
import { transitionConsult } from '@/api/consult'
import { ApiError } from '@/api/request'

/**
 * 结束会诊弹窗。
 *
 * 三个必填项是「会后小结」的雏形：结论 / 建议 / 是否随访。
 * **本切片不落库**——记录域（W7）还没有写小结的接口，硬塞进 transition 的 body
 * 会造出一个契约里不存在的字段，接真后端时要么被丢弃、要么被 400 拒掉。
 * 所以这里只做「填完才能结束」的流程约束，内容本身先不发送：
 * 小结内容待 W7 记录域接口接入后补落库。
 *
 * 另一条：结束的合法性**只认接口**。页面不预先判断工单是不是 IN_PROGRESS，
 * 状态机的唯一真相在后端（前端那份只用于按钮可见性），
 * 20005 交给错误分支提示，避免「前端以为能结束、后端拒绝」时用户拿不到原因。
 *
 * 稳定 class（验收脚本依赖）：`.room-end-dialog` / `.room-end-dialog__submit`
 * / `.room-end-dialog__cancel`。
 */
interface Props {
  visible: boolean
  room: Room
  consultationId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [v: boolean]
  /** 结束成功，父组件负责跳转 */
  ended: []
}>()

/**
 * 弹窗显隐走 computed 双向绑定：父组件的 visible 是唯一真相，
 * 组件内不另存一份 visible，否则点右上角关闭时父子两份状态会打架
 * （父组件以为还开着，再点「结束会诊」按钮没有反应）。
 */
const dialogVisible = computed<boolean>({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

interface EndForm {
  /** 会诊结论 */
  conclusion: string
  /** 诊疗建议 */
  suggestion: string
  /** 是否需要随访；空串表示未选（el-radio-group 的未选中态就是空串） */
  followUp: '' | 'yes' | 'no'
}

const form = reactive<EndForm>({
  conclusion: '',
  suggestion: '',
  followUp: '',
})

const formRef = ref<FormInstance>()

/** 校验规则与字段一一对应：任一为空即拦截，不提交 */
const rules: FormRules = {
  conclusion: [{ required: true, message: '请填写会诊结论', trigger: 'blur' }],
  suggestion: [{ required: true, message: '请填写诊疗建议', trigger: 'blur' }],
  followUp: [{ required: true, message: '请选择是否需要随访', trigger: 'change' }],
}

/** 提交中：按钮转圈并禁用，避免连点发出两次 FINISH（第二次必然 20005） */
const submitting = ref(false)

/**
 * 关闭时重置。
 * 挂在 dialog 的 closed 上而不是 visible 变化上：closed 在收起动画结束后才触发，
 * 此时用户已经看不到内容，清空不会出现「文字先消失、弹窗还在」的闪烁。
 */
function resetForm(): void {
  form.conclusion = ''
  form.suggestion = ''
  form.followUp = ''
  formRef.value?.clearValidate()
}

function close(): void {
  dialogVisible.value = false
}

async function submit(): Promise<void> {
  if (submitting.value || !formRef.value) {
    return
  }

  // validate() 校验失败会 reject，这里转成 false；校验信息由 el-form-item 就地展示
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }

  submitting.value = true
  try {
    await transitionConsult(props.consultationId, 'FINISH')
    ElMessage.success('会诊已结束，工单转待签署')
    emit('ended')
    close()
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.message ?? '结束会诊失败，请稍后重试')
    // 20005 = 非法流转：多半是工单已被别人结束/作废，页面拿的还是旧状态。
    // 单独补一句人话，比让用户对着「状态流转非法」猜要清楚。
    if (apiError?.code === ERROR_CODES.ILLEGAL_STATE_TRANSITION) {
      ElMessage.warning('当前工单状态不允许结束会诊')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    class="room-end-dialog"
    title="结束会诊"
    width="560px"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <p class="room-end-dialog__tip">
      结束后工单将转为「待签署」，各方签署齐全后归档。
    </p>
    <p class="room-end-dialog__room">会场 {{ props.room.roomNo }} 将同时关闭。</p>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
      <el-form-item label="会诊结论" prop="conclusion">
        <el-input
          v-model="form.conclusion"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="请填写本次会诊的结论"
        />
      </el-form-item>

      <el-form-item label="诊疗建议" prop="suggestion">
        <el-input
          v-model="form.suggestion"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="请填写后续诊疗建议"
        />
      </el-form-item>

      <el-form-item label="是否需要随访" prop="followUp">
        <el-radio-group v-model="form.followUp">
          <el-radio value="yes">需要</el-radio>
          <el-radio value="no">不需要</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="room-end-dialog__footer">
        <el-button class="room-end-dialog__cancel" :disabled="submitting" @click="close">
          取消
        </el-button>
        <!-- 危险色而不是主色：结束会诊不可撤销，颜色要提前告诉用户这一步的分量 -->
        <el-button
          class="room-end-dialog__submit"
          type="danger"
          :loading="submitting"
          @click="submit"
        >
          确认结束
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.room-end-dialog__tip {
  margin: 0;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

/* 会场号放在提示下方用弱化色：它是「顺带告知」，不该和主提示抢注意力 */
.room-end-dialog__room {
  margin: var(--spacing-xs) 0 var(--spacing-lg);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.room-end-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

/* 弹窗挂到 body（teleport），输入框圆角要穿透到 Element Plus 内部元素才生效 */
.room-end-dialog :deep(.el-textarea__inner) {
  border-radius: var(--radius-sm);
}
</style>
