/**
 * 攝影機：把 core 的世界邏輯座標（浮點 units，見 `src/core/vector.ts`）轉換成
 * 世界層的 `WorldCell`（160×90 整數格點）或判定層的 `ScreenPoint`（1280×720 次像素）。
 *
 * 兩個轉換共用同一個攝影機中心與縮放比例，只是判定層版本多乘一次 `WORLD_SCALE`
 * （8）並保留小數——這保證世界層量化後的巨像素格子與判定層的精細特效在畫面上
 * 對齊在同一個位置，不會因為兩層各自換算而產生視覺錯位。
 *
 * `core` 完全不認識這個模組；`camera.ts` 是渲染層的職責，不是 core 的職責
 * （見 `src/core/README.md` 開頭的分工說明）。
 */
import type { Vector2 } from '../core/index.js'
import { toScreenPoint, type ScreenPoint } from '../visual/screen-point.js'
import { toWorldCell, WORLD_SCALE, type WorldCell } from '../visual/world-grid.js'

/**
 * 每個世界 unit 對應幾個世界層格子。
 *
 * 工程假設（非 Designer／Balance Engineer 核定值，比照 `src/core/constants.ts` 的既有慣例）：
 * 挑選依據是讓遭遇戰常見的活動半徑（敵人出生半徑 4.0 + 閃避距離 3.0，見
 * `src/core/enemy.ts`／`constants.ts`）落在畫面可視範圍內、不被 160×90 網格的
 * 垂直邊界（半高 45 格）裁掉：半徑 10 units × 4 cells/unit = 40 格 < 45 格。
 */
export const CELLS_PER_UNIT = 4

/** 世界原點（0,0）對應的世界層格子——畫面正中央。 */
export const CAMERA_CENTER_CELL: WorldCell = toWorldCell(80, 45)

function unitsToCellSpace(position: Vector2): { readonly x: number; readonly y: number } {
  return {
    x: CAMERA_CENTER_CELL.x + position.x * CELLS_PER_UNIT,
    y: CAMERA_CENTER_CELL.y + position.y * CELLS_PER_UNIT,
  }
}

/** 世界邏輯座標 → 世界層整數格點（量化，會被夾在畫布邊界內）。 */
export function worldToCell(position: Vector2): WorldCell {
  const cellSpace = unitsToCellSpace(position)
  return toWorldCell(cellSpace.x, cellSpace.y)
}

/**
 * 世界邏輯座標 → 判定層次像素座標。與 `worldToCell` 使用同一個攝影機中心／縮放，
 * 只是額外乘上 `WORLD_SCALE` 換算成螢幕像素、且不做整數量化——這樣同一個世界座標
 * 在兩層畫出來的位置才會精確對齊。
 */
export function worldToScreen(position: Vector2): ScreenPoint {
  const cellSpace = unitsToCellSpace(position)
  return toScreenPoint(cellSpace.x * WORLD_SCALE, cellSpace.y * WORLD_SCALE)
}
