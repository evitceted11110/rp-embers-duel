import { describe, expect, it } from 'vitest'
import { shouldRenderTick } from './render-schedule.js'

describe('shouldRenderTick', () => {
  it('同一 logical tick 的重複 rAF 不重建繪圖配置', () => {
    expect(shouldRenderTick(42, 42)).toBe(false)
  })

  it('首幀與 logical tick 推進後需要重畫', () => {
    expect(shouldRenderTick(null, 0)).toBe(true)
    expect(shouldRenderTick(42, 43)).toBe(true)
  })
})
