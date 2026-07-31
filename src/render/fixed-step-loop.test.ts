import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../core/index.js'
import { createFixedStepLoop } from './fixed-step-loop.js'

/** 測試用最小狀態：純數字計數器，`advance` 只是 +1，方便斷言「呼叫了幾次」。 */
function counterLoop(maxTicksPerFrame?: number) {
  const calls: number[] = []
  const loop = createFixedStepLoop(0, {
    maxTicksPerFrame,
    buildInput: () => null,
    advance: (state: number) => state + 1,
    onTick: (state) => calls.push(state),
  })
  return { loop, calls }
}

describe('createFixedStepLoop：accumulator pattern 固定步進', () => {
  it('累積時間不足一個 tick 時不會呼叫 advance', () => {
    const { loop, calls } = counterLoop()
    loop.advanceBy(TICK_SECONDS * 0.5)
    expect(calls).toEqual([])
    expect(loop.getState()).toBe(0)
  })

  it('累積滿一個 tick 才呼叫一次 advance，餘數保留到下一幀', () => {
    const { loop, calls } = counterLoop()
    loop.advanceBy(TICK_SECONDS * 1.3)
    expect(calls).toEqual([1])
    expect(loop.getAccumulatorSeconds()).toBeCloseTo(TICK_SECONDS * 0.3)
  })

  it('一幀內累積超過一個 tick 的時間會連續呼叫多次 advance（每次都各自 onTick，不會漏接）', () => {
    const { loop, calls } = counterLoop()
    loop.advanceBy(TICK_SECONDS * 3.5)
    expect(calls).toEqual([1, 2, 3])
  })

  it('決定性核心主張：同一段總時間不論切成多少幀餵入，最終呼叫 advance 的總次數相同', () => {
    const totalSeconds = TICK_SECONDS * 100
    // maxTicksPerFrame 刻意調大：這條測試驗證的是 accumulator 本身的決定性，
    // 不是死亡螺旋防護（那條規則另有專屬測試），避免兩個關注點互相干擾。
    const oneShot = counterLoop(1000)
    oneShot.loop.advanceBy(totalSeconds)

    const manySmallFrames = counterLoop(1000)
    const frameDt = totalSeconds / 137 // 刻意選一個除不盡 TICK_SECONDS 的切法
    for (let i = 0; i < 137; i += 1) manySmallFrames.loop.advanceBy(frameDt)

    // 137 次餵入、每次都不到一個 tick 寬，累積出的 tick 次數應與一次餵完完全一致——
    // 這正是 accumulator pattern 存在的理由：邏輯結果不受「畫面怎麼切幀」影響。
    expect(manySmallFrames.calls.length).toBe(oneShot.calls.length)
    expect(manySmallFrames.loop.getState()).toBe(oneShot.loop.getState())
  })

  it('單幀 tick 數上限：避免分頁背景很久後切回來一次補齊造成死亡螺旋', () => {
    const { loop, calls } = counterLoop(5)
    loop.advanceBy(TICK_SECONDS * 1000) // 模擬分頁被丟到背景很久之後才 resume
    expect(calls.length).toBe(5)
    expect(loop.getAccumulatorSeconds()).toBe(0) // 超額時間直接捨棄，不留到下一幀
  })

  it('拒絕負數或非有限的 dtSeconds', () => {
    const { loop } = counterLoop()
    expect(() => loop.advanceBy(-1)).toThrow()
    expect(() => loop.advanceBy(Number.NaN)).toThrow()
  })
})

describe('反向驗證：改用可變 delta time 直接驅動 advance（不透過 accumulator）會破壞決定性', () => {
  it('同一段「總時間」用不同幀切法直接呼叫 advance(dtSeconds) 會得到不同的 tick 次數', () => {
    // 這裡刻意示範「錯誤做法」：把畫面 dt 直接當作要推進的 tick 數字（四捨五入），
    // 而不是透過 accumulator 累積到滿一個 TICK_SECONDS 才推進一次。
    function wrongVariableDtSteps(frameDts: number[]): number {
      let steps = 0
      for (const dt of frameDts) {
        // 錯誤模式：dt 本身決定要不要推進，沒有累積餘數的概念。
        if (dt > 0) steps += Math.round(dt / TICK_SECONDS)
      }
      return steps
    }

    const totalSeconds = TICK_SECONDS * 100
    const asOneFrame = wrongVariableDtSteps([totalSeconds])
    // 切成 300 個小於半個 tick 寬的 dt（每幀 dt/TICK_SECONDS ≈ 0.33），每次 round() 都
    // 四捨五入到 0，總步數變成 0——與切成一幀（100 步）得到完全不同的結果，證明
    // 「可變 dt 直接驅動」不具決定性，這正是 accumulator pattern（見上方 describe）
    // 要解決的問題：畫面怎麼切幀不該影響邏輯推進的步數。
    const as300UnevenFrames = wrongVariableDtSteps(Array.from({ length: 300 }, () => totalSeconds / 300))

    expect(as300UnevenFrames).toBe(0)
    expect(as300UnevenFrames).not.toBe(asOneFrame)
  })
})
