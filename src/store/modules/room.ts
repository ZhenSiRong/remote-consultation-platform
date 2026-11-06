import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * 会诊室视图状态。
 *
 * 红线：**store 只存视图状态，room 对象禁止入 store**。
 * 会场是多人共享的实时态，唯一来源是接口（GET /consultations/:id/room）。
 * 一旦把 room 复制一份进 store，静音别人之后 store 里的副本不会更新，
 * 页面就会出现「成员卡片是灰的、底部控制条还是亮的」这种自相矛盾的画面；
 * 而且两处都能写，出了 bug 谁也说不清是谁改的。
 *
 * 这里只放「不来自后端、但离开再回来还想保留」的东西：
 * 当前会诊单、侧栏页签、本地麦克风/摄像头开关、录制合规提示是否已弹过。
 */

/** 侧栏页签：成员 / 聊天 / 会诊资料 */
export type RoomSidebarTab = 'participants' | 'chat' | 'record'

export const useRoomStore = defineStore('room', () => {
  /** 当前会诊单 id：用于离开页面后判断「是不是同一个会诊」，避免把上一位患者的页签状态带过来 */
  const consultationId = ref<string | null>(null)

  /** 侧栏当前 tab：'participants' | 'chat' | 'record' */
  const sidebarTab = ref<RoomSidebarTab>('participants')

  /**
   * 本地媒体开关（只影响本地渲染，权威态在 room.participants 里）。
   * 为什么要这一份：设备检测页选好的开关要在进入会场时立刻生效，
   * 而此刻 join 请求还没回来、room 里还没有"我"这个参会方。
   */
  const localMicMuted = ref(false)
  const localCameraOn = ref(true)

  /** 是否已显示录制合规提示（R13：进会诊室首次必须提示一次） */
  const recordingNoticeShown = ref(false)

  /**
   * 重置。
   * 什么时候必须调：切换到**另一张会诊单**的会场时。
   * 不清的话，上一场的页签和「已提示过录制」会带过来，第二场会诊就看不到合规提示了——
   * 这正是 R13 要求「每次进入都提示」的场景。
   */
  function reset(): void {
    consultationId.value = null
    sidebarTab.value = 'participants'
    localMicMuted.value = false
    localCameraOn.value = true
    recordingNoticeShown.value = false
  }

  return {
    consultationId,
    sidebarTab,
    localMicMuted,
    localCameraOn,
    recordingNoticeShown,
    reset,
  }
})
