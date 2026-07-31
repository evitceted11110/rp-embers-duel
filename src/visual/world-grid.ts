/**
 * 世界層座標系統。
 *
 * 內部解析度 160×90，整數放大 8× 至 1280×720（design/visual-proposals.md §7.2 決策紀錄）。
 * 世界層繪圖 API 只接受 WorldCell（整數格點）；次像素座標必須先經過 toWorldCell() 量化。
 * 這讓「世界層不允許次像素移動」是型別系統擋下來的事，不是文件規定——
 * WorldCell 帶有無法從物件字面值產生的品牌欄位，唯一合法建構方式就是 toWorldCell()。
 */

export const WORLD_GRID_WIDTH = 160
export const WORLD_GRID_HEIGHT = 90
export const WORLD_SCALE = 8
export const SCREEN_WIDTH = WORLD_GRID_WIDTH * WORLD_SCALE
export const SCREEN_HEIGHT = WORLD_GRID_HEIGHT * WORLD_SCALE

declare const worldCellBrand: unique symbol

/**
 * 世界層整數格點座標。
 * 唯一合法建構方式是 toWorldCell()——物件字面值 `{ x, y }` 缺少品牌欄位，
 * 傳給要求 WorldCell 的函式會被型別系統拒絕（見 world-grid.test.ts 的反向驗證）。
 */
export type WorldCell = {
  readonly x: number
  readonly y: number
  readonly [worldCellBrand]: true
}

function quantizeAxis(value: number, dimension: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`世界層座標必須是有限數字，收到 ${value}`)
  }
  const rounded = Math.round(value)
  return Math.min(Math.max(rounded, 0), dimension - 1)
}

/**
 * 把任意座標（含次像素浮點數）量化為世界層整數格點。
 * 四捨五入後夾在 [0, WORLD_GRID_WIDTH-1] / [0, WORLD_GRID_HEIGHT-1] 範圍內，避免越界。
 */
export function toWorldCell(x: number, y: number): WorldCell {
  return {
    x: quantizeAxis(x, WORLD_GRID_WIDTH),
    y: quantizeAxis(y, WORLD_GRID_HEIGHT),
  } as WorldCell
}
