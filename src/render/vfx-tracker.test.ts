import { describe, expect, it } from 'vitest'
import { createPlayerAttackGeometry, createRun, type GameState } from '../core/index.js'
import { INITIAL_VFX_STATE, updateVfxState, type VfxState } from './vfx-tracker.js'

/** 建一份合法的 GameState 快照，只覆寫測試關心的欄位——不透過 tick() 推進，
 * 純粹拿來測試 updateVfxState 這個純函式的事件記帳邏輯。 */
function state(overrides: Partial<GameState> = {}): GameState {
  const base = createRun('vfx-tracker-test')
  return { ...base, ...overrides }
}

function attackGeometry(hitIndex: 1 | 2 | 3) {
  const base = state()
  return createPlayerAttackGeometry({
    position: base.player.position,
    facing: base.player.facing,
    hitIndex,
    selectedMarks: [],
    pursuitActive: false,
    guardStacks: 0,
  })
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
    const next = state({ tick: 11, events: [{ type: 'comboWhiff', geometry: attackGeometry(1) }] })

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

  it('精準殘影不是最近一次選擇時仍依完整 build 建立拖尾', () => {
    const prev = state({ tick: 20, player: { ...state().player, position: { x: 1, y: 2 } } })
    const next = state({
      tick: 21,
      selectedMark: 'pursuit-strike',
      selectedMarks: ['precision-afterimage', 'pursuit-strike'],
      player: { ...prev.player, position: { x: 4, y: 2 } },
      events: [{ type: 'eCast' }],
    })
    expect(updateVfxState(INITIAL_VFX_STATE, prev, next).teleportStreak?.to).toEqual({ x: 4, y: 2 })
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

describe('updateVfxState：Boss 階段演出', () => {
  it('把單 tick 階段事件保存成可跨幀播放的 phase 2／3 快照', () => {
    const boss = { ...state().enemies[0]!, id: 'ashen-warlord', kind: 'ashen-warlord' as const, position: { x: 2, y: -1 }, bossPhase: 2 as const }
    const prev = state({ tick: 40, phase: 'boss', enemies: [boss] })
    const next = state({ tick: 41, phase: 'boss', enemies: [boss], events: [{ type: 'bossPhaseChanged', phase: 2 }] })
    expect(updateVfxState(INITIAL_VFX_STATE, prev, next).bossTransition).toEqual({ phase: 2, position: { x: 2, y: -1 }, spawnTick: 41 })
  })
})

describe('updateVfxState：命中定格與敵人突進表演', () => {
  it('comboHit 建立短 hit-stop／shake，但只存在 render VFX 狀態', () => {
    const prev = state({ tick: 10 })
    const next = state({ tick: 11, events: [{ type: 'comboHit', hitIndex: 3, damage: 16, targetId: prev.enemies[0]!.id, geometry: attackGeometry(3) }] })
    const vfx = updateVfxState(INITIAL_VFX_STATE, prev, next)
    expect(vfx.hitStopUntilTick).toBe(17)
    expect(vfx.shakeUntilTick).toBe(19)
    expect(vfx.attack?.tier).toBe('heavy')
    expect(vfx.enemyHit?.tier).toBe('heavy')
    expect(next.tick).toBe(11)
  })

  it('輕擊與重擊使用不同 VFX tier，重擊的 hit-stop／shake 高一級', () => {
    const prev = state({ tick: 30 })
    const light = updateVfxState(INITIAL_VFX_STATE, prev, state({ tick: 31, events: [{ type: 'comboHit', hitIndex: 1, damage: 8, targetId: prev.enemies[0]!.id, geometry: attackGeometry(1) }] }))
    const heavy = updateVfxState(INITIAL_VFX_STATE, prev, state({ tick: 31, events: [{ type: 'comboHit', hitIndex: 3, damage: 16, targetId: prev.enemies[0]!.id, geometry: attackGeometry(3) }] }))
    expect(light.attack?.tier).toBe('light')
    expect(heavy.attack?.tier).toBe('heavy')
    expect(heavy.hitStopUntilTick).toBeGreaterThan(light.hitStopUntilTick!)
    expect(heavy.shakeUntilTick).toBeGreaterThan(light.shakeUntilTick!)
  })

  it('core 的 dash locomotion 會保存跨幀殘影起訖點', () => {
    const prev = state({ tick: 20 })
    const enemy = { ...prev.enemies[0]!, position: { x: 3, y: 1 }, velocity: { x: 20, y: 10 }, locomotion: 'dash' as const }
    const next = state({ tick: 21, enemies: [enemy] })
    expect(updateVfxState(INITIAL_VFX_STATE, prev, next).enemyDashes?.[0]).toMatchObject({
      id: enemy.id, from: prev.enemies[0]!.position, to: enemy.position,
    })
  })

  it('attack VFX 快照直接保存命中事件 geometry，追擊狀態消耗後不重算成 base range', () => {
    const prev = state({ tick: 50 })
    const geometry = createPlayerAttackGeometry({
      position: prev.player.position, facing: prev.player.facing, hitIndex: 1,
      selectedMarks: ['pursuit-strike'], pursuitActive: true, guardStacks: 0,
    })
    const next = state({
      tick: 51,
      selectedMarks: ['pursuit-strike'],
      player: { ...prev.player, position: geometry.origin, pursuitTicksRemaining: 0 },
      events: [{ type: 'comboHit', hitIndex: 1, damage: 13, targetId: prev.enemies[0]!.id, geometry }],
    })
    expect(updateVfxState(INITIAL_VFX_STATE, prev, next).attack?.geometry).toEqual(geometry)
  })
})
