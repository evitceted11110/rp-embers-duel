import { describe, expect, it } from 'vitest'
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  toWorldCell,
  WORLD_GRID_HEIGHT,
  WORLD_GRID_WIDTH,
  WORLD_SCALE,
} from './world-grid.js'

describe('世界層解析度常數', () => {
  it('內部解析度為 160×90，整數放大 8× 至 1280×720', () => {
    expect(WORLD_GRID_WIDTH).toBe(160)
    expect(WORLD_GRID_HEIGHT).toBe(90)
    expect(WORLD_SCALE).toBe(8)
    expect(SCREEN_WIDTH).toBe(1280)
    expect(SCREEN_HEIGHT).toBe(720)
  })
})

describe('toWorldCell：次像素座標量化', () => {
  it('次像素浮點數會被量化為整數格點（style-guide 規則：世界層不允許次像素移動）', () => {
    const cell = toWorldCell(10.7, 20.2)
    expect(cell.x).toBe(11)
    expect(cell.y).toBe(20)
    expect(Number.isInteger(cell.x)).toBe(true)
    expect(Number.isInteger(cell.y)).toBe(true)
  })

  it('四捨五入到最近整數', () => {
    expect(toWorldCell(5.49, 5.49)).toMatchObject({ x: 5, y: 5 })
    expect(toWorldCell(5.5, 5.5)).toMatchObject({ x: 6, y: 6 })
  })

  it('越界座標會被夾在網格範圍內', () => {
    expect(toWorldCell(-5, -5)).toMatchObject({ x: 0, y: 0 })
    expect(toWorldCell(9999, 9999)).toMatchObject({ x: WORLD_GRID_WIDTH - 1, y: WORLD_GRID_HEIGHT - 1 })
  })

  it('拒絕非有限數字', () => {
    expect(() => toWorldCell(Number.NaN, 0)).toThrow()
    expect(() => toWorldCell(0, Number.POSITIVE_INFINITY)).toThrow()
  })
})
