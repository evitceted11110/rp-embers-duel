import { describe, expect, it } from 'vitest'
import { createRun, type GameState } from '../core/index.js'
import { INITIAL_VFX_STATE, updateVfxState, type VfxState } from './vfx-tracker.js'

/** 建一份合法的 GameState 快照，只覆寫測試關心的欄位——不透過 tick() 推進，
 * 純粹拿來測試 updateVfxState 這個純函式的事件記帳邏輯。 */
function state(overrides: Partial<GameState> = {}): GameState {
  const base = createRun('vfx-tracker-test')
  return { ...base, ...overrides }
}

describe('updateVfxState：dodgeStart 事件記錄弧線殘跡快照', () => {
  it('捕捉 nextGameState.player.dodge 的起訖點與 bendTarget', () => {
    const prev = state({ tick: 5 })
    const next = state({
      tick: 6,
      player: {
        ...prev.player,
        dodge: {
          ...prev.player.dodge,
          startPosition: { x: 0, y: 0 },
          endPosition: { x: 3, y: 0 },
          bendTarget: { x: 2, y: 1 },
        },
      },
      events: [{ type: 'dodgeStart', precision: false, bent: true }],
    })

    const result = updateVfxState(INITIAL_VFX_STATE, prev, next)

    expect(result.dodgeTrail).toEqual({
      startPosition: { x: 0, y: 0 },
      endPosition: { x: 3, y: 0 },
      bendTarget: { x: 2, y: 1 },
      spawnTick: 6,
    })
  })

  it('沒有 dodgeStart 事件時維持前一個快照（不會被其他事件清掉）', () => {
    const previous: VfxState = {
      dodgeTrail: { startPosition: { x: 0, y: 0 }, endPosition: { x: 1, y: 0 }, bendTarget: null, spawnTick: 3 },
      teleportStreak: null,
    }
    const prev = state({ tick: 10 })
    const next = state({ tick: 11, events: [{ type: 'comboWhiff' }] })

    const result = updateVfxState(previous, prev, next)
    expect(result.dodgeTrail).toEqual(previous.dodgeTrail)
  })
})

describe('updateVfxState：eCast 事件（僅精準殘影 keystone）記錄瞬移拖尾快照', () => {
  it('selectedMark 為 precision-afterimage 時，用瞬移前後的玩家座標建立拖尾', () => {
    const prev = state({ tick: 20, player: { ...state().player, position: { x: 1, y: 2 } } })
    const next = state({
      tick: 21,
      selectedMark: 'precision-afterimage',
      player: { ...prev.player, position: { x: 4, y: 2 } },
      events: [{ type: 'eCast' }],
    })

    const result = updateVfxState(INITIAL_VFX_STATE, prev, next)

    expect(result.teleportStreak).toEqual({
      from: { x: 1, y: 2 },
      to: { x: 4, y: 2 },
      spawnTick: 21,
    })
  })

  it('selectedMark 不是 precision-afterimage 時，eCast 不會建立拖尾（基礎版/蓄能反震的 E 不是瞬移）', () => {
    const prev = state({ tick: 20 })
    const nextEmber = state({ tick: 21, selectedMark: 'ember-core', events: [{ type: 'eCast' }] })
    const nextNoMark = state({ tick: 21, selectedMark: null, events: [{ type: 'eCast' }] })

    expect(updateVfxState(INITIAL_VFX_STATE, prev, nextEmber).teleportStreak).toBeNull()
    expect(updateVfxState(INITIAL_VFX_STATE, prev, nextNoMark).teleportStreak).toBeNull()
  })
})

describe('updateVfxState：新的一局（tick===0）清空所有殘留視覺歷史', () => {
  it('restart 或全新 createRun 之後（tick 回到 0）丟棄前一局的殘跡與拖尾', () => {
    const stale: VfxState = {
      dodgeTrail: { startPosition: { x: 0, y: 0 }, endPosition: { x: 1, y: 0 }, bendTarget: null, spawnTick: 999 },
      teleportStreak: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, spawnTick: 999 },
    }
    const prev = state({ tick: 1000 })
    const next = state({ tick: 0 })

    expect(updateVfxState(stale, prev, next)).toEqual(INITIAL_VFX_STATE)
  })
})
