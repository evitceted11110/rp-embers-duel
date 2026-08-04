/**
 * 副作用薄殼：掛 `addEventListener`、維護「目前按住哪些 code」的 mutable 集合，
 * 每個 tick 呼叫時把它轉成 core 期待的 `TickInput`（轉換邏輯本身在
 * `input-state.ts`，是純函式，這裡只負責讀鍵盤/滑鼠、寫入 held 集合）。
 *
 * 環境參數只宣告我們用得到的最小介面（`InputWindowLike`/`InputDocumentLike`），
 * 不是完整的 DOM `Window`/`Document`——沿用 `@rogue-paradise/platform-sdk`
 * 的既有作法（見其 `BrowserEnvironment`），這樣測試可以傳純物件假環境，
 * 不需要 jsdom（本專案未安裝，也不打算為此新增相依套件）。
 */
import type { MarkId, RunPhase, TickInput } from '../core/index.js'
import { BINDINGS_CONFIG, type BindingsConfig, type BindingsState } from './bindings.js'
import { assembleTickInput, computeActionStates } from './input-state.js'

export type KeyCodeEvent = { readonly code: string }
export type MouseButtonEvent = { readonly button: number }
export type PointerMoveEvent = { readonly clientX: number; readonly clientY: number; readonly target: unknown }
export type ContextMenuEvent = {
  readonly target: unknown
  preventDefault(): void
}
export type ContextMenuTarget = {
  contains(target: unknown): boolean
}

export interface InputWindowLike {
  addEventListener(type: 'keydown', listener: (event: KeyCodeEvent) => void): void
  addEventListener(type: 'keyup', listener: (event: KeyCodeEvent) => void): void
  addEventListener(type: 'mousedown', listener: (event: MouseButtonEvent) => void): void
  addEventListener(type: 'mouseup', listener: (event: MouseButtonEvent) => void): void
  addEventListener(type: 'pointermove', listener: (event: PointerMoveEvent) => void): void
  addEventListener(type: 'blur', listener: () => void): void
  addEventListener(type: 'pointercancel', listener: () => void): void
  addEventListener(type: 'contextmenu', listener: (event: ContextMenuEvent) => void): void
  removeEventListener(type: 'keydown', listener: (event: KeyCodeEvent) => void): void
  removeEventListener(type: 'keyup', listener: (event: KeyCodeEvent) => void): void
  removeEventListener(type: 'mousedown', listener: (event: MouseButtonEvent) => void): void
  removeEventListener(type: 'mouseup', listener: (event: MouseButtonEvent) => void): void
  removeEventListener(type: 'pointermove', listener: (event: PointerMoveEvent) => void): void
  removeEventListener(type: 'blur', listener: () => void): void
  removeEventListener(type: 'pointercancel', listener: () => void): void
  removeEventListener(type: 'contextmenu', listener: (event: ContextMenuEvent) => void): void
}

export interface InputDocumentLike {
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
  readonly hidden: boolean
}

/**
 * 快速重開鍵，固定 `KeyR`，刻意不走可重綁系統：`content/bindings.json` 沒有定義
 * 它；這是整局重試入口，不受戰鬥動作的重綁/衝突規則約束，
 * 因此也不會出現在 `BINDINGS_CONFIG.actions` 或重綁 UI 裡。
 */
export const RESTART_CODE = 'KeyR'

export type InputController = {
  /** 組出這一 tick 要餵給 `tick()` 的 `TickInput`；`draftChoice` 只消費一次。 */
  buildTickInput(phase: RunPhase): TickInput
  /** 三選一 UI 呼叫：下一次 `buildTickInput` 會帶上這個選擇，之後立刻清空。 */
  submitDraftChoice(markId: MarkId): void
  submitForgeChoice(cardId: string): void
  /** 進入選卡前丟棄最後一擊的 held 與尚未消費 edge，要求新的明確操作。 */
  resetForDraft(): void
  /** 重綁完成後呼叫，讓 controller 立刻改用新的鍵位判定。 */
  setBindings(bindings: BindingsState): void
  /** 目前生效的鍵位（重綁 UI 顯示用）。 */
  getBindings(): BindingsState
  /** 移除所有事件監聽器；卸載遊戲或熱重載時呼叫，避免監聽器殘留。 */
  dispose(): void
}

export type CreateInputControllerOptions = {
  bindings: BindingsState
  config?: BindingsConfig
  window?: InputWindowLike
  document?: InputDocumentLike
  contextMenuTarget?: ContextMenuTarget
  resolvePointerAim?(clientX: number, clientY: number): Readonly<{ x: number; y: number }>
  getFallbackAim?(): Readonly<{ x: number; y: number }>
}

export function createInputController(options: CreateInputControllerOptions): InputController {
  const config = options.config ?? BINDINGS_CONFIG
  const win = options.window ?? (globalThis as unknown as InputWindowLike)
  const doc =
    options.document ?? ((globalThis as { document?: unknown }).document as unknown as InputDocumentLike)

  let bindings = options.bindings
  const heldCodes = new Set<string>()
  let pendingDraftChoice: MarkId | null = null
  let pendingForgeChoice: string | null = null
  let lastPointerAim: Readonly<{ x: number; y: number }> | null = null

  const onKeyDown = (event: KeyCodeEvent): void => {
    heldCodes.add(event.code)
  }
  const onKeyUp = (event: KeyCodeEvent): void => {
    heldCodes.delete(event.code)
  }
  const onMouseDown = (event: MouseButtonEvent): void => {
    heldCodes.add(`Mouse${event.button}`)
  }
  const onMouseUp = (event: MouseButtonEvent): void => {
    heldCodes.delete(`Mouse${event.button}`)
  }
  const onPointerMove = (event: PointerMoveEvent): void => {
    if (!options.contextMenuTarget?.contains(event.target)) return
    const aim = options.resolvePointerAim?.(event.clientX, event.clientY)
    if (aim !== undefined && Number.isFinite(aim.x) && Number.isFinite(aim.y)) lastPointerAim = aim
  }
  // 失焦清空：iframe blur、分頁隱藏（visibilitychange）、pointer cancel 都會讓
  // 玩家「看起來還按著」但其實再也收不到對應 keyup/mouseup 事件——這是正確性
  // 問題（角色永遠往同一方向走），不是體驗細節，三個來源都要清。
  const clearHeldState = (): void => {
    heldCodes.clear()
  }
  const onVisibilityChange = (): void => {
    if (doc.hidden) clearHeldState()
  }
  const onContextMenu = (event: ContextMenuEvent): void => {
    const mouse2IsBound = Object.values(bindings).includes('Mouse2')
    if (mouse2IsBound && options.contextMenuTarget?.contains(event.target)) {
      event.preventDefault()
    }
  }

  win.addEventListener('keydown', onKeyDown)
  win.addEventListener('keyup', onKeyUp)
  win.addEventListener('mousedown', onMouseDown)
  win.addEventListener('mouseup', onMouseUp)
  win.addEventListener('pointermove', onPointerMove)
  win.addEventListener('blur', clearHeldState)
  win.addEventListener('pointercancel', clearHeldState)
  win.addEventListener('contextmenu', onContextMenu)
  doc.addEventListener('visibilitychange', onVisibilityChange)

  return {
    buildTickInput(phase: RunPhase): TickInput {
      const actionStates = computeActionStates(heldCodes, bindings, config)
      const restartHeld = heldCodes.has(RESTART_CODE)
      const aim = lastPointerAim ?? options.getFallbackAim?.() ?? { x: 0, y: 0 }
      const result = assembleTickInput(actionStates, phase, pendingDraftChoice, restartHeld, aim, pendingForgeChoice)
      pendingDraftChoice = null
      pendingForgeChoice = null
      return result
    },
    submitDraftChoice(markId: MarkId): void {
      pendingDraftChoice = markId
    },
    submitForgeChoice(cardId: string): void { pendingForgeChoice = cardId },
    resetForDraft(): void {
      clearHeldState()
      pendingDraftChoice = null
      pendingForgeChoice = null
    },
    setBindings(next: BindingsState): void {
      bindings = next
    },
    getBindings(): BindingsState {
      return bindings
    },
    dispose(): void {
      win.removeEventListener('keydown', onKeyDown)
      win.removeEventListener('keyup', onKeyUp)
      win.removeEventListener('mousedown', onMouseDown)
      win.removeEventListener('mouseup', onMouseUp)
      win.removeEventListener('pointermove', onPointerMove)
      win.removeEventListener('blur', clearHeldState)
      win.removeEventListener('pointercancel', clearHeldState)
      win.removeEventListener('contextmenu', onContextMenu)
      doc.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}
