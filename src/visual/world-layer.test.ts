import { describe, expect, it } from 'vitest'
import { NEUTRAL_COLORS, SCHOOL_COLORS } from './color.js'
import { toWorldCell } from './world-grid.js'
import { clearWorldLayer, paintWorldLayer, worldRect, type WorldPaintTarget } from './world-layer.js'

function createFakeTarget(): WorldPaintTarget & { calls: Array<{ style: string; x: number; y: number; w: number; h: number }> } {
  const calls: Array<{ style: string; x: number; y: number; w: number; h: number }> = []
  return {
    fillStyle: '',
    fillRect(x, y, w, h) {
      calls.push({ style: this.fillStyle, x, y, w, h })
    },
    calls,
  }
}

describe('worldRect', () => {
  it('只接受整數格點座標（透過 toWorldCell 量化後的 WorldCell）', () => {
    const cell = toWorldCell(3.9, 4.1)
    const command = worldRect(cell, SCHOOL_COLORS.ember)
    expect(command.cell.x).toBe(4)
    expect(command.cell.y).toBe(4)
    expect(command.widthCells).toBe(1)
    expect(command.heightCells).toBe(1)
  })

  it('拒絕非整數的格寬高', () => {
    const cell = toWorldCell(0, 0)
    expect(() => worldRect(cell, SCHOOL_COLORS.ember, 1.5)).toThrow()
    expect(() => worldRect(cell, SCHOOL_COLORS.ember, 1, 0)).toThrow()
  })
})

describe('paintWorldLayer', () => {
  it('依序把繪圖指令畫到目標上，座標與量化後的整數格點一致', () => {
    const target = createFakeTarget()
    const commands = [
      worldRect(toWorldCell(1.4, 2.6), NEUTRAL_COLORS.duskStone),
      worldRect(toWorldCell(10, 10), SCHOOL_COLORS.guard, 2, 3),
    ]
    paintWorldLayer(target, commands)

    expect(target.calls).toEqual([
      { style: NEUTRAL_COLORS.duskStone, x: 1, y: 3, w: 1, h: 1 },
      { style: SCHOOL_COLORS.guard, x: 10, y: 10, w: 2, h: 3 },
    ])
  })
})

describe('clearWorldLayer', () => {
  it('用整張 160×90 網格清空為黑曜岩底色', () => {
    const target = createFakeTarget()
    clearWorldLayer(target)
    expect(target.calls).toEqual([{ style: NEUTRAL_COLORS.obsidianFloor, x: 0, y: 0, w: 160, h: 90 }])
  })
})
