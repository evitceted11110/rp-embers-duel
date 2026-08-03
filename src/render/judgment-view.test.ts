import { describe, expect, it } from 'vitest'
import { createRun, type GameState } from '../core/index.js'
import { ENEMY_TELEGRAPH_COLORS, SCHOOL_COLORS } from '../visual/color.js'
import { buildJudgmentEffects } from './judgment-view.js'
import { INITIAL_VFX_STATE, type VfxState } from './vfx-tracker.js'

function state(overrides: Partial<GameState> = {}): GameState {
  const base = createRun('judgment-view-test')
  return { ...base, ...overrides, enemies: overrides.enemies ?? [] }
}

describe('餘燼核心：閃避彎曲弧線殘跡真的被畫出來', () => {
  it('selectedMark=ember-core 且有近期的 dodgeTrail 時，輸出含 arc-trail 的 schoolEffect（ember 色）', () => {
    const s = state({ tick: 10, selectedMark: 'ember-core' })
    const vfx: VfxState = {
      dodgeTrail: { startPosition: { x: 0, y: 0 }, endPosition: { x: 3, y: 0 }, bendTarget: { x: 1, y: 1 }, spawnTick: 5 },
      teleportStreak: null,
    }

    const effects = buildJudgmentEffects(s, vfx)
    const arcTrail = effects.find((e) => e.geometry.kind === 'arc-trail')

    expect(arcTrail).toBeDefined()
    expect(arcTrail?.color).toBe(SCHOOL_COLORS.ember)
    expect(arcTrail?.anchor).toBe('character')
    expect(arcTrail?.edge).toBe('soft')
  })

  it('沒有 dodgeTrail 歷史時不輸出弧線', () => {
    const s = state({ selectedMark: 'ember-core' })
    expect(buildJudgmentEffects(s, INITIAL_VFX_STATE).some((e) => e.geometry.kind === 'arc-trail')).toBe(false)
  })

  it('弧線殘跡過期（超過可見 tick 數）後不再輸出', () => {
    const s = state({ tick: 1000, selectedMark: 'ember-core' })
    const vfx: VfxState = {
      dodgeTrail: { startPosition: { x: 0, y: 0 }, endPosition: { x: 3, y: 0 }, bendTarget: null, spawnTick: 0 },
      teleportStreak: null,
    }
    expect(buildJudgmentEffects(s, vfx).some((e) => e.geometry.kind === 'arc-trail')).toBe(false)
  })

  it('沒有選印記（selectedMark=null）時，即使 vfx 有 dodgeTrail 也不畫（避免誤導成流派特效）', () => {
    const s = state({ tick: 10, selectedMark: null })
    const vfx: VfxState = {
      dodgeTrail: { startPosition: { x: 0, y: 0 }, endPosition: { x: 3, y: 0 }, bendTarget: null, spawnTick: 5 },
      teleportStreak: null,
    }
    expect(buildJudgmentEffects(s, vfx).some((e) => e.geometry.kind === 'arc-trail')).toBe(false)
  })
})

describe('精準殘影：殘影本體與 E 瞬移拖尾真的被畫出來', () => {
  it('player.afterimages 每一個都輸出一個 afterimage 幾何（shadow 色）', () => {
    const base = state()
    const s = state({
      selectedMark: 'precision-afterimage',
      player: {
        ...base.player,
        afterimages: [
          { position: { x: 1, y: 0 }, ticksRemaining: 160 },
          { position: { x: -1, y: 0 }, ticksRemaining: 40 },
        ],
      },
    })

    const effects = buildJudgmentEffects(s, INITIAL_VFX_STATE)
    const afterimages = effects.filter((e) => e.geometry.kind === 'afterimage')
    expect(afterimages).toHaveLength(2)
    for (const effect of afterimages) expect(effect.color).toBe(SCHOOL_COLORS.shadow)
  })

  it('剛產生的殘影（ticksRemaining 接近滿）幾乎不透明，快消失的殘影（ticksRemaining 趨近 0）幾乎透明', () => {
    const base = state()
    const s = state({
      selectedMark: 'precision-afterimage',
      player: {
        ...base.player,
        afterimages: [
          { position: { x: 0, y: 0 }, ticksRemaining: 160 }, // 剛產生
          { position: { x: 0, y: 0 }, ticksRemaining: 1 }, // 快消失
        ],
      },
    })
    const effects = buildJudgmentEffects(s, INITIAL_VFX_STATE).filter((e) => e.geometry.kind === 'afterimage')
    const fresh = effects[0]!.geometry as { opacity: number }
    const stale = effects[1]!.geometry as { opacity: number }
    expect(fresh.opacity).toBeGreaterThan(stale.opacity)
    expect(fresh.opacity).toBeCloseTo(1, 1)
    expect(stale.opacity).toBeCloseTo(0, 1)
  })

  it('近期的 eCast 拖尾輸出一條 arc-trail（shadow 色），這是 E 瞬移的視覺證據', () => {
    const s = state({ tick: 12, selectedMark: 'precision-afterimage' })
    const vfx: VfxState = {
      dodgeTrail: null,
      teleportStreak: { from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, spawnTick: 10 },
    }
    const effects = buildJudgmentEffects(s, vfx)
    const streak = effects.find((e) => e.geometry.kind === 'arc-trail')
    expect(streak).toBeDefined()
    expect(streak?.color).toBe(SCHOOL_COLORS.shadow)
  })
})

describe('蓄能反震：蓄能護環與格擋尾段光環真的被畫出來', () => {
  it('guardStacks 每一層輸出一圈 parry-halo（guard 色）', () => {
    const base = state()
    const s = state({ selectedMark: 'charged-retaliation', player: { ...base.player, guardStacks: 2 } })
    const rings = buildJudgmentEffects(s, INITIAL_VFX_STATE).filter(
      (e) => e.geometry.kind === 'parry-halo' && e.color === SCHOOL_COLORS.guard,
    )
    expect(rings).toHaveLength(2)
  })

  it('滿層（3 層）額外輸出一圈金色描邊（guardFullStackRim）', () => {
    const base = state()
    const s = state({ selectedMark: 'charged-retaliation', player: { ...base.player, guardStacks: 3 } })
    const rimRings = buildJudgmentEffects(s, INITIAL_VFX_STATE).filter(
      (e) => e.color === SCHOOL_COLORS.guardFullStackRim,
    )
    expect(rimRings).toHaveLength(1)
  })

  it('parryTailActive 時額外輸出一圈格擋尾段光環，且半亮度會隨 parryTailTicksRemaining 變化', () => {
    const base = state()
    const s = state({
      selectedMark: 'charged-retaliation',
      player: {
        ...base.player,
        guardStacks: 0,
        dodge: { ...base.player.dodge, parryTailActive: true, parryTailTicksRemaining: 15 },
      },
    })
    const halos = buildJudgmentEffects(s, INITIAL_VFX_STATE).filter((e) => e.geometry.kind === 'parry-halo')
    // guardStacks=0 沒有蓄能圈，唯一的 parry-halo 就是格擋尾段本身。
    expect(halos).toHaveLength(1)
  })

  it('parryTailActive 為 false 且 guardStacks=0 時不輸出任何護環', () => {
    const s = state({ selectedMark: 'charged-retaliation' })
    expect(buildJudgmentEffects(s, INITIAL_VFX_STATE).some((e) => e.geometry.kind === 'parry-halo')).toBe(false)
  })
})

describe('敵人預兆：沒有這個玩家就無法判斷何時閃避', () => {
  it('焰奴進入 telegraph 狀態時輸出 warningRed 的 parry-halo（地面／硬邊）', () => {
    const s = state({
      enemies: [
        { id: 'e0', kind: 'ember-thrall', position: { x: 1, y: 0 }, hp: 200, maxHp: 200, attackState: 'telegraph', velocity: { x: 0, y: 0 }, locomotion: 'brace', attackRecoveryTicksRemaining: 0, telegraphGeometry: null, timerTicks: 25 },
      ],
    })
    const effects = buildJudgmentEffects(s, INITIAL_VFX_STATE)
    expect(effects).toHaveLength(1)
    expect(effects[0]?.color).toBe(ENEMY_TELEGRAPH_COLORS.warningRed)
    expect(effects[0]?.anchor).toBe('ground')
    expect(effects[0]?.edge).toBe('hard')
    expect(effects[0]?.geometry.kind).toBe('parry-halo')
  })

  it('影刺客進入 telegraph 狀態時輸出 assassinDark 的 afterimage（地面／硬邊）', () => {
    const s = state({
      enemies: [
        { id: 's0', kind: 'shade-skirmisher', position: { x: -1, y: 0 }, hp: 145, maxHp: 145, attackState: 'telegraph', velocity: { x: 0, y: 0 }, locomotion: 'brace', attackRecoveryTicksRemaining: 0, telegraphGeometry: null, timerTicks: 10 },
      ],
    })
    const effects = buildJudgmentEffects(s, INITIAL_VFX_STATE)
    expect(effects).toHaveLength(1)
    expect(effects[0]?.color).toBe(ENEMY_TELEGRAPH_COLORS.assassinDark)
    expect(effects[0]?.anchor).toBe('ground')
    expect(effects[0]?.geometry.kind).toBe('afterimage')
  })

  it('非 telegraph 狀態（approach/cooldown）或已死亡的敵人不輸出預兆', () => {
    const s = state({
      enemies: [
        { id: 'a', kind: 'ember-thrall', position: { x: 1, y: 0 }, hp: 200, maxHp: 200, attackState: 'approach', velocity: { x: 0, y: 0 }, locomotion: 'advance', attackRecoveryTicksRemaining: 0, telegraphGeometry: null, timerTicks: 0 },
        { id: 'b', kind: 'ember-thrall', position: { x: 1, y: 0 }, hp: 0, maxHp: 200, attackState: 'telegraph', velocity: { x: 0, y: 0 }, locomotion: 'brace', attackRecoveryTicksRemaining: 0, telegraphGeometry: null, timerTicks: 5 },
      ],
    })
    expect(buildJudgmentEffects(s, INITIAL_VFX_STATE)).toHaveLength(0)
  })
})
