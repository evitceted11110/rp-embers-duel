/**
 * HUD 顯示資料模型：把 `GameState` 轉成畫面上要顯示的純資料（血量百分比、冷卻秒數、
 * 三選一卡片、階段橫幅文字……），不碰 DOM。DOM 接線是 `hud-dom.ts` 的職責——
 * 沿用 `src/input/rebind-panel.ts` 的既有慣例：邏輯（這裡）有測試，DOM 接線
 * （那裡）沒有測試，因為所有可驗證的邏輯都已經在這裡覆蓋。
 */
import { TICK_SECONDS, type GameState, type MarkId } from '../core/index.js'
import { DRAFT_CARD_ORDER, draftCardContent, type DraftCardContent } from './mark-content.js'

/**
 * `PLAYER_MAX_HP`（`src/core/constants.ts`）本身未經 `src/core/index.ts` 匯出，
 * 只在 `src/core/README.md` 第 3 節以文件形式記載「`player.hp` | 0–220」——這是一個
 * 小小的介面缺口（已在交付報告中回報），渲染層依文件記載的範圍值計算血量百分比，
 * 不深入 import `src/core/constants.ts`（違反「渲染層只從 index.ts import」的慣例）。
 */
const PLAYER_MAX_HP_PER_README = 220

export type Banner = {
  readonly title: string
  readonly subtitle: string
} | null

export type HudViewModel = {
  readonly hpPercent: number
  readonly hpText: string
  readonly qCooldownSecondsRemaining: number
  readonly eCooldownSecondsRemaining: number
  readonly phaseLabel: string
  readonly selectedMarkName: string | null
  readonly showDraft: boolean
  readonly draftCards: readonly DraftCardContent[]
  readonly banner: Banner
}

const PHASE_LABELS: Record<GameState['phase'], string> = {
  encounter1: '遭遇 1／2：焰奴 × 1',
  draft: '三選一',
  encounter2: '遭遇 2／2：焰奴 × 2 ＋ 影刺客 × 1',
  victory: '勝利',
  defeat: '戰敗',
}

function cooldownSeconds(ticksRemaining: number): number {
  return Math.max(0, Math.round(ticksRemaining * TICK_SECONDS * 10) / 10)
}

function markName(markId: MarkId | null): string | null {
  return markId === null ? null : draftCardContent(markId).name
}

function banner(state: GameState): Banner {
  if (state.phase === 'victory') return { title: '勝利', subtitle: '按 R 重新開始，換一條流派再玩一次' }
  if (state.phase === 'defeat') return { title: '戰敗', subtitle: '按 R 重新開始' }
  return null
}

export function buildHudViewModel(state: GameState): HudViewModel {
  return {
    hpPercent: Math.max(0, Math.min(100, (state.player.hp / PLAYER_MAX_HP_PER_README) * 100)),
    hpText: `${Math.max(0, Math.round(state.player.hp))} / ${PLAYER_MAX_HP_PER_README}`,
    qCooldownSecondsRemaining: cooldownSeconds(state.player.qCooldownTicksRemaining),
    eCooldownSecondsRemaining: cooldownSeconds(state.player.eCooldownTicksRemaining),
    phaseLabel: PHASE_LABELS[state.phase],
    selectedMarkName: markName(state.selectedMark),
    showDraft: state.phase === 'draft',
    draftCards: DRAFT_CARD_ORDER.map((id) => draftCardContent(id)),
    banner: banner(state),
  }
}
