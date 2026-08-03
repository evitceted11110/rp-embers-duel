import { describe, expect, it } from 'vitest'
import { WAVE_TELEGRAPH_TICKS } from './encounter-director.js'
import { createRun, tick } from './run.js'
import { input } from './test-utils.js'
import type { GameState } from './types.js'

function clearActiveWave() {
  const state = createRun('wave-director-seed')
  return { ...state, enemies: state.enemies.map((enemy) => ({ ...enemy, hp: 0 })) }
}

describe('遭遇導演：可重播分波、出生預告與安全環', () => {
  it('普通房至少拆成兩波，第一波清除後先預告、再實體化下一波', () => {
    const base = createRun('wave-split')
    const initial = { ...base, phase: 'encounter1' as const }
    expect(initial.encounterDirector.waves.length).toBeGreaterThanOrEqual(2)
    expect(initial.enemies.length).toBeGreaterThan(0)
    expect(initial.enemies.length).toBeLessThanOrEqual(8)

    const announced = tick({ ...initial, enemies: initial.enemies.map((enemy) => ({ ...enemy, hp: 0 })) }, input())
    expect(announced.enemies).toEqual([])
    expect(announced.encounterDirector.telegraphs).toHaveLength(2)
    expect(announced.events.some((event) => event.type === 'waveTelegraphed')).toBe(true)

    let state = announced
    for (let i = 0; i < WAVE_TELEGRAPH_TICKS; i += 1) state = tick(state, input())
    expect(state.enemies).toHaveLength(2)
    expect(state.events.some((event) => event.type === 'waveSpawned')).toBe(true)
  })

  it('預告出生點不進入玩家安全環，且會避開貼邊時的撤退方向', () => {
    const announced = tick({ ...clearActiveWave(), player: { ...createRun('wave-director-seed').player, position: { x: 10.8, y: 4.7 } } }, input())
    for (const telegraph of announced.encounterDirector.telegraphs) {
      const distance = Math.hypot(telegraph.position.x - 10.8, telegraph.position.y - 4.7)
      expect(distance).toBeGreaterThan(3.4)
      expect(telegraph.position.x).toBeLessThan(10.8) // 右側貼邊時保留左側撤退通道
    }
  })

  it('同 seed 與相同清場輸入，波次預告、出生座標與敵人時序逐 tick 完全一致', () => {
    function replay() {
      let state: GameState = clearActiveWave()
      const history = [state]
      for (let i = 0; i < WAVE_TELEGRAPH_TICKS + 2; i += 1) {
        state = tick(state, input())
        history.push(state)
      }
      return history
    }
    expect(replay()).toEqual(replay())
  })

  it('第 3 與第 6 關使用 Boss 導演房，而不是把 Boss 混入普通波次', () => {
    let state = createRun('boss-room-seed')
    for (let index = 0; index < 2; index += 1) {
      state = { ...state, phase: 'draft', encounterIndex: index, draftOptions: ['ember-core', 'precision-afterimage', 'charged-retaliation'], enemies: [] }
      state = tick(state, input({ draftChoice: 'ember-core' }))
    }
    expect(state.phase).toBe('boss')
    expect(state.encounterIndex).toBe(2)
    expect(state.encounterDirector.boss).toBe(true)
    expect(state.encounterDirector.waves).toEqual([['ashen-warlord']])
  })
})
