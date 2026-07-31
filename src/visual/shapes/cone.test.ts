import { describe, expect, it } from 'vitest'
import { toScreenPoint } from '../screen-point.js'
import { coneBoundaryAngles, coneGeometry, isAngleWithinCone, isPointWithinCone } from './cone.js'

describe('coneBoundaryAngles', () => {
  it('120° 扇形面朝 0 度時，邊界為 -60/300 度與 60 度', () => {
    const { startDegrees, endDegrees } = coneBoundaryAngles(0, 120)
    expect(startDegrees).toBeCloseTo(300, 5)
    expect(endDegrees).toBeCloseTo(60, 5)
  })
})

describe('isAngleWithinCone：120° 扇形角度邊界正確性', () => {
  it('邊界角度本身算在扇形內（含邊界）', () => {
    expect(isAngleWithinCone(60, 0, 120)).toBe(true)
    expect(isAngleWithinCone(-60, 0, 120)).toBe(true)
    expect(isAngleWithinCone(300, 0, 120)).toBe(true) // -60 正規化後
  })

  it('超出邊界一點點就不算在扇形內，不會被誤判成鈍角或直角', () => {
    expect(isAngleWithinCone(60.001, 0, 120)).toBe(false)
    expect(isAngleWithinCone(-60.001, 0, 120)).toBe(false)
  })

  it('中心角度與正對面角度分別為在／不在扇形內', () => {
    expect(isAngleWithinCone(0, 0, 120)).toBe(true)
    expect(isAngleWithinCone(180, 0, 120)).toBe(false)
  })

  it('面朝角度跨越 0/360 環狀邊界時仍正確判斷', () => {
    // 面朝 350 度，120 度扇形涵蓋 290–50 度；10 度應在扇形內
    expect(isAngleWithinCone(10, 350, 120)).toBe(true)
    // 面朝 10 度，350 度（即 -10）應在扇形內
    expect(isAngleWithinCone(350, 10, 120)).toBe(true)
    // 面朝 350 度時，170 度（正對面附近）應在扇形外
    expect(isAngleWithinCone(170, 350, 120)).toBe(false)
  })
})

describe('isPointWithinCone', () => {
  const origin = toScreenPoint(0, 0)

  it('在扇形角度與距離內的點為 true', () => {
    const geometry = coneGeometry(origin, 0, 120, 10)
    expect(isPointWithinCone(toScreenPoint(5, 0), geometry)).toBe(true)
  })

  it('角度正確但超出射程的點為 false', () => {
    const geometry = coneGeometry(origin, 0, 120, 10)
    expect(isPointWithinCone(toScreenPoint(20, 0), geometry)).toBe(false)
  })

  it('射程內但角度落在扇形外的點為 false', () => {
    const geometry = coneGeometry(origin, 0, 90, 10)
    // 90 度角（正上方）超出面朝 0 度、90 度扇形（±45 度）的範圍
    expect(isPointWithinCone(toScreenPoint(0, 5), geometry)).toBe(false)
  })
})

describe('coneGeometry：輸入驗證', () => {
  it('拒絕不合法的角度與射程', () => {
    const origin = toScreenPoint(0, 0)
    expect(() => coneGeometry(origin, 0, 0, 10)).toThrow()
    expect(() => coneGeometry(origin, 0, 360, 10)).toThrow()
    expect(() => coneGeometry(origin, 0, 120, 0)).toThrow()
  })
})
