import type { GameState } from '../core/index.js'

export const PRECISION_SLOW_MOTION_DURATION_MS = 160
export const PRECISION_SLOW_MOTION_TIME_SCALE = 0.45

export type PrecisionSlowMotionSample = {
  readonly active: boolean
  readonly progress: number
  readonly timeScale: number
  readonly presentationTick: number
}

export type PrecisionSlowMotion = {
  /** 只觀察 core 結果；不改 state、不改輸入、不改 fixed-step accumulator。 */
  observe(state: GameState, nowMs: number): boolean
  sample(nowMs: number, sourceTick: number): PrecisionSlowMotionSample
}

export function createPrecisionSlowMotion(): PrecisionSlowMotion {
  let startedAtMs = Number.NEGATIVE_INFINITY
  let triggerTick = -1
  let lastObservedTriggerTick = -1

  return {
    observe(state: GameState, nowMs: number): boolean {
      const precisionDodge = state.events.some((event) => event.type === 'dodgeStart' && event.precision)
      if (!precisionDodge || state.tick === lastObservedTriggerTick) return false
      startedAtMs = nowMs
      triggerTick = state.tick
      lastObservedTriggerTick = state.tick
      return true
    },
    sample(nowMs: number, sourceTick: number): PrecisionSlowMotionSample {
      const elapsedMs = nowMs - startedAtMs
      if (elapsedMs < 0 || elapsedMs >= PRECISION_SLOW_MOTION_DURATION_MS) {
        return { active: false, progress: 1, timeScale: 1, presentationTick: sourceTick }
      }
      const progress = elapsedMs / PRECISION_SLOW_MOTION_DURATION_MS
      const presentationTick = triggerTick + Math.floor(
        Math.max(0, sourceTick - triggerTick) * PRECISION_SLOW_MOTION_TIME_SCALE,
      )
      return { active: true, progress, timeScale: PRECISION_SLOW_MOTION_TIME_SCALE, presentationTick }
    },
  }
}
