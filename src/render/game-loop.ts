/**
 * 把 accumulator（`fixed-step-loop.ts`）、crash-dump recorder（`src/core/crash-dump.ts`，
 * 見 `src/core/README.md` 第 7 節「渲染層每個 tick 呼叫 recorder.tick(input) 取代直接
 * 呼叫 core 的 tick()」）與渲染層唯一需要的跨 tick 記憶（`vfx-tracker.ts`）組裝成一個
 * 可以直接被 `requestAnimationFrame` 或 headless 測試驅動的物件。
 *
 * 刻意不在這裡做畫面插值（把邏輯 tick 之間的餘數拿來平滑動畫）：100Hz 的邏輯 tick 率
 * 與常見 60Hz 螢幕更新率的比值接近 5:3，世界層本身又是 8px 巨像素網格量化——插值帶來的
 * 平滑增益在這個尺度下不明顯，卻要為每一個狀態欄位決定「這個值能不能被插值」（連續的
 * 位置可以，離散的 `combo.phase` 不行），複雜度與收益不成比例。若 Gate 3 真人測試回饋
 * 「動作看起來卡」，這是最適合回頭加的地方（見交付報告）。
 */
import { createRecorder, type CrashDump, type GameState, type TickInput } from '../core/index.js'
import { createFixedStepLoop } from './fixed-step-loop.js'
import { INITIAL_VFX_STATE, updateVfxState, type VfxState } from './vfx-tracker.js'

export type GameLoop = {
  /** 累積實際經過的畫面時間，內部轉成固定步數的邏輯 tick（accumulator pattern）。 */
  advanceBy(dtSeconds: number): void
  getState(): GameState
  getVfxState(): VfxState
  /** 目前為止的完整可重現素材，出事時直接回報（見 `src/core/README.md` 第 7 節）。 */
  dump(): CrashDump
}

export type CreateGameLoopOptions = {
  readonly seed: string
  /** 每個邏輯 tick 呼叫一次，組出這一 tick 要餵給 core 的輸入。 */
  buildInput(): TickInput
  /** 音訊／遙測等唯讀消費者；每個 logical tick 呼叫，不能反向修改 core。 */
  onStateAdvanced?(previous: GameState, next: GameState): void
}

export function createGameLoop(options: CreateGameLoopOptions): GameLoop {
  const recorder = createRecorder(options.seed)
  let vfx: VfxState = INITIAL_VFX_STATE

  const loop = createFixedStepLoop<GameState>(recorder.getState(), {
    buildInput: options.buildInput,
    advance: (prevState: GameState, input: TickInput): GameState => {
      const nextState = recorder.tick(input)
      options.onStateAdvanced?.(prevState, nextState)
      // events 只存在這一 tick（見 src/core/README.md 第 3 節），必須在這裡立刻消費，
      // 不能等到畫面幀結束——同一幀可能已經推進了不只一個邏輯 tick（見 fixed-step-loop.ts）。
      vfx = updateVfxState(vfx, prevState, nextState)
      return nextState
    },
    onTick: () => {
      // 事件已經在 advance() 裡消費掉了；這個 hook 保留給未來可能需要的其他
      // 「每 tick 反應一次」邏輯（例如音訊層），目前用不到。
    },
  })

  return {
    advanceBy: (dtSeconds: number): void => loop.advanceBy(dtSeconds),
    getState: (): GameState => loop.getState(),
    getVfxState: (): VfxState => vfx,
    dump: (): CrashDump => recorder.dump(),
  }
}
