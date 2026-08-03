/**
 * HUD 顯示資料模型：把 `GameState` 轉成畫面上要顯示的純資料（血量百分比、冷卻秒數、
 * 三選一卡片、階段橫幅文字……），不碰 DOM。DOM 接線是 `hud-dom.ts` 的職責——
 * 沿用 `src/input/rebind-panel.ts` 的既有慣例：邏輯（這裡）有測試，DOM 接線
 * （那裡）沒有測試，因為所有可驗證的邏輯都已經在這裡覆蓋。
 */
import { TICK_SECONDS, type GameState, type MarkId } from '../core/index.js'
import type { ActionId, BindingsState } from '../input/index.js'
import { draftCardContent, type DraftCardContent } from './mark-content.js'
import { describeDungeonScene } from './dungeon-view.js'

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
  readonly selectedBuild: readonly { readonly id: MarkId; readonly name: string; readonly school: DraftCardContent['school'] }[]
  readonly draftNumber: number
  readonly showDraft: boolean
  readonly draftCards: readonly DraftCardContent[]
  readonly banner: Banner
  readonly roomName: string
  readonly objective: string
  readonly selectedMarkId: MarkId | null
  readonly actionSlots: readonly ActionSlot[]
}

export type ActionSlot = {
  readonly id: 'attack' | 'dodge' | 'skillQ' | 'skillE'
  readonly label: string
  readonly binding: string
  readonly cooldownPercent: number
  readonly cooldownSeconds: number
  readonly failed: boolean
}

const PHASE_LABELS: Record<GameState['phase'], string> = {
  encounter1: '遭遇 1／2：焰奴 × 1',
  draft: '三選一',
  encounter2: '遭遇 2／2：焰奴 × 2 ＋ 影刺客 × 1',
  encounter3: '熾影迴廊 1／2',
  encounter4: '熾影迴廊 2／2',
  encounter5: '決鬥場核心 1／2',
  encounter6: '決鬥場核心 2／2',
  boss: '最終戰：灰燼君主',
  victory: '勝利',
  defeat: '戰敗',
}
const FIRST_DRAFT: readonly MarkId[] = ['ember-core', 'precision-afterimage', 'charged-retaliation']

function cooldownSeconds(ticksRemaining: number): number {
  return Math.max(0, Math.round(ticksRemaining * TICK_SECONDS * 10) / 10)
}

function markName(markId: MarkId | null): string | null {
  return markId === null ? null : draftCardContent(markId).name
}

function banner(state: GameState): Banner {
  if (state.phase === 'victory') return { title: '餘火未熄', subtitle: '再試一種印記｜按 R 重新開始' }
  if (state.phase === 'defeat') return { title: '餘火熄滅', subtitle: '重新挑戰｜按 R' }
  return null
}

const ACTION_LABELS: Readonly<Record<ActionSlot['id'], string>> = {
  attack: '斬擊', dodge: '閃避', skillQ: '戰技 Q', skillE: '戰技 E',
}

export function bindingLabel(code: string | null): string {
  if (code === null) return '未綁定'
  if (code === 'Mouse0') return '滑鼠左鍵'
  if (code === 'Mouse1') return '滑鼠中鍵'
  if (code === 'Mouse2') return '滑鼠右鍵'
  if (code === 'Space') return '空白鍵'
  if (code.startsWith('Key')) return code.slice(3)
  return code.replace('Arrow', '方向')
}

function actionSlots(state: GameState, bindings?: BindingsState): readonly ActionSlot[] {
  const codes: Partial<Record<ActionId, string | null>> = bindings ?? {}
  const qSeconds = cooldownSeconds(state.player.qCooldownTicksRemaining)
  const eSeconds = cooldownSeconds(state.player.eCooldownTicksRemaining)
  return (['attack', 'dodge', 'skillQ', 'skillE'] as const).map((id) => {
    const seconds = id === 'dodge' ? cooldownSeconds(state.player.dodge.cooldownTicksRemaining) : id === 'skillQ' ? qSeconds : id === 'skillE' ? eSeconds : 0
    const maximum = id === 'dodge' ? 0.8 : id === 'skillQ' ? 2 : id === 'skillE' ? 3 : 1
    return {
      id,
      label: ACTION_LABELS[id],
      binding: bindingLabel(codes[id] ?? ({ attack: 'Mouse0', dodge: 'Space', skillQ: 'KeyQ', skillE: 'KeyE' } as const)[id]),
      cooldownPercent: Math.max(0, Math.min(100, seconds / maximum * 100)),
      cooldownSeconds: seconds,
      failed: id === 'skillE' && state.events.some((event) => event.type === 'eFailed'),
    }
  })
}

export function buildHudViewModel(state: GameState, bindings?: BindingsState): HudViewModel {
  const alive = state.enemies.filter((enemy) => enemy.hp > 0).length
  const scene = describeDungeonScene(state.phase, alive, state.encounterIndex)
  return {
    hpPercent: Math.max(0, Math.min(100, (state.player.hp / PLAYER_MAX_HP_PER_README) * 100)),
    hpText: `${Math.max(0, Math.round(state.player.hp))} / ${PLAYER_MAX_HP_PER_README}`,
    qCooldownSecondsRemaining: cooldownSeconds(state.player.qCooldownTicksRemaining),
    eCooldownSecondsRemaining: cooldownSeconds(state.player.eCooldownTicksRemaining),
    phaseLabel: PHASE_LABELS[state.phase],
    selectedMarkName: markName(state.selectedMark),
    selectedBuild: state.selectedMarks.map((id) => {
      const card = draftCardContent(id)
      return { id, name: card.name, school: card.school }
    }),
    draftNumber: Math.min(6, state.encounterIndex + 1),
    showDraft: state.phase === 'draft',
    draftCards: (state.draftOptions.length > 0 ? state.draftOptions : FIRST_DRAFT).map((id) => draftCardContent(id)),
    banner: banner(state),
    roomName: scene.roomName,
    objective: scene.objective,
    selectedMarkId: state.selectedMark,
    actionSlots: actionSlots(state, bindings),
  }
}
