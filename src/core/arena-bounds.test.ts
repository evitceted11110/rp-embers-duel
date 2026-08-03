import { describe, expect, it } from 'vitest'
import {
  ATTACK_STARTUP_TIMES_S,
  secondsToTicks,
} from './constants.js'
import { ARENA_BOUNDS, clampToArena, isInsideArena } from './arena.js'
import { tick } from './run.js'
import { buildState, input, makeEnemy } from './test-utils.js'
import type { GameState, TickInput } from './types.js'
import type { Vector2 } from './vector.js'

function stateAt(position: Vector2, selectedMarks: GameState['selectedMarks'] = []): GameState {
  const base = buildState({
    phase: 'encounter2',
    selectedMarks,
    selectedMark: selectedMarks.at(-1) ?? null,
    enemies: [makeEnemy({ id: 'anchor', kind: 'ember-thrall', hp: 100000, maxHp: 100000, position: { x: 0, y: 0 }, attackState: 'cooldown', timerTicks: 100000 })],
  })
  return { ...base, player: { ...base.player, position } }
}

function step(state: GameState, count: number, nextInput: (index: number) => TickInput): GameState {
  let current = state
  for (let index = 0; index < count; index += 1) current = tick(current, nextInput(index))
  return current
}

describe('core arena bounds 單一真相來源', () => {
  it('四邊持續移動都 clamp，英雄 sprite 半徑保留在 640×360 可視世界區', () => {
    const cases = [
      [{ x: ARENA_BOUNDS.left, y: 0 }, { moveX: -1 }],
      [{ x: ARENA_BOUNDS.right, y: 0 }, { moveX: 1 }],
      [{ x: 0, y: ARENA_BOUNDS.top }, { moveY: -1 }],
      [{ x: 0, y: ARENA_BOUNDS.bottom }, { moveY: 1 }],
    ] as const
    for (const [position, movement] of cases) {
      const result = step(stateAt(position), 120, () => input(movement))
      expect(isInsideArena(result.player.position)).toBe(true)
      expect(result.player.position).toEqual(clampToArena(result.player.position))
    }
  })

  it('dodge、普攻推進與基礎 Q lunge 在四邊附近都不越界', () => {
    const right = stateAt({ x: ARENA_BOUNDS.right - 0.01, y: 0 })
    const dodged = step(right, 40, (index) => input({ dodge: index === 0, moveX: 1 }))
    expect(isInsideArena(dodged.player.position)).toBe(true)
    expect(isInsideArena(dodged.player.dodge.endPosition)).toBe(true)

    const attacked = step(right, secondsToTicks(ATTACK_STARTUP_TIMES_S[0]) + 1, () => input({ attack: true, aimX: 1 }))
    expect(isInsideArena(attacked.player.position)).toBe(true)

    const qBase = stateAt({ x: ARENA_BOUNDS.right - 0.01, y: 0 })
    const qState = { ...qBase, enemies: [makeEnemy({ id: 'q-target', kind: 'ember-thrall', position: { x: ARENA_BOUNDS.right, y: 0 }, attackState: 'cooldown', timerTicks: 1000 })] }
    expect(isInsideArena(tick(qState, input({ skillQ: true, aimX: 1 })).player.position)).toBe(true)
  })

  it('精準殘影 mark displacement 與敵人 knockback／dash 都被 clamp', () => {
    const marked = stateAt({ x: 0, y: 0 }, ['precision-afterimage'])
    const withOutsideImage = {
      ...marked,
      player: { ...marked.player, afterimages: [{ position: { x: 999, y: -999 }, ticksRemaining: 100 }] },
    }
    expect(isInsideArena(tick(withOutsideImage, input({ skillE: true })).player.position)).toBe(true)

    const guard = stateAt({ x: ARENA_BOUNDS.right - 0.2, y: 0 }, ['charged-retaliation'])
    const knockbackState = {
      ...guard,
      player: { ...guard.player, guardStacks: 1 },
      enemies: [makeEnemy({ id: 'edge-enemy', kind: 'ember-thrall', position: { x: ARENA_BOUNDS.right - 0.05, y: 0 }, attackState: 'cooldown', timerTicks: 1000 })],
    }
    expect(tick(knockbackState, input({ skillE: true })).enemies.every((enemy) => isInsideArena(enemy.position))).toBe(true)

    const chargeState = {
      ...guard,
      enemies: [makeEnemy({
        id: 'edge-charge', kind: 'shade-skirmisher', position: { x: ARENA_BOUNDS.right - 0.05, y: 0 },
        attackState: 'telegraph', timerTicks: 1,
        telegraphGeometry: { kind: 'lane', origin: { x: ARENA_BOUNDS.right - 0.05, y: 0 }, direction: { x: 1, y: 0 }, length: 4.2, halfWidth: 0.48 },
      })],
    }
    expect(tick(chargeState, input()).enemies.every((enemy) => isInsideArena(enemy.position))).toBe(true)
  })

  it('長時間 deterministic fuzz 的玩家與敵人位置逐 tick 不越界，重跑完全一致', () => {
    function run(): readonly GameState[] {
      let current = stateAt({ x: 0, y: 0 })
      const history: GameState[] = []
      for (let index = 0; index < 12000; index += 1) {
        current = tick(current, input({
          moveX: Math.sin(index * 0.17),
          moveY: Math.cos(index * 0.11),
          aimX: Math.cos(index * 0.07),
          aimY: Math.sin(index * 0.07),
          attack: index % 180 < 100,
          dodge: index % 137 === 0,
          skillQ: index % 601 === 0,
        }))
        expect(isInsideArena(current.player.position)).toBe(true)
        expect(current.enemies.every((enemy) => isInsideArena(enemy.position))).toBe(true)
        if (index % 1000 === 0) history.push(current)
      }
      return history
    }
    expect(run()).toEqual(run())
  }, 15000)
})