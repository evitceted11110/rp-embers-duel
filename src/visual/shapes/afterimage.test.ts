import { describe, expect, it } from 'vitest'
import { afterimageOpacityAt } from './afterimage.js'

describe('afterimageOpacityAt：連續衰減（判定層允許次像素/平滑漸變）', () => {
  it('剛產生時不透明度為 1，到期時為 0', () => {
    expect(afterimageOpacityAt(0, 1.6)).toBeCloseTo(1, 6)
    expect(afterimageOpacityAt(1.6, 1.6)).toBeCloseTo(0, 6)
  })

  it('中間時刻為線性內插值', () => {
    expect(afterimageOpacityAt(0.8, 1.6)).toBeCloseTo(0.5, 6)
  })

  it('經過時間會被夾在 [0, durationS] 範圍內', () => {
    expect(afterimageOpacityAt(-1, 1.6)).toBeCloseTo(1, 6)
    expect(afterimageOpacityAt(100, 1.6)).toBeCloseTo(0, 6)
  })

  it('隨時間單調遞減', () => {
    const samples = [0, 0.2, 0.4, 0.8, 1.2, 1.6].map((t) => afterimageOpacityAt(t, 1.6))
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] as number)
    }
  })

  it('拒絕非正的 durationS', () => {
    expect(() => afterimageOpacityAt(0, 0)).toThrow()
    expect(() => afterimageOpacityAt(0, -1)).toThrow()
  })
})
