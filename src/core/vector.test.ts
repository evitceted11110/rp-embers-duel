import { describe, expect, it } from 'vitest'
import { add, distance, lerp, normalize, quadraticBezier, scale, sub } from './vector.js'

describe('vector', () => {
  it('add/sub/scale', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 })
    expect(sub({ x: 5, y: 5 }, { x: 2, y: 1 })).toEqual({ x: 3, y: 4 })
    expect(scale({ x: 2, y: 3 }, 2)).toEqual({ x: 4, y: 6 })
  })

  it('distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('normalize 零向量回傳零向量，不丟例外', () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('normalize 保持方向、長度為 1', () => {
    const result = normalize({ x: 3, y: 4 })
    expect(result.x).toBeCloseTo(0.6)
    expect(result.y).toBeCloseTo(0.8)
  })

  it('lerp 起訖點精確等於輸入值', () => {
    const start = { x: 0, y: 0 }
    const end = { x: 10, y: 20 }
    expect(lerp(start, end, 0)).toEqual(start)
    expect(lerp(start, end, 1)).toEqual(end)
    expect(lerp(start, end, 0.5)).toEqual({ x: 5, y: 10 })
  })

  it('quadraticBezier 起訖點精確等於輸入值，且 control=中點時退化為直線', () => {
    const start = { x: 0, y: 0 }
    const end = { x: 4, y: 0 }
    const control = { x: 2, y: 0 }
    expect(quadraticBezier(start, control, end, 0)).toEqual(start)
    expect(quadraticBezier(start, control, end, 1)).toEqual(end)
    expect(quadraticBezier(start, control, end, 0.5)).toEqual({ x: 2, y: 0 })
  })

  it('quadraticBezier 的 control 偏離中點時，曲線中點會偏向 control 那一側', () => {
    const start = { x: 0, y: 0 }
    const end = { x: 4, y: 0 }
    const bentControl = { x: 2, y: 3 }
    const midpoint = quadraticBezier(start, bentControl, end, 0.5)
    // t=0.5 時：0.25*start + 0.5*control + 0.25*end
    expect(midpoint).toEqual({ x: 2, y: 1.5 })
    expect(midpoint.y).toBeGreaterThan(0)
  })
})
