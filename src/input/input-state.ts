/**
 * 純函式：把「目前按住的 code 集合」＋「鍵位綁定」轉成 core 期待的 `TickInput`
 * 形狀（見 `src/core/README.md` 第 2 節）。不碰 DOM、不讀 `KeyboardEvent`——
 * 這一層只知道字串 code 有沒有在 held 集合裡，讀鍵盤事件是 `controller.ts` 的職責。
 */
import type { MarkId, RunPhase, TickInput } from '../core/index.js'
import { ACTION_IDS, type ActionId, type BindingsConfig, type BindingsState } from './bindings.js'

export type ActionStates = Readonly<Record<ActionId, boolean>>

function effectiveCodes(
  actionId: ActionId,
  bindings: BindingsState,
  config: BindingsConfig,
): readonly string[] {
  const primary = bindings[actionId]
  const actionConfig = config.actions.find((action) => action.id === actionId)
  const codes: string[] = []
  if (primary !== null) codes.push(primary)
  if (actionConfig?.secondaryFixed != null) codes.push(actionConfig.secondaryFixed)
  return codes
}

/** 一個動作只要它任一個有效鍵（可重綁主鍵或固定備援）目前被按住就算「按著」。 */
export function computeActionStates(
  heldCodes: ReadonlySet<string>,
  bindings: BindingsState,
  config: BindingsConfig,
): ActionStates {
  const result = {} as Record<ActionId, boolean>
  for (const id of ACTION_IDS) {
    result[id] = effectiveCodes(id, bindings, config).some((code) => heldCodes.has(code))
  }
  return result as ActionStates
}

/**
 * moveX/moveY 正負號約定：世界座標採螢幕慣例（y 向下為正——見
 * `src/visual/world-grid.ts` 左上原點的整數格點量化），因此「上」對應
 * moveY = -1，「下」對應 moveY = +1。同時按住兩個相反方向會自然抵銷成 0
 * （`src/core/README.md` 明訂的行為）。
 */
export function computeMoveAxis(actionStates: ActionStates): { moveX: number; moveY: number } {
  const moveX = (actionStates.moveRight ? 1 : 0) - (actionStates.moveLeft ? 1 : 0)
  const moveY = (actionStates.moveDown ? 1 : 0) - (actionStates.moveUp ? 1 : 0)
  return { moveX, moveY }
}

/**
 * 組裝這一 tick 要餵給 `tick()` 的 `TickInput`。`draftChoice` 只有在
 * `phase === 'draft'` 時才會透出非 null 值，其餘 phase 一律 `null`——
 * 呼叫端（`controller.ts`）負責在消費一次後把 pending 選擇歸零，這裡本身是純函式，
 * 每次呼叫都只依賴傳入的參數。
 */
export function assembleTickInput(
  actionStates: ActionStates,
  phase: RunPhase,
  pendingDraftChoice: MarkId | null,
  restartHeld: boolean,
  aim: Readonly<{ x: number; y: number }> = { x: 0, y: 0 },
  pendingForgeChoice: string | null = null,
): TickInput {
  const { moveX, moveY } = computeMoveAxis(actionStates)
  return {
    moveX,
    moveY,
    aimX: aim.x,
    aimY: aim.y,
    attack: actionStates.attack,
    dodge: actionStates.dodge,
    skillQ: actionStates.skillQ,
    skillE: actionStates.skillE,
    draftChoice: phase === 'draft' ? pendingDraftChoice : null,
    forgeChoice: phase === 'draft' ? pendingForgeChoice : null,
    restart: restartHeld,
  }
}
