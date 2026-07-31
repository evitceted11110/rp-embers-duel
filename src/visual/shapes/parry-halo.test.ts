import { describe, expect, it } from 'vitest'
import { parryHaloStateAt } from './parry-halo.js'

const DURATION_S = 0.15

describe('parryHaloStateAt：0.15 秒格擋尾段三段式演出（亮起 → 撐開 → 收回）', () => {
  it('起始時刻：半徑未變化，亮度為基準值', () => {
    const state = parryHaloStateAt(0, DURATION_S)
    expect(state.radiusScale).toBeCloseTo(1, 6)
    expect(state.brightness).toBeCloseTo(0.4, 6)
  })

  it('撐開階段結尾（2/3 時刻）：半徑達到峰值，亮度維持峰值', () => {
    const state = parryHaloStateAt((DURATION_S * 2) / 3, DURATION_S)
    expect(state.radiusScale).toBeCloseTo(1.6, 6)
    expect(state.brightness).toBeCloseTo(1, 6)
  })

  it('結束時刻：半徑收回原狀，亮度回到基準值', () => {
    const state = parryHaloStateAt(DURATION_S, DURATION_S)
    expect(state.radiusScale).toBeCloseTo(1, 6)
    expect(state.brightness).toBeCloseTo(0.4, 6)
  })

  it('中段（撐開期間）半徑嚴格大於起始與結束值，證明真的有「外擴一圈」', () => {
    const midExpand = parryHaloStateAt(DURATION_S * 0.5, DURATION_S)
    const start = parryHaloStateAt(0, DURATION_S)
    const end = parryHaloStateAt(DURATION_S, DURATION_S)
    expect(midExpand.radiusScale).toBeGreaterThan(start.radiusScale)
    expect(midExpand.radiusScale).toBeGreaterThan(end.radiusScale)
  })

  it('經過時間會被夾在 [0, durationS] 範圍內', () => {
    expect(parryHaloStateAt(-1, DURATION_S)).toEqual(parryHaloStateAt(0, DURATION_S))
    expect(parryHaloStateAt(100, DURATION_S)).toEqual(parryHaloStateAt(DURATION_S, DURATION_S))
  })

  it('拒絕非正的 durationS', () => {
    expect(() => parryHaloStateAt(0, 0)).toThrow()
  })
})
