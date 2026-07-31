/**
 * 判定／回饋層：獨立於世界層之上，高解析度繪製，允許反鋸齒與次像素移動
 * （design/visual-proposals.md §7.2 決策紀錄）。
 *
 * 「地面 vs 角色」「硬邊 vs 柔邊」的雙重區隔（§3 規則 2）由 enemyTelegraph()／schoolEffect()
 * 兩個建構子固定寫死，不靠命名慣例：敵人預兆一律 anchor='ground'、edge='hard'，
 * 且只接受 EnemyTelegraphColor；玩家流派特效一律 anchor='character'、edge='soft'，
 * 且只接受 SchoolColor——兩者在型別上就不可能互換。
 */
import type { EnemyTelegraphColor, SchoolColor } from './color.js'
import type { AfterimageGeometry } from './shapes/afterimage.js'
import type { ArcTrailGeometry } from './shapes/arc-trail.js'
import { coneBoundaryAngles, type ConeGeometry } from './shapes/cone.js'
import type { ParryHaloGeometry } from './shapes/parry-halo.js'

export type { ScreenPoint } from './screen-point.js'

export type JudgmentColor = SchoolColor | EnemyTelegraphColor

export type JudgmentAnchor = 'ground' | 'character'
export type JudgmentEdgeStyle = 'hard' | 'soft'

export type JudgmentGeometry = ArcTrailGeometry | ConeGeometry | AfterimageGeometry | ParryHaloGeometry

export type JudgmentEffect<TGeometry extends JudgmentGeometry = JudgmentGeometry> = {
  readonly geometry: TGeometry
  readonly color: JudgmentColor
  readonly anchor: JudgmentAnchor
  readonly edge: JudgmentEdgeStyle
}

/** 敵人／Boss 預兆：固定投影在地面、固定硬邊，只能使用 EnemyTelegraphColor。 */
export function enemyTelegraph<TGeometry extends JudgmentGeometry>(
  geometry: TGeometry,
  color: EnemyTelegraphColor,
): JudgmentEffect<TGeometry> {
  return { geometry, color, anchor: 'ground', edge: 'hard' }
}

/** 玩家／流派特效：固定附著在角色本體或武器上、固定柔邊，只能使用 SchoolColor。 */
export function schoolEffect<TGeometry extends JudgmentGeometry>(
  geometry: TGeometry,
  color: SchoolColor,
): JudgmentEffect<TGeometry> {
  return { geometry, color, anchor: 'character', edge: 'soft' }
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * 判定層畫布最小介面，對應 CanvasRenderingContext2D 會用到的子集。
 * 刻意獨立定義（不 import DOM lib 型別），方便測試用純物件替換。
 */
export type JudgmentPaintTarget = {
  strokeStyle: string
  fillStyle: string
  globalAlpha: number
  lineWidth: number
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, radius: number, startAngleRad: number, endAngleRad: number): void
  closePath(): void
  stroke(): void
  fill(): void
}

/** 把單一判定層特效畫到畫布上。允許次像素座標，不做任何格點量化。 */
export function paintJudgmentEffect(target: JudgmentPaintTarget, effect: JudgmentEffect): void {
  const { geometry } = effect

  switch (geometry.kind) {
    case 'arc-trail': {
      target.globalAlpha = 1
      target.strokeStyle = effect.color
      target.lineWidth = 2
      target.beginPath()
      const [first, ...rest] = geometry.points
      if (first !== undefined) {
        target.moveTo(first.x, first.y)
        for (const point of rest) target.lineTo(point.x, point.y)
      }
      target.stroke()
      return
    }
    case 'cone': {
      target.globalAlpha = 1
      target.fillStyle = effect.color
      const { origin, facingDegrees, totalAngleDegrees, rangeUnits } = geometry
      const { startDegrees, endDegrees } = coneBoundaryAngles(facingDegrees, totalAngleDegrees)
      target.beginPath()
      target.moveTo(origin.x, origin.y)
      target.arc(origin.x, origin.y, rangeUnits, degToRad(startDegrees), degToRad(endDegrees))
      target.closePath()
      target.fill()
      return
    }
    case 'afterimage': {
      target.globalAlpha = geometry.opacity
      target.fillStyle = effect.color
      target.beginPath()
      const [first, ...rest] = geometry.silhouette
      if (first !== undefined) {
        target.moveTo(first.x, first.y)
        for (const point of rest) target.lineTo(point.x, point.y)
      }
      target.closePath()
      target.fill()
      return
    }
    case 'parry-halo': {
      target.globalAlpha = geometry.brightness
      target.strokeStyle = effect.color
      target.lineWidth = 2
      target.beginPath()
      target.arc(geometry.center.x, geometry.center.y, geometry.baseRadius * geometry.radiusScale, 0, Math.PI * 2)
      target.stroke()
      return
    }
  }
}

export function paintJudgmentLayer(target: JudgmentPaintTarget, effects: readonly JudgmentEffect[]): void {
  for (const effect of effects) paintJudgmentEffect(target, effect)
}
