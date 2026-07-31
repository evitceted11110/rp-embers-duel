import { describe, expect, it } from 'vitest'
import { toScreenPoint } from '../screen-point.js'
import { dodgeArcTrail } from './arc-trail.js'

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

describe('dodgeArcTrail：沒有武裝核心時維持直線位移', () => {
  it('所有取樣點都與起訖點共線', () => {
    const start = toScreenPoint(0, 0)
    const end = toScreenPoint(10, 0)
    const { points } = dodgeArcTrail(start, end, null, 9)

    expect(points[0]).toEqual(start)
    expect(points.at(-1)).toEqual(end)
    for (const point of points) {
      // 共線：跨積 (end-start) x (point-start) 應為 0
      const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
      expect(cross).toBeCloseTo(0, 6)
    }
  })
})

describe('dodgeArcTrail：有武裝核心時路徑朝核心彎曲', () => {
  it('曲線中點比直線中點更靠近 bendTarget', () => {
    const start = toScreenPoint(0, 0)
    const end = toScreenPoint(10, 0)
    const bendTarget = toScreenPoint(5, 10)

    const straightMidpoint = toScreenPoint(5, 0)
    const { points } = dodgeArcTrail(start, end, bendTarget, 9)
    const curveMidpoint = points[Math.floor(points.length / 2)]
    expect(curveMidpoint).toBeDefined()

    expect(distance(curveMidpoint as { x: number; y: number }, bendTarget)).toBeLessThan(
      distance(straightMidpoint, bendTarget),
    )
  })

  it('起訖點仍精確等於輸入的 start/end，彎曲只發生在中段', () => {
    const start = toScreenPoint(1, 2)
    const end = toScreenPoint(9, 2)
    const bendTarget = toScreenPoint(5, 20)
    const { points } = dodgeArcTrail(start, end, bendTarget, 5)

    expect(points[0]).toEqual(start)
    expect(points.at(-1)).toEqual(end)
  })
})

describe('dodgeArcTrail：輸入驗證', () => {
  it('拒絕取樣點數小於 2', () => {
    expect(() => dodgeArcTrail(toScreenPoint(0, 0), toScreenPoint(1, 1), null, 1)).toThrow()
  })
})
