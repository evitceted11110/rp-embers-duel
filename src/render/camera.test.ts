import { describe, expect, it } from 'vitest'
import { WORLD_SCALE } from '../visual/world-grid.js'
import { CAMERA_CENTER_CELL, CELLS_PER_UNIT, worldToCell, worldToScreen } from './camera.js'

describe('worldToCell：世界邏輯座標 → 世界層整數格點', () => {
  it('世界原點對應攝影機中心格', () => {
    const cell = worldToCell({ x: 0, y: 0 })
    expect(cell.x).toBe(CAMERA_CENTER_CELL.x)
    expect(cell.y).toBe(CAMERA_CENTER_CELL.y)
  })

  it('依 CELLS_PER_UNIT 縮放並四捨五入為整數格點', () => {
    const cell = worldToCell({ x: 2, y: -1 })
    expect(cell.x).toBe(CAMERA_CENTER_CELL.x + 2 * CELLS_PER_UNIT)
    expect(cell.y).toBe(CAMERA_CENTER_CELL.y - 1 * CELLS_PER_UNIT)
  })

  it('超出畫布範圍的座標會被夾住而不是拋出例外（沿用 toWorldCell 的夾值行為）', () => {
    expect(() => worldToCell({ x: 1000, y: -1000 })).not.toThrow()
  })
})

describe('worldToScreen：世界邏輯座標 → 判定層次像素座標', () => {
  it('世界原點對應畫面正中央（攝影機中心格 × WORLD_SCALE）', () => {
    const point = worldToScreen({ x: 0, y: 0 })
    expect(point.x).toBe(CAMERA_CENTER_CELL.x * WORLD_SCALE)
    expect(point.y).toBe(CAMERA_CENTER_CELL.y * WORLD_SCALE)
  })

  it('與 worldToCell 使用同一攝影機中心與縮放，只是保留次像素、不量化', () => {
    const point = worldToScreen({ x: 1.25, y: 0 })
    expect(point.x).toBeCloseTo((CAMERA_CENTER_CELL.x + 1.25 * CELLS_PER_UNIT) * WORLD_SCALE)
  })

  it('同一個世界座標在兩層的畫面位置對齊：worldToCell 的格子中心應等於 worldToScreen 的整數化結果', () => {
    const position = { x: 3, y: -2 }
    const cell = worldToCell(position)
    const point = worldToScreen(position)
    expect(point.x).toBeCloseTo(cell.x * WORLD_SCALE)
    expect(point.y).toBeCloseTo(cell.y * WORLD_SCALE)
  })
})
