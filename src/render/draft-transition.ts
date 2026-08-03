import type { MarkId, RunPhase } from '../core/index.js'

/** 清房命中回饋、敵人消散與玩家放開最後一擊所共用的短暫安全窗。 */
export const DRAFT_REVEAL_DELAY_MS = 700

export type DraftTransitionPresentation = Readonly<{
  showDraft: boolean
  showClearFeedback: boolean
}>

export type DraftTransition = {
  observePhase(phase: RunPhase, nowMs: number): void
  presentation(phase: RunPhase, nowMs: number): DraftTransitionPresentation
  trySelect(markId: MarkId, nowMs: number): MarkId | null
}

/**
 * 純表現／輸入閘門：core 仍在清房 tick 立即結算為 draft，只有 HUD 延後顯示。
 * `onEnterDraft` 由輸入薄殼清掉舊 held／edge；選卡則必須在安全窗後重新點擊。
 */
export function createDraftTransition(onEnterDraft: () => void): DraftTransition {
  let previousPhase: RunPhase | null = null
  let revealAtMs: number | null = null

  return {
    observePhase(phase: RunPhase, nowMs: number): void {
      if (phase === 'draft' && previousPhase !== 'draft') {
        revealAtMs = nowMs + DRAFT_REVEAL_DELAY_MS
        onEnterDraft()
      } else if (phase !== 'draft') {
        revealAtMs = null
      }
      previousPhase = phase
    },
    presentation(phase: RunPhase, nowMs: number): DraftTransitionPresentation {
      if (phase !== 'draft' || revealAtMs === null) return { showDraft: false, showClearFeedback: false }
      const ready = nowMs >= revealAtMs
      return { showDraft: ready, showClearFeedback: !ready }
    },
    trySelect(markId: MarkId, nowMs: number): MarkId | null {
      return previousPhase === 'draft' && revealAtMs !== null && nowMs >= revealAtMs ? markId : null
    },
  }
}
