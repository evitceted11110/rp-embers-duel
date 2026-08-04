import { describe, expect, it } from 'vitest'
import { runClassBalanceBaseline } from './class-expansion-balance.js'

describe('雙職業全卡平衡基線', () => {
  it('以固定 seed／技巧檔／合法構築重播，量測全 24 卡與 8 共鳴', () => {
    // 完整基線在 report script 執行 10,000 局；測試以較小固定樣本守住
    // 決定性與覆蓋契約，避免與全套 Vitest 並行時超出預設 timeout。
    const left = runClassBalanceBaseline(80, 'balance-repeat')
    const right = runClassBalanceBaseline(80, 'balance-repeat')
    expect(left).toEqual(right)
    expect(left.scenarios).toBe(24)
    expect(left.unreachableCards).toEqual([])
    expect(left.unreachableResonances).toEqual([])
    expect(left.invalidBuilds).toEqual([])
    expect(Object.keys(left.cardSelectionRate)).toHaveLength(24)
    expect(Object.keys(left.resonanceResolveRate)).toHaveLength(8)
    expect(Object.values(left.cardSuccessRate).every((rate) => rate > 0 && rate <= 1)).toBe(true)
  })

  it('同時包含 4/1/1、3/2/1 與 2/2/2 類構築，且拒絕原因可歸因', () => {
    const summary = runClassBalanceBaseline(100, 'balance-builds')
    expect(Object.keys(summary.winRate).some((key) => key.endsWith('/4/1/1'))).toBe(true)
    expect(Object.keys(summary.winRate).some((key) => key.endsWith('/3/2/1'))).toBe(true)
    expect(Object.keys(summary.winRate).some((key) => key.endsWith('/2/2/2'))).toBe(true)
    expect(summary.resonanceRejectReasons['card-not-picked']).toBeGreaterThan(0)
    expect(summary.resonanceRejectReasons['held-by-policy']).toBeGreaterThan(0)
  })
})
