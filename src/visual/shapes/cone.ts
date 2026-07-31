/**
 * 120° 扇形（裂焰連擊等）幾何。判定層乾淨疊層，角度邊界必須精確可測——
 * 這是世界層 160×90 網格上同樣範圍只佔約 12–17 格、容易把 120° 誤判成鈍角或直角的問題，
 * 判定層透過向量幾何（不量化到格點）避免掉。
 */
import type { ScreenPoint } from '../screen-point.js'

export type ConeGeometry = {
  readonly kind: 'cone'
  readonly origin: ScreenPoint
  readonly facingDegrees: number
  readonly totalAngleDegrees: number
  readonly rangeUnits: number
}

export function coneGeometry(
  origin: ScreenPoint,
  facingDegrees: number,
  totalAngleDegrees: number,
  rangeUnits: number,
): ConeGeometry {
  if (totalAngleDegrees <= 0 || totalAngleDegrees >= 360) {
    throw new Error(`totalAngleDegrees 必須在 (0, 360) 之間，收到 ${totalAngleDegrees}`)
  }
  if (rangeUnits <= 0) {
    throw new Error(`rangeUnits 必須是正數，收到 ${rangeUnits}`)
  }
  return { kind: 'cone', origin, facingDegrees, totalAngleDegrees, rangeUnits }
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

function normalizeDegrees(degrees: number): number {
  return mod(degrees, 360)
}

/** a 到 b 的最短帶號角度差，落在 (-180, 180]。 */
function signedAngleDifference(aDegrees: number, bDegrees: number): number {
  return mod(bDegrees - aDegrees + 180, 360) - 180
}

/** 扇形左右邊界角度（0–360 度，正規化後）。 */
export function coneBoundaryAngles(
  facingDegrees: number,
  totalAngleDegrees: number,
): { readonly startDegrees: number; readonly endDegrees: number } {
  const half = totalAngleDegrees / 2
  return {
    startDegrees: normalizeDegrees(facingDegrees - half),
    endDegrees: normalizeDegrees(facingDegrees + half),
  }
}

const EPSILON = 1e-9

/** 判斷角度是否落在扇形內（含邊界），正確處理 0/360 度環狀邊界。 */
export function isAngleWithinCone(angleDegrees: number, facingDegrees: number, totalAngleDegrees: number): boolean {
  const half = totalAngleDegrees / 2
  return Math.abs(signedAngleDifference(facingDegrees, angleDegrees)) <= half + EPSILON
}

/** 判斷一個點是否落在扇形（角度＋距離）範圍內。 */
export function isPointWithinCone(point: ScreenPoint, geometry: ConeGeometry): boolean {
  const dx = point.x - geometry.origin.x
  const dy = point.y - geometry.origin.y
  const distance = Math.hypot(dx, dy)
  if (distance > geometry.rangeUnits) return false
  const angleDegrees = normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI)
  return isAngleWithinCone(angleDegrees, geometry.facingDegrees, geometry.totalAngleDegrees)
}
