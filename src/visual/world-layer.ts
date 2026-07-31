/**
 * 世界層：160×90 巨像素舞台。
 *
 * 只暴露以 WorldCell 為座標單位的繪圖指令建構子——呼叫端如果手上只有次像素浮點數，
 * 一定要先呼叫 world-grid.ts 的 toWorldCell() 量化，型別系統不接受其他管道。
 */
import type { NeutralColor, SchoolColor } from './color.js'
import type { WorldCell } from './world-grid.js'
import { WORLD_GRID_HEIGHT, WORLD_GRID_WIDTH } from './world-grid.js'
import { NEUTRAL_COLORS } from './color.js'

/** 世界層允許的色彩：中性色與流派色。不含敵人預兆色（那屬於判定層，見 judgment-layer.ts）。 */
export type WorldColor = NeutralColor | SchoolColor

export type WorldDrawCommand = {
  readonly cell: WorldCell
  readonly color: WorldColor
  readonly widthCells: number
  readonly heightCells: number
}

/** 世界層繪圖指令建構子：只接受 WorldCell，不接受未經量化的 {x,y:number}。 */
export function worldRect(
  cell: WorldCell,
  color: WorldColor,
  widthCells = 1,
  heightCells = 1,
): WorldDrawCommand {
  if (!Number.isInteger(widthCells) || widthCells < 1) {
    throw new Error(`widthCells 必須是正整數，收到 ${widthCells}`)
  }
  if (!Number.isInteger(heightCells) || heightCells < 1) {
    throw new Error(`heightCells 必須是正整數，收到 ${heightCells}`)
  }
  return { cell, color, widthCells, heightCells }
}

/**
 * 世界層畫布最小介面。刻意不直接依賴 CanvasRenderingContext2D，
 * 方便測試用純物件替換，不需要真實 DOM 環境。
 */
export type WorldPaintTarget = {
  fillStyle: string
  fillRect(x: number, y: number, w: number, h: number): void
}

/**
 * 把世界層繪圖指令畫到 160×90 內部解析度畫布上。
 * 這個函式只在內部網格座標空間工作，不做任何縮放計算——
 * 8× 整數放大交給畫布外層的 CSS/canvas 尺寸設定（nearest-neighbor，不旋轉、不做非整數縮放）。
 */
export function paintWorldLayer(target: WorldPaintTarget, commands: readonly WorldDrawCommand[]): void {
  for (const command of commands) {
    target.fillStyle = command.color
    target.fillRect(command.cell.x, command.cell.y, command.widthCells, command.heightCells)
  }
}

/** 用黑曜岩底色（或指定的世界層色）清空整張 160×90 畫布。 */
export function clearWorldLayer(target: WorldPaintTarget, background: WorldColor = NEUTRAL_COLORS.obsidianFloor): void {
  target.fillStyle = background
  target.fillRect(0, 0, WORLD_GRID_WIDTH, WORLD_GRID_HEIGHT)
}
