import { describe, expect, it } from 'vitest'
import { createEnemyAttackGeometry, createPlayerAttackGeometry, createRun, THRALL_CONE_RADIUS_UNITS, type EnemyKind, type MarkId, type RunPhase } from '../core/index.js'
import { DUNGEON_ARENA_RECT, DUNGEON_HEIGHT, DUNGEON_WIDTH, WORLD_ANCHOR, WORLD_PIXELS_PER_UNIT, cardinalDirection, enemySpriteIdentity, markGlyphIdentity, roomZone, worldToDungeon } from '../visual/dungeon-art.js'
import { ARENA_BOUNDS } from '../core/index.js'
import { attackWindowCue, describeDungeonScene, heroPose, markVisualCues, pivotSweepVisualCue, precisionSlowMotionVisualCue, telegraphCue } from './dungeon-view.js'
import { INITIAL_VFX_STATE } from './vfx-tracker.js'
import { materializeOpeningWave } from '../core/test-utils.js'

describe('rework 0.1.0 地城舞台映射', () => {
  it('使用 640×360 中解析像素畫布，而非已否決的 160×90 巨像素畫布', () => {
    expect([DUNGEON_WIDTH, DUNGEON_HEIGHT]).toEqual([640, 360])
    expect(WORLD_PIXELS_PER_UNIT).toBe(22)
  })

  it('所有 phase 進入正確戰區，不把新遭遇退回舊房間', () => {
    const combatPhases: readonly RunPhase[] = ['encounter1', 'encounter2', 'encounter3', 'encounter4', 'encounter5', 'encounter6', 'boss']
    const rooms = combatPhases.map((phase, encounterIndex) => describeDungeonScene(phase, 1, encounterIndex).room)
    expect(rooms).toEqual(['forge-entry', 'forge-hall', 'shadow-gallery', 'shadow-vault', 'arena-approach', 'arena-core', 'boss-sanctum'])
    expect(rooms.map(roomZone)).toEqual(['forge', 'forge', 'shadow', 'shadow', 'arena', 'arena', 'arena'])
    expect(describeDungeonScene('draft', 0, 0).room).toBe('forge-altar')
    expect(describeDungeonScene('draft', 0, 2).room).toBe('shadow-altar')
    expect(describeDungeonScene('draft', 0, 4).room).toBe('arena-altar')
    expect(describeDungeonScene('victory', 0)).toMatchObject({ room: 'exit', roomName: '晨光長廊', nextDoorOpen: true })
  })

  it('core 原點映射到房間 anchor，其他座標只在表現層平移縮放', () => {
    expect(worldToDungeon({ x: 0, y: 0 })).toEqual(WORLD_ANCHOR)
    expect(worldToDungeon({ x: 2, y: -1 })).toEqual({ x: WORLD_ANCHOR.x + 44, y: WORLD_ANCHOR.y - 22 })
  })

  it('render 可走區由 core arena bounds 推導，英雄完整 sprite 留在 640×360 內', () => {
    expect(worldToDungeon({ x: ARENA_BOUNDS.left, y: ARENA_BOUNDS.top })).toEqual({ x: DUNGEON_ARENA_RECT.left, y: DUNGEON_ARENA_RECT.top })
    expect(worldToDungeon({ x: ARENA_BOUNDS.right, y: ARENA_BOUNDS.bottom })).toEqual({ x: DUNGEON_ARENA_RECT.right, y: DUNGEON_ARENA_RECT.bottom })
    expect(DUNGEON_ARENA_RECT.left).toBeGreaterThanOrEqual(24)
    expect(DUNGEON_ARENA_RECT.right).toBeLessThanOrEqual(DUNGEON_WIDTH - 24)
    expect(DUNGEON_ARENA_RECT.top).toBeGreaterThanOrEqual(38)
    expect(DUNGEON_ARENA_RECT.bottom).toBeLessThanOrEqual(DUNGEON_HEIGHT - 8)
  })
})

describe('玩家 sprite 動畫由公開狀態／事件驅動', () => {
  it('精準閃避慢動作有非純音訊的青色聚焦與殘影提示', () => {
    expect(precisionSlowMotionVisualCue(true, 0.5)).toMatchObject({ visible: true, color: '#74d4cf' })
    expect(precisionSlowMotionVisualCue(true, 0.5).overlayAlpha).toBeGreaterThan(0)
    expect(precisionSlowMotionVisualCue(false, 1)).toEqual({ visible: false, color: '#74d4cf', overlayAlpha: 0 })
  })

  it('守角轉掃有 renderer 可讀的中央 VFX 契約，不會退化成只有事件文字', () => {
    const base = createRun('pivot-vfx')
    expect(pivotSweepVisualCue(base)).toEqual({ visible: false, position: null, direction: null, radiusUnits: 0 })
    expect(pivotSweepVisualCue({ ...base, player: { ...base.player, classObjects: { ...base.player.classObjects, pivotSweep: { position: { x: 1, y: -1 }, direction: { x: 0, y: 1 }, ticksRemaining: 12 } } } })).toEqual({ visible: true, position: { x: 1, y: -1 }, direction: { x: 0, y: 1 }, radiusUnits: 1.4 })
  })

  it('面向依主軸分成上、下、左、右四種，不再只分左右', () => {
    expect(cardinalDirection({ x: 0.2, y: -1 })).toBe('up')
    expect(cardinalDirection({ x: 0.2, y: 1 })).toBe('down')
    expect(cardinalDirection({ x: -1, y: 0.2 })).toBe('left')
    expect(cardinalDirection({ x: 1, y: 0.2 })).toBe('right')
  })

  it('移動、三段斬、閃避、受傷、死亡都有不同 pose', () => {
    const base = createRun('dungeon-pose-test')
    expect(heroPose({ ...base, previousInput: { ...base.previousInput, moveX: 1 } }, INITIAL_VFX_STATE)).toBe('move')
    expect(heroPose({ ...base, player: { ...base.player, combo: { hitIndex: 2, phase: 'active', phaseTicksRemaining: 2 } } }, INITIAL_VFX_STATE)).toBe('attack2')
    expect(heroPose({ ...base, player: { ...base.player, dodge: { ...base.player.dodge, active: true } } }, INITIAL_VFX_STATE)).toBe('dodge')
    expect(heroPose({ ...base, tick: 8 }, { ...INITIAL_VFX_STATE, playerHit: { spawnTick: 4 } })).toBe('hurt')
    expect(heroPose({ ...base, phase: 'defeat' }, INITIAL_VFX_STATE)).toBe('death')
  })
})

describe('戰鬥範圍提示與 core 幾何共用常數', () => {
  it('只有 startup/active 顯示短命扇形，三段使用各自的真實距離與角寬', () => {
    const base = createRun('attack-cue')
    for (const hitIndex of [1, 2, 3] as const) {
      const state = { ...base, player: { ...base.player, combo: { hitIndex, phase: 'active' as const, phaseTicksRemaining: 2 } } }
      const geometry = createPlayerAttackGeometry({ position: base.player.position, facing: base.player.facing, hitIndex, selectedMarks: [], pursuitActive: false, guardStacks: 0 })
      expect(attackWindowCue(state)).toEqual(geometry)
    }
    const recovery = { ...base, player: { ...base.player, combo: { hitIndex: 1 as const, phase: 'recovery' as const, phaseTicksRemaining: 2 } } }
    expect(attackWindowCue(recovery)).toBeNull()
  })

  it('startup cue 也套用裂焰／追擊／鐵壁的同一 helper，而非 render-only 倍率', () => {
    const base = createRun('mark-attack-cue')
    const pursuit = {
      ...base, selectedMark: 'pursuit-strike' as const, selectedMarks: ['pursuit-strike' as const],
      player: { ...base.player, pursuitTicksRemaining: 80, combo: { hitIndex: 1 as const, phase: 'startup' as const, phaseTicksRemaining: 2 } },
    }
    expect(attackWindowCue(pursuit)).toMatchObject({ variant: 'pursuit', range: 2.5, halfAngle: 0.2 })
    const consumed = { ...pursuit, player: { ...pursuit.player, pursuitTicksRemaining: 0 } }
    expect(attackWindowCue(consumed)).toMatchObject({ variant: 'base', range: 1.3 })
  })

  it('active cue 優先讀命中當刻快照，pursuit 消耗與玩家 lunge 後幾何不漂移', () => {
    const base = createRun('active-geometry-snapshot')
    const geometry = createPlayerAttackGeometry({ position: base.player.position, facing: base.player.facing, hitIndex: 1, selectedMarks: ['pursuit-strike'], pursuitActive: true, guardStacks: 0 })
    const state = {
      ...base,
      selectedMarks: ['pursuit-strike' as const],
      player: {
        ...base.player,
        position: geometry.origin,
        pursuitTicksRemaining: 0,
        combo: { hitIndex: 1 as const, phase: 'active' as const, phaseTicksRemaining: 2, attackGeometry: geometry },
      },
    }
    expect(attackWindowCue(state)).toBe(geometry)
  })

  it('敵方預兆提供輪廓、填色進度、方向與最後 20% 非色彩閃動旗標', () => {
    const base = materializeOpeningWave('telegraph').enemies[0]!
    const geometry = createEnemyAttackGeometry('ember-thrall', null, base.position, { x: 0, y: 0 })
    const enemy = { ...base, attackState: 'telegraph' as const, timerTicks: 5, telegraphGeometry: geometry }
    expect(telegraphCue(enemy)).toMatchObject({ outlined: true, directional: true, finalWarning: true })
    expect(telegraphCue(enemy).progress).toBeGreaterThanOrEqual(0.8)
    expect(telegraphCue(enemy).geometry).toBe(geometry)
    expect(telegraphCue(enemy).geometry).toMatchObject({ kind: 'cone', radius: THRALL_CONE_RADIUS_UNITS })
  })

  it('四種敵人各自使用不同 sprite identity，甲衛與 Boss 不會落入影刺客分支', () => {
    const kinds: readonly EnemyKind[] = ['ember-thrall', 'shade-skirmisher', 'bulwark-sentinel', 'ashen-warlord']
    const identities = kinds.map(enemySpriteIdentity)
    expect(new Set(identities).size).toBe(4)
    expect(enemySpriteIdentity('bulwark-sentinel')).toBe('bulwark-tower-shield')
    expect(enemySpriteIdentity('ashen-warlord')).toBe('warlord-crown-axe')
  })

  it('Boss smash／charge／summon 與三種一般敵人都有專屬地面提示形狀', () => {
    const base = materializeOpeningWave('all-telegraphs').enemies[0]!
    expect(telegraphCue({ ...base, kind: 'ember-thrall' }).shape).toBe('cone')
    expect(telegraphCue({ ...base, kind: 'shade-skirmisher' }).shape).toBe('lane')
    expect(telegraphCue({ ...base, kind: 'bulwark-sentinel' }).shape).toBe('shield-fan')
    expect(['smash', 'charge', 'summon'].map((bossAttack) => telegraphCue({ ...base, kind: 'ashen-warlord', bossAttack: bossAttack as 'smash' | 'charge' | 'summon' }).shape)).toEqual([
      'boss-smash', 'boss-charge', 'boss-summon',
    ])
  })

  it('十二枚印記各有 glyph identity 且都有非 HUD 的 render channel', () => {
    const marks: readonly MarkId[] = [
      'ember-core', 'cracking-flame-combo', 'twin-core-resonance', 'ember-sacrifice',
      'precision-afterimage', 'pursuit-strike', 'phantom-reset', 'shadow-harvest',
      'charged-retaliation', 'aftershock-shield', 'mirror-plating', 'bulwark-chain',
    ]
    const base = createRun('all-mark-render-cues')
    const state = {
      ...base,
      selectedMarks: marks,
      selectedMark: marks[marks.length - 1]!,
      player: {
        ...base.player,
        combo: { hitIndex: 3 as const, phase: 'active' as const, phaseTicksRemaining: 1 },
        dodge: { ...base.player.dodge, wasPrecision: true },
        emberCores: [{ position: { x: -1, y: 0 }, armTicksRemaining: 0 }, { position: { x: 1, y: 0 }, armTicksRemaining: 0 }],
        afterimages: [{ position: { x: 0, y: 1 }, ticksRemaining: 100 }],
        guardStacks: 3,
        pursuitTicksRemaining: 80,
        aftershockBonusReady: true,
        mirrorStanceTicksRemaining: 40,
      },
    }
    const cues = markVisualCues(state)
    expect(cues.map((cue) => cue.mark)).toEqual(marks)
    expect(cues.every((cue) => cue.visible)).toBe(true)
    expect(cues.every((cue) => ['world', 'attack', 'dodge', 'skill', 'status'].includes(cue.channel))).toBe(true)
    expect(new Set(marks.map(markGlyphIdentity)).size).toBe(12)
  })
})
