/**
 * 弧線殘跡（餘燼核心閃避路徑）幾何。
 * 世界層角色仍是巨像素跳格移動，但移動路徑本身由判定層畫出一條平滑曲線殘跡——
 * 這條曲線允許次像素座標，不受 160×90 格點量化，因此能忠實表現「朝武裝核心微幅彎曲」。
 */
import type { ScreenPoint } from '../screen-point.js'

export type ArcTrailGeometry = {
  readonly kind: 'arc-trail'
  readonly points: readonly ScreenPoint[]
}

const DEFAULT_BEND_FACTOR = 0.35

/**
 * 產生閃避路徑的取樣點。
 * - bendTarget 為 null：範圍內沒有武裝核心，維持原本直線位移。
 * - bendTarget 有值：路徑朝 bendTarget 彎曲（見 content/marks.json 的 ember-core 條目）。
 */
export function dodgeArcTrail(
  start: ScreenPoint,
  end: ScreenPoint,
  bendTarget: ScreenPoint | null,
  sampleCount = 9,
  bendFactor = DEFAULT_BEND_FACTOR,
): ArcTrailGeometry {
  if (sampleCount < 2) throw new Error(`sampleCount 至少為 2，收到 ${sampleCount}`)

  const midpoint: ScreenPoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const control: ScreenPoint =
    bendTarget === null
      ? midpoint
      : {
          x: midpoint.x + (bendTarget.x - midpoint.x) * bendFactor,
          y: midpoint.y + (bendTarget.y - midpoint.y) * bendFactor,
        }

  const points: ScreenPoint[] = []
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / (sampleCount - 1)
    points.push(quadraticBezierPoint(start, control, end, t))
  }

  return { kind: 'arc-trail', points }
}

function quadraticBezierPoint(p0: ScreenPoint, p1: ScreenPoint, p2: ScreenPoint, t: number): ScreenPoint {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  }
}
