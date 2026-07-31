/**
 * 格擋尾段光環（蓄能反震 0.15 秒）幾何。
 * 三段式演出：亮起 → 撐開 → 收回。0.15 秒在 60fps 下約 9 幀，
 * 短到禁不起被世界層 8px 網格量化，因此固定畫在判定層、允許次像素動畫。
 */
import type { ScreenPoint } from '../screen-point.js'

export type ParryHaloGeometry = {
  readonly kind: 'parry-halo'
  readonly center: ScreenPoint
  readonly baseRadius: number
  readonly radiusScale: number
  readonly brightness: number
}

const BASE_BRIGHTNESS = 0.4
const PEAK_BRIGHTNESS = 1
const PEAK_RADIUS_SCALE = 1.6

/** 三段式時間切點：[0, 1/3] 亮起、(1/3, 2/3] 撐開、(2/3, 1] 收回，以 durationS 為單位歸一化。 */
const IGNITE_END = 1 / 3
const EXPAND_END = 2 / 3

export function parryHaloStateAt(
  elapsedS: number,
  durationS: number,
): { readonly radiusScale: number; readonly brightness: number } {
  if (durationS <= 0) throw new Error(`durationS 必須為正數，收到 ${durationS}`)
  const t = Math.min(Math.max(elapsedS, 0), durationS) / durationS

  if (t <= IGNITE_END) {
    const phase = t / IGNITE_END
    return { radiusScale: 1, brightness: BASE_BRIGHTNESS + (PEAK_BRIGHTNESS - BASE_BRIGHTNESS) * phase }
  }
  if (t <= EXPAND_END) {
    const phase = (t - IGNITE_END) / (EXPAND_END - IGNITE_END)
    return { radiusScale: 1 + (PEAK_RADIUS_SCALE - 1) * phase, brightness: PEAK_BRIGHTNESS }
  }
  const phase = (t - EXPAND_END) / (1 - EXPAND_END)
  return {
    radiusScale: PEAK_RADIUS_SCALE + (1 - PEAK_RADIUS_SCALE) * phase,
    brightness: PEAK_BRIGHTNESS + (BASE_BRIGHTNESS - PEAK_BRIGHTNESS) * phase,
  }
}

export function parryHaloGeometry(
  center: ScreenPoint,
  baseRadius: number,
  elapsedS: number,
  durationS: number,
): ParryHaloGeometry {
  const state = parryHaloStateAt(elapsedS, durationS)
  return { kind: 'parry-halo', center, baseRadius, radiusScale: state.radiusScale, brightness: state.brightness }
}
