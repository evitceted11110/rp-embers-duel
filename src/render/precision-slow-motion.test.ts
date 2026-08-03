import { describe, expect, it } from 'vitest'
import { createRun, type GameState } from '../core/index.js'
import {
  PRECISION_SLOW_MOTION_DURATION_MS,
  PRECISION_SLOW_MOTION_TIME_SCALE,
  createPrecisionSlowMotion,
} from './precision-slow-motion.js'

function state(events: GameState['events'], tick = 40): GameState {
  return { ...createRun('precision-slow-motion'), tick, events }
}

describe('精準閃避 presentation slow-motion', () => {
  it('只有 precision dodge 成功事件觸發 160ms 慢動作', () => {
    const slowMotion = createPrecisionSlowMotion()
    expect(slowMotion.observe(state([{ type: 'dodgeStart', precision: true, bent: false }]), 1000)).toBe(true)

    const sample = slowMotion.sample(1080, 48)
    expect(sample).toMatchObject({ active: true, timeScale: PRECISION_SLOW_MOTION_TIME_SCALE })
    expect(sample.presentationTick).toBeLessThan(48)
    expect(PRECISION_SLOW_MOTION_DURATION_MS).toBeGreaterThanOrEqual(120)
    expect(PRECISION_SLOW_MOTION_DURATION_MS).toBeLessThanOrEqual(180)
  })

  it.each([
    [[{ type: 'dodgeStart', precision: false, bent: false }]],
    [[{ type: 'playerBlocked' }]],
    [[{ type: 'playerHit', damage: 8 }]],
  ] as const)('普通閃避、格擋、受擊不得誤觸：%o', (events) => {
    const slowMotion = createPrecisionSlowMotion()
    expect(slowMotion.observe(state(events), 1000)).toBe(false)
    expect(slowMotion.sample(1010, 41)).toEqual({ active: false, progress: 1, timeScale: 1, presentationTick: 41 })
  })

  it('時間窗結束立即回到真實 presentation tick，不改 core tick', () => {
    const slowMotion = createPrecisionSlowMotion()
    slowMotion.observe(state([{ type: 'dodgeStart', precision: true, bent: false }]), 1000)
    expect(slowMotion.sample(1000 + PRECISION_SLOW_MOTION_DURATION_MS, 60)).toEqual({
      active: false,
      progress: 1,
      timeScale: 1,
      presentationTick: 60,
    })
  })
})
