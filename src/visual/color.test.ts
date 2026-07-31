import { describe, expect, it } from 'vitest'
import {
  ENEMY_TELEGRAPH_COLORS,
  hexToHsl,
  hueDistance,
  NEUTRAL_COLORS,
  SCHOOL_COLORS,
} from './color.js'

describe('色彩系統：固定值回歸', () => {
  it('中性色與流派色符合 design/visual-proposals.md §7.2 決策紀錄', () => {
    expect(NEUTRAL_COLORS.obsidianFloor).toBe('#14110F')
    expect(NEUTRAL_COLORS.duskStone).toBe('#3A3229')
    expect(SCHOOL_COLORS.ember).toBe('#FF8C3C')
    expect(SCHOOL_COLORS.shadow).toBe('#7C5CFF')
    expect(SCHOOL_COLORS.guard).toBe('#5C8FAE')
    expect(SCHOOL_COLORS.guardFullStackRim).toBe('#E8C14D')
  })

  it('敵人預兆色符合既定語意，不得被美術方向自由更動', () => {
    expect(ENEMY_TELEGRAPH_COLORS.warningRed).toBe('#E6283C')
    expect(ENEMY_TELEGRAPH_COLORS.chargeBlue).toBe('#2E6FE6')
    expect(ENEMY_TELEGRAPH_COLORS.summonGreen).toBe('#3ECB6B')
    expect(ENEMY_TELEGRAPH_COLORS.sentinelWhite).toBe('#F2EFE6')
    expect(ENEMY_TELEGRAPH_COLORS.assassinDark).toBe('#1A1620')
  })
})

describe('hexToHsl', () => {
  it('正確轉換已知色碼', () => {
    const white = hexToHsl('#FFFFFF')
    expect(white.lightness).toBeCloseTo(1, 5)
    expect(white.saturation).toBeCloseTo(0, 5)

    const black = hexToHsl('#000000')
    expect(black.lightness).toBeCloseTo(0, 5)

    const pureRed = hexToHsl('#FF0000')
    expect(pureRed.hueDegrees).toBeCloseTo(0, 5)
    expect(pureRed.saturation).toBeCloseTo(1, 5)
  })

  it('拒絕不合法的色碼', () => {
    expect(() => hexToHsl('not-a-color')).toThrow()
    expect(() => hexToHsl('#ABC')).toThrow()
  })
})

describe('hueDistance', () => {
  it('計算環狀最短距離', () => {
    expect(hueDistance(10, 350)).toBeCloseTo(20, 5)
    expect(hueDistance(350, 10)).toBeCloseTo(20, 5)
    expect(hueDistance(0, 180)).toBeCloseTo(180, 5)
    expect(hueDistance(100, 100)).toBeCloseTo(0, 5)
  })
})

describe('style-guide 可檢查規則：背景／環境中性色飽和度上限 20%', () => {
  it('黑曜岩底色與環境暗石色的 HSL 飽和度都 ≤ 20%', () => {
    expect(hexToHsl(NEUTRAL_COLORS.obsidianFloor).saturation).toBeLessThanOrEqual(0.2)
    expect(hexToHsl(NEUTRAL_COLORS.duskStone).saturation).toBeLessThanOrEqual(0.2)
  })
})

describe('style-guide 可檢查規則：流派色需與其對應的敵人預兆色明顯區隔', () => {
  it('裂焰琥珀橙與警戒紅的色相距離至少 20 度，避免撞色', () => {
    const emberHue = hexToHsl(SCHOOL_COLORS.ember).hueDegrees
    const warningRedHue = hexToHsl(ENEMY_TELEGRAPH_COLORS.warningRed).hueDegrees
    expect(hueDistance(emberHue, warningRedHue)).toBeGreaterThanOrEqual(20)
  })

  it('守勢鋼青藍的飽和度需明顯低於衝撞藍（差距至少 30 個百分點），用「鋼」的低飽和取代色相區隔', () => {
    const guardSaturation = hexToHsl(SCHOOL_COLORS.guard).saturation
    const chargeBlueSaturation = hexToHsl(ENEMY_TELEGRAPH_COLORS.chargeBlue).saturation
    expect(chargeBlueSaturation - guardSaturation).toBeGreaterThanOrEqual(0.3)
  })
})
