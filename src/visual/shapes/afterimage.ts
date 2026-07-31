/**
 * 殘影（精準殘影／影步）幾何。
 * 判定層直接複製角色輪廓、降低不透明度——比世界層的角色本體更平滑，
 * 「幽靈比肉身更滑」是刻意的視覺語言：不透明度連續衰減，不是提案二那種離散透明度階梯。
 */
import type { ScreenPoint } from '../screen-point.js'

export type AfterimageGeometry = {
  readonly kind: 'afterimage'
  readonly silhouette: readonly ScreenPoint[]
  readonly opacity: number
}

/**
 * 殘影從產生到到期的不透明度，隨經過時間連續衰減：
 * elapsedS=0 時為 1（剛產生），elapsedS>=durationS 時為 0（已到期消失）。
 */
export function afterimageOpacityAt(elapsedS: number, durationS: number): number {
  if (durationS <= 0) throw new Error(`durationS 必須為正數，收到 ${durationS}`)
  const clampedElapsed = Math.min(Math.max(elapsedS, 0), durationS)
  return 1 - clampedElapsed / durationS
}

export function afterimageGeometry(
  silhouette: readonly ScreenPoint[],
  elapsedS: number,
  durationS: number,
): AfterimageGeometry {
  return { kind: 'afterimage', silhouette, opacity: afterimageOpacityAt(elapsedS, durationS) }
}
