/**
 * Accumulator pattern：把畫面更新率（60Hz、144Hz……）與 core 的固定 100Hz 邏輯 tick
 * 解耦（見 `src/core/README.md` 第 2 節）。硬要求：邏輯永遠以 `TICK_SECONDS` 固定步長
 * 推進，不把可變的畫面 `dtSeconds` 直接餵給 `tick()`。
 *
 * 刻意不依賴任何具體的 `tick()`/`InputController` 型別，只吃兩個回呼——
 * 這讓這個檔案可以在無頭環境用假的 `advance`/`buildInput` 測試，也是
 * 「accumulator 是否真的固定步進」這條硬規定的反向驗證對象（見交付報告）。
 */
import { TICK_SECONDS } from '../core/index.js'

/**
 * 單一畫面幀最多允許推進幾個邏輯 tick。避免分頁被丟到背景很久之後切回來時，
 * 一次補齊幾千個 tick 造成瞬間卡死（俗稱「death spiral」）——超過這個上限的
 * 累積時間直接捨棄，犧牲極端情況下的絕對重播精度，換取畫面不會卡死。
 * 40 tick＝0.4 秒，足以覆蓋一般的掉幀，遠超過正常 60Hz 幀（~1.67 tick／幀）。
 */
const MAX_TICKS_PER_FRAME = 40

export type FixedStepLoopOptions<TState> = {
  readonly tickSeconds?: number
  readonly maxTicksPerFrame?: number
  /** 組出這一 tick 要餵給 `advance` 的輸入；每個 tick 呼叫一次，不是每一幀一次。 */
  buildInput(): unknown
  /** 推進一個邏輯 tick（通常是 `recorder.tick` 或 core 的 `tick`）。 */
  advance(state: TState, input: never): TState
  /** 每完成一個邏輯 tick 立即呼叫一次——`state.events` 只存在這一 tick，錯過就沒了。 */
  onTick(state: TState): void
}

export type FixedStepLoop<TState> = {
  /** 累積實際經過的畫面時間，把可以整除的部分轉成固定步數的 `advance()` 呼叫。 */
  advanceBy(dtSeconds: number): void
  /** 目前累積但尚未滿一個 tick 的餘數，除以 `TICK_SECONDS` 即為畫面插值用的 alpha（0..1）。 */
  getAccumulatorSeconds(): number
  getState(): TState
}

export function createFixedStepLoop<TState>(
  initialState: TState,
  options: FixedStepLoopOptions<TState>,
): FixedStepLoop<TState> {
  const tickSeconds = options.tickSeconds ?? TICK_SECONDS
  const maxTicksPerFrame = options.maxTicksPerFrame ?? MAX_TICKS_PER_FRAME
  let state = initialState
  let accumulator = 0

  return {
    advanceBy(dtSeconds: number): void {
      if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
        throw new Error(`dtSeconds 必須是非負有限數字，收到 ${dtSeconds}`)
      }
      accumulator += dtSeconds

      let steps = 0
      while (accumulator >= tickSeconds && steps < maxTicksPerFrame) {
        const input = options.buildInput()
        state = options.advance(state, input as never)
        options.onTick(state)
        accumulator -= tickSeconds
        steps += 1
      }
      // 超過單幀上限：捨棄多餘的累積時間，避免下一幀繼續補齊造成死亡螺旋。
      if (steps >= maxTicksPerFrame) accumulator = 0
    },
    getAccumulatorSeconds(): number {
      return accumulator
    },
    getState(): TState {
      return state
    },
  }
}
