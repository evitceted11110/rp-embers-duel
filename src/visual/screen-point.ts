/**
 * 判定／回饋層的座標型別。
 *
 * 與世界層的 WorldCell（見 world-grid.ts）相對：判定層允許次像素與反鋸齒，
 * 因此 ScreenPoint 不做整數量化，只確保是有限數字。
 */
export type ScreenPoint = {
  readonly x: number
  readonly y: number
}

export function toScreenPoint(x: number, y: number): ScreenPoint {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`判定層座標必須是有限數字，收到 (${x}, ${y})`)
  }
  return { x, y }
}
