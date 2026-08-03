import { describe, expect, it } from 'vitest'
import {
  ATTACK_HALF_ANGLES_RAD,
  ATTACK_RANGES_UNITS,
  ATTACK_RECOVERY_S,
  ATTACK_STARTUP_S,
  ATTACK_STARTUP_TIMES_S,
  ATTACK_ACTIVE_TIMES_S,
  COMBO_LINK_WINDOWS_S,
  COMBO_DAMAGE,
  COMBO_RECOIL_UNITS,
  secondsToTicks,
} from './constants.js'
import { tick } from './run.js'
import { buildState, input, makeEnemy } from './test-utils.js'
import { createPlayerAttackGeometry, enemyHurtboxRadius } from './player-attack-geometry.js'
import type { GameEvent, GameState } from './types.js'

function stepN(state: GameState, n: number, firstInput = input()): { states: GameState[]; events: GameEvent[] } {
  const states: GameState[] = [state]
  const events: GameEvent[] = []
  let s = state
  for (let i = 0; i < n; i += 1) {
    s = tick(s, i === 0 ? firstInput : input())
    states.push(s)
    events.push(...s.events)
  }
  return { states, events }
}

describe('普攻三段連擊（三枚 keystone 均未改寫，行為與流派無關）', () => {
  function inConnectionWindow(hitIndex: 1 | 2 | 3, ticksRemaining: number): GameState {
    const base = buildState({ phase: 'encounter2' })
    return {
      ...base,
      player: {
        ...base.player,
        combo: { hitIndex, phase: 'recovery', phaseTicksRemaining: ticksRemaining, attackQueued: false },
      },
      previousInput: input(),
    }
  }

  function finishConnectionWindow(state: GameState): GameState {
    let current = state
    while (current.player.combo.phase === 'recovery') current = tick(current, input())
    return current
  }

  it('公開連接窗口依序為 0.10s／0.20s／0.20s，不包含 startup 或 active', () => {
    expect(COMBO_LINK_WINDOWS_S).toEqual([0.1, 0.2, 0.2])
  })

  it('第一段窗口內 tap 會排隊接第二段；active 尾端的 rising edge 也不遺失', () => {
    const tapped = tick(inConnectionWindow(1, secondsToTicks(COMBO_LINK_WINDOWS_S[0]) - 2), input({ attack: true }))
    expect(finishConnectionWindow(tapped).player.combo).toMatchObject({ hitIndex: 2, phase: 'startup' })

    const activeTail = {
      ...inConnectionWindow(1, 1),
      player: {
        ...inConnectionWindow(1, 1).player,
        combo: { hitIndex: 1 as const, phase: 'active' as const, phaseTicksRemaining: 1, attackQueued: false },
      },
    }
    const bufferedAtActiveTail = tick(activeTail, input({ attack: true }))
    expect(bufferedAtActiveTail.player.combo).toMatchObject({ hitIndex: 1, phase: 'recovery', attackQueued: true })
    expect(finishConnectionWindow(bufferedAtActiveTail).player.combo).toMatchObject({ hitIndex: 2, phase: 'startup' })
  })

  it('第一段超過 0.10s 未輸入後，下一次 tap 從第一段開始', () => {
    const timedOut = tick(inConnectionWindow(1, 1), input())
    expect(timedOut.player.combo).toMatchObject({ hitIndex: 0, phase: 'idle' })
    const restarted = tick(timedOut, input({ attack: true }))
    expect(restarted.player.combo).toMatchObject({ hitIndex: 1, phase: 'startup' })
  })

  it('第二段窗口內 tap 會排隊接重擊；超過 0.20s 後 tap 從第一段開始', () => {
    const tapped = tick(inConnectionWindow(2, secondsToTicks(COMBO_LINK_WINDOWS_S[1]) - 3), input({ attack: true }))
    expect(finishConnectionWindow(tapped).player.combo).toMatchObject({ hitIndex: 3, phase: 'startup' })

    const timedOut = tick(inConnectionWindow(2, 1), input())
    const restarted = tick(timedOut, input({ attack: true }))
    expect(restarted.player.combo).toMatchObject({ hitIndex: 1, phase: 'startup' })
  })

  it.each([
    [1, 2, COMBO_LINK_WINDOWS_S[0]],
    [2, 3, COMBO_LINK_WINDOWS_S[1]],
  ] as const)('第 %i 段最後合法 tick 仍可接第 %i 段，下一 tick 才算逾時', (hitIndex, nextHit, windowS) => {
    expect(secondsToTicks(windowS)).toBeGreaterThan(0)
    const onBoundary = tick(inConnectionWindow(hitIndex, 1), input({ attack: true }))
    expect(onBoundary.player.combo).toMatchObject({ hitIndex: nextHit, phase: 'startup' })

    const expired = tick(inConnectionWindow(hitIndex, 1), input())
    const afterBoundary = tick(expired, input({ attack: true }))
    expect(afterBoundary.player.combo).toMatchObject({ hitIndex: 1, phase: 'startup' })
  })

  it('三段完整 startup/active/recovery 總長落在 0.75–0.9 秒', () => {
    const totalSeconds = ATTACK_STARTUP_TIMES_S.reduce(
      (sum, startup, index) => sum + startup + ATTACK_ACTIVE_TIMES_S[index]! + ATTACK_RECOVERY_S[index]!,
      0,
    )
    expect(totalSeconds).toBeGreaterThanOrEqual(0.75)
    expect(totalSeconds).toBeLessThanOrEqual(0.9)
  })

  it('攻擊在 active window 開始當 tick 命中，不延到 active 結束', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 } })],
    })
    const beforeActive = stepN(state, secondsToTicks(ATTACK_STARTUP_S) - 1, input({ attack: true })).states.at(-1)!
    expect(beforeActive.enemies[0]!.hp).toBe(200)
    const activeStart = tick(beforeActive, input({ attack: true }))
    expect(activeStart.player.combo.phase).toBe('active')
    expect(activeStart.enemies[0]!.hp).toBe(192)
    expect(activeStart.events).toContainEqual(expect.objectContaining({ type: 'comboHit', hitIndex: 1 }))
  })

  it('按住攻擊會可靠排隊完成三段，不必精準點三次 rising edge', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 } })],
    })
    let current = state
    const hits: number[] = []
    const totalTicks = secondsToTicks(ATTACK_STARTUP_TIMES_S.reduce(
      (sum, startup, index) => sum + startup + ATTACK_ACTIVE_TIMES_S[index]! + ATTACK_RECOVERY_S[index]!,
      0,
    ))
    for (let index = 0; index <= totalTicks; index += 1) {
      current = tick(current, input({ attack: true }))
      for (const event of current.events) if (event.type === 'comboHit') hits.push(event.hitIndex)
    }
    expect(hits.slice(0, 3)).toEqual([1, 2, 3])
  })

  it('長按攻擊至少兩輪都依 1→2→3 循環，第三段後不要求新的 edge', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', hp: 1000, maxHp: 1000, position: { x: 0.7, y: 0 } })],
    })
    let current = state
    const hits: number[] = []
    for (let index = 0; index < 220 && hits.length < 6; index += 1) {
      current = tick(current, input({ attack: true }))
      for (const event of current.events) if (event.type === 'comboHit') hits.push(event.hitIndex)
    }
    expect(hits).toEqual([1, 2, 3, 1, 2, 3])
  })

  it('放開攻擊後，第三段 0.20s loop 窗口逾時並重置；再按從第一段開始', () => {
    let current = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', hp: 1000, maxHp: 1000, position: { x: 0.7, y: 0 } })],
    })
    let reachedFinisher = false
    for (let index = 0; index < 120 && !reachedFinisher; index += 1) {
      current = tick(current, input({ attack: true }))
      reachedFinisher = current.events.some((event) => event.type === 'comboHit' && event.hitIndex === 3)
    }
    expect(reachedFinisher).toBe(true)

    const ticksUntilReset = current.player.combo.phaseTicksRemaining
      + secondsToTicks(COMBO_LINK_WINDOWS_S[2])
      + 1
    const expired = stepN(current, ticksUntilReset).states.at(-1)!
    expect(expired.player.combo).toMatchObject({ hitIndex: 0, phase: 'idle' })
    const restarted = tick(expired, input({ attack: true }))
    expect(restarted.player.combo).toMatchObject({ hitIndex: 1, phase: 'startup' })
  })

  it('三段數值與時序呈明確輕、輕、重，且 held 完整循環為 0.87s', () => {
    const durations = ATTACK_STARTUP_TIMES_S.map((startup, index) => startup + ATTACK_ACTIVE_TIMES_S[index]! + ATTACK_RECOVERY_S[index]!)
    expect(COMBO_DAMAGE[2]).toBeGreaterThan(COMBO_DAMAGE[1])
    expect(COMBO_DAMAGE[1]).toBeLessThan(COMBO_DAMAGE[2])
    expect(ATTACK_RANGES_UNITS[2]).toBeGreaterThan(ATTACK_RANGES_UNITS[1])
    expect(ATTACK_RANGES_UNITS[1]).toBeLessThan(ATTACK_RANGES_UNITS[2])
    expect(durations[1]).toBeGreaterThan(durations[0]!)
    expect(durations[2]).toBeGreaterThan(durations[1]!)
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(0.87, 8)
    expect(ATTACK_HALF_ANGLES_RAD[2]).toBeGreaterThanOrEqual(ATTACK_HALF_ANGLES_RAD[1]!)
  })

  it('命中產生 deterministic recoil／短 recovery，重擊明顯大於輕擊', () => {
    function resolveHit(hitIndex: 1 | 2 | 3): GameState {
      const base = buildState({
        phase: 'encounter2',
        enemies: [makeEnemy({ id: 'target', kind: 'ember-thrall', position: { x: 0.7, y: 0 }, attackState: 'cooldown', timerTicks: 500 })],
      })
      return tick({ ...base, player: { ...base.player, combo: { hitIndex, phase: 'startup', phaseTicksRemaining: 0 } } }, input({ attack: true }))
    }
    const light = resolveHit(1)
    const heavy = resolveHit(3)
    expect(light.enemies[0]!.position.x).toBeCloseTo(0.7 + COMBO_RECOIL_UNITS[0], 4)
    expect(heavy.enemies[0]!.position.x).toBeCloseTo(0.7 + COMBO_RECOIL_UNITS[2], 4)
    expect(heavy.enemies[0]!.position.x - 0.7).toBeGreaterThan((light.enemies[0]!.position.x - 0.7) * 2)
    expect(heavy.enemies[0]!.attackRecoveryTicksRemaining).toBeGreaterThan(light.enemies[0]!.attackRecoveryTicksRemaining)
    expect(resolveHit(3)).toEqual(heavy)
  })

  it('攻擊 tick 以 normalized aim 更新 facing，且只命中游標方向的真實扇形範圍', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [
        makeEnemy({ id: 'up', kind: 'ember-thrall', position: { x: 0, y: -1 } }),
        makeEnemy({ id: 'right', kind: 'ember-thrall', position: { x: 1, y: 0 } }),
      ],
    })

    const result = stepN(state, 20, input({ attack: true, aimX: 0, aimY: -8 })).states.at(-1)!

    expect(result.player.facing).toEqual({ x: 0, y: -1 })
    expect(result.enemies.find((enemy) => enemy.id === 'up')!.hp).toBe(192)
    expect(result.enemies.find((enemy) => enemy.id === 'right')!.hp).toBe(200)
  })

  it('combat 使用 circle-vs-sector：中心超過 blade reach 但 hurtbox 相交會命中，再超出則 miss', () => {
    const geometry = createPlayerAttackGeometry({
      position: { x: 0, y: 0 }, facing: { x: 1, y: 0 }, hitIndex: 1,
      selectedMarks: [], pursuitActive: false, guardStacks: 0,
    })
    const hurtbox = enemyHurtboxRadius('ember-thrall')
    const resolveAt = (x: number) => {
      const base = buildState({ phase: 'encounter2', enemies: [makeEnemy({ id: 'target', kind: 'ember-thrall', position: { x, y: 0 }, attackState: 'cooldown', timerTicks: 500 })] })
      return tick({ ...base, player: { ...base.player, combo: { hitIndex: 1, phase: 'startup', phaseTicksRemaining: 0 } } }, input({ attack: true }))
    }
    const overlap = resolveAt(geometry.origin.x + geometry.range + hurtbox + geometry.strokeHalfWidthUnits - 0.01)
    const outside = resolveAt(geometry.origin.x + geometry.range + hurtbox + geometry.strokeHalfWidthUnits + 0.01)
    expect(overlap.events).toContainEqual(expect.objectContaining({ type: 'comboHit', geometry }))
    expect(outside.events).toContainEqual(expect.objectContaining({ type: 'comboWhiff', geometry }))
  })

  it('Boss 較大 hurtbox 可在相同中心距離被刃帶擦中', () => {
    const geometry = createPlayerAttackGeometry({
      position: { x: 0, y: 0 }, facing: { x: 1, y: 0 }, hitIndex: 1,
      selectedMarks: [], pursuitActive: false, guardStacks: 0,
    })
    const centerX = geometry.origin.x + geometry.range + 0.85
    const base = buildState({ phase: 'boss', enemies: [makeEnemy({ id: 'boss', kind: 'ashen-warlord', hp: 2900, maxHp: 2900, position: { x: centerX, y: 0 }, attackState: 'cooldown', timerTicks: 500 })] })
    const result = tick({ ...base, player: { ...base.player, combo: { hitIndex: 1, phase: 'startup', phaseTicksRemaining: 0 } } }, input({ attack: true }))
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'comboHit', targetId: 'boss' }))
  })

  it('印記改寫的 authoritative geometry 隨 comboHit 事件公開，主斬與裂焰圓形 splash 不混為一談', () => {
    const base = buildState({
      phase: 'encounter2', selectedMark: 'cracking-flame-combo', selectedMarks: ['cracking-flame-combo'],
      enemies: [
        makeEnemy({ id: 'front', kind: 'ember-thrall', position: { x: 1.5, y: 0 }, attackState: 'cooldown', timerTicks: 500 }),
        makeEnemy({ id: 'behind', kind: 'ember-thrall', position: { x: -1, y: 0 }, attackState: 'cooldown', timerTicks: 500 }),
      ],
    })
    const result = tick({ ...base, player: { ...base.player, combo: { hitIndex: 3, phase: 'startup', phaseTicksRemaining: 0 } } }, input({ attack: true }))
    const event = result.events.find((candidate) => candidate.type === 'comboHit')
    expect(event).toMatchObject({ geometry: { variant: 'cracking-flame', range: 2.2, halfAngle: Math.PI / 3 } })
    if (event?.type === 'comboHit') expect(result.player.combo.attackGeometry).toBe(event.geometry)
    expect(result.enemies.find((enemy) => enemy.id === 'behind')!.hp).toBe(194)
  })

  it('瞄準向量為零時維持既有 facing，確保游標未進入舞台仍可用鍵盤攻擊', () => {
    const base = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'left', kind: 'ember-thrall', position: { x: -1, y: 0 } })],
    })
    const state = { ...base, player: { ...base.player, facing: { x: -1, y: 0 } } }

    const result = stepN(state, 20, input({ attack: true })).states.at(-1)!

    expect(result.player.facing).toEqual({ x: -1, y: 0 })
    expect(result.enemies[0]!.hp).toBe(192)
  })

  it('三段依序命中造成 8/10/16 傷害，且需要在連段窗口內輸入才會銜接', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 } })],
    })
    // events 每 tick 重新產生，逐 tick 收集；在 recovery 內送下一次 edge。
    const step1 = stepN(state, 10, input({ attack: true }))
    const hit1 = step1.events.find((e) => e.type === 'comboHit')
    expect(hit1).toMatchObject({ type: 'comboHit', hitIndex: 1, damage: 8 })

    // 連段窗口內按下第二次攻擊，銜接第二段。
    const step2 = stepN(step1.states.at(-1)!, 20, input({ attack: true }))
    const hit2 = step2.events.find((e) => e.type === 'comboHit')
    expect(hit2).toMatchObject({ type: 'comboHit', hitIndex: 2, damage: 10 })

    const step3 = stepN(step2.states.at(-1)!, 40, input({ attack: true }))
    const hit3 = step3.events.find((e) => e.type === 'comboHit')
    expect(hit3).toMatchObject({ type: 'comboHit', hitIndex: 3, damage: 16 })
    // 第三段（finisher）沒有第四段可以銜接：放著不輸入，連段窗口跑完後應歸零。
    const afterFinisherWindow = stepN(step3.states.at(-1)!, 40).states.at(-1)!
    expect(afterFinisherWindow.player.combo.hitIndex).toBe(0)
  })

  it('連段窗口逾時未輸入則重置為第一段', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 } })],
    })
    const step1 = stepN(state, 10, input({ attack: true }))
    expect(step1.states.at(-1)!.player.combo.hitIndex).toBe(1)
    // 放到超過第一段 recovery，不輸入下一次攻擊。
    const timedOut = stepN(step1.states.at(-1)!, 15).states.at(-1)!
    expect(timedOut.player.combo).toMatchObject({ hitIndex: 0, phase: 'idle', phaseTicksRemaining: 0 })
    // 逾時後再攻擊，應該從第一段重新開始，而不是接續第二段。
    const restarted = stepN(timedOut, 10, input({ attack: true }))
    const hit = restarted.events.find((e) => e.type === 'comboHit')
    expect(hit).toMatchObject({ hitIndex: 1, damage: 8 })
  })

  it('閃避可以在連段窗口（後搖）期間打斷攻擊', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 } })],
    })
    const afterHit1 = stepN(state, 18, input({ attack: true })).states.at(-1)!
    expect(afterHit1.player.combo.phase).toBe('recovery')
    const dodged = tick(afterHit1, input({ dodge: true, moveX: 1 }))
    expect(dodged.player.combo).toEqual({ hitIndex: 0, phase: 'idle', phaseTicksRemaining: 0 })
    expect(dodged.player.dodge.active).toBe(true)
  })
})

describe('餘燼核心 keystone：Q 改寫成放置核心；閃避路徑因核心而彎曲；掃過才引爆', () => {
  it('Q 在固定座標放置核心，玩家原地不動（不是位移突進斬）', () => {
    const state = buildState({ phase: 'encounter2', selectedMark: 'ember-core', enemies: [] })
    const next = tick(state, input({ skillQ: true }))
    expect(next.player.emberCores).toHaveLength(1)
    expect(next.player.position).toEqual({ x: 0, y: 0 })
    expect(next.player.emberCores[0]!.armTicksRemaining).toBeGreaterThan(0)
    expect(next.player.qCooldownTicksRemaining).toBeGreaterThan(0)
  })

  it('核心尚未武裝時，閃避維持直線位移，不引爆、不改變玩家 y 座標', () => {
    const state = buildState({
      phase: 'encounter2',
      selectedMark: 'ember-core',
      enemies: [],
      player: {
        ...buildState().player,
        emberCores: [{ position: { x: 1.5, y: 2.0 }, armTicksRemaining: 50 }],
      },
    })
    const { states } = stepN(state, 28, input({ dodge: true, moveX: 1 }))
    const midway = states[15]!
    const final = states[28]!
    expect(midway.player.position.y).toBe(0)
    expect(final.player.position.x).toBeCloseTo(3, 5)
    expect(final.player.position.y).toBe(0)
    expect(final.player.emberCores).toHaveLength(1) // 未引爆
  })

  it('核心已武裝且在偵測範圍內：閃避路徑彎曲偏離直線，掃過核心即引爆並給予普攻加成', () => {
    const state = buildState({
      phase: 'encounter2',
      selectedMark: 'ember-core',
      enemies: [makeEnemy({ id: 'target', kind: 'ember-thrall', position: { x: 1.5, y: 2.0 } })],
      player: {
        ...buildState().player,
        emberCores: [{ position: { x: 1.5, y: 2.0 }, armTicksRemaining: 0 }],
      },
    })
    const { states, events } = stepN(state, 28, input({ dodge: true, moveX: 1 }))
    const midway = states[15]!
    // 核心在直線路徑之上（垂直距離 2.0），彎曲後中途座標應明顯偏離 y=0
    // （對照上一則測試：核心未武裝時同一個 tick 的 y 恆為 0）。
    expect(midway.player.position.y).toBeGreaterThan(0.3)

    const final = states[28]!
    expect(final.player.emberCores).toHaveLength(0) // 已引爆並移除
    expect(final.player.attackBonusPct).toBe(25)
    expect(final.player.attackBonusTicksRemaining).toBeGreaterThan(0)
    expect(final.enemies[0]!.hp).toBe(200 - 18)
    expect(events.some((e) => e.type === 'coreDetonated')).toBe(true)
  })

  it('沒有選擇餘燼核心時，Q 是基礎版突進斬：位移、造成傷害、命中最近敵人', () => {
    const state = buildState({
      phase: 'encounter2',
      selectedMark: null,
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 3, y: 0 } })],
    })
    const next = tick(state, input({ skillQ: true }))
    expect(next.player.position.x).toBeGreaterThan(0) // 突進位移
    expect(next.enemies[0]!.hp).toBe(200 - 12)
  })

  it('基礎 Q 只鎖定 aim 方向與有效距離內的敵人', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [
        makeEnemy({ id: 'up', kind: 'ember-thrall', position: { x: 0, y: -3 } }),
        makeEnemy({ id: 'right', kind: 'ember-thrall', position: { x: 1, y: 0 } }),
      ],
    })
    const next = tick(state, input({ skillQ: true, aimX: 0, aimY: -1 }))
    expect(next.enemies.find((enemy) => enemy.id === 'up')!.hp).toBe(188)
    expect(next.enemies.find((enemy) => enemy.id === 'right')!.hp).toBe(200)
  })
})

describe('精準殘影 keystone：只有精準閃避才留下殘影並為 E 充能；E 改寫成瞬移突襲', () => {
  it('在敵方判定生效前 0.12 秒內完成閃避才算精準，留下殘影', () => {
    const state = buildState({
      phase: 'encounter2',
      selectedMark: 'precision-afterimage',
      enemies: [
        makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 5, y: 0 }, attackState: 'telegraph', timerTicks: 5 }),
      ],
    })
    const next = tick(state, input({ dodge: true, moveX: 1 }))
    expect(next.player.dodge.wasPrecision).toBe(true)
    expect(next.player.afterimages).toHaveLength(1)
    expect(next.player.afterimages[0]!.position).toEqual({ x: 0, y: 0 })
  })

  it('一般閃避（判定生效還早）不算精準，不留殘影', () => {
    const state = buildState({
      phase: 'encounter2',
      selectedMark: 'precision-afterimage',
      enemies: [
        makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 5, y: 0 }, attackState: 'telegraph', timerTicks: 20 }),
      ],
    })
    const next = tick(state, input({ dodge: true, moveX: 1 }))
    expect(next.player.dodge.wasPrecision).toBe(false)
    expect(next.player.afterimages).toHaveLength(0)
  })

  it('E 瞬移到現存殘影座標並造成範圍傷害，消耗一次殘影；沒有殘影時 E 失效', () => {
    const base = buildState({ phase: 'encounter2', selectedMark: 'precision-afterimage' })
    const withAfterimage: GameState = {
      ...base,
      player: {
        ...base.player,
        position: { x: 5, y: 5 },
        afterimages: [{ position: { x: 0, y: 0 }, ticksRemaining: 100 }],
      },
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 } })],
    }
    const next = tick(withAfterimage, input({ skillE: true }))
    expect(next.player.position).toEqual({ x: 0, y: 0 })
    expect(next.player.afterimages).toHaveLength(0)
    expect(next.enemies[0]!.hp).toBe(200 - 14)
    expect(next.player.eCooldownTicksRemaining).toBeGreaterThan(0)

    const noAfterimage: GameState = { ...base, player: { ...base.player, position: { x: 5, y: 5 } } }
    const failed = tick(noAfterimage, input({ skillE: true }))
    expect(failed.player.position).toEqual({ x: 5, y: 5 })
    expect(failed.events.some((e) => e.type === 'eFailed')).toBe(true)
  })

  it('沒有選擇精準殘影時，E 是基礎版破隙衝擊：主目標 18、次目標 9 並擊退', () => {
    const state = buildState({
      phase: 'encounter2',
      selectedMark: null,
      enemies: [
        makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 1, y: 0 } }),
        makeEnemy({ id: 'e1', kind: 'ember-thrall', position: { x: 2, y: 0 } }),
      ],
    })
    const next = tick(state, input({ skillE: true }))
    expect(next.enemies.find((e) => e.id === 'e0')!.hp).toBe(200 - 18)
    expect(next.enemies.find((e) => e.id === 'e1')!.hp).toBe(200 - 9)
  })

  it('基礎 E 的主次目標都必須位於 aim 半圓與有效距離內', () => {
    const state = buildState({
      phase: 'encounter2',
      selectedMark: null,
      enemies: [
        makeEnemy({ id: 'front', kind: 'ember-thrall', position: { x: 0, y: -1 } }),
        makeEnemy({ id: 'front2', kind: 'ember-thrall', position: { x: 0.5, y: -2 } }),
        makeEnemy({ id: 'behind', kind: 'ember-thrall', position: { x: 0, y: 1 } }),
      ],
    })
    const next = tick(state, input({ skillE: true, aimX: 0, aimY: -1 }))
    expect(next.enemies.find((enemy) => enemy.id === 'front')!.hp).toBe(182)
    expect(next.enemies.find((enemy) => enemy.id === 'front2')!.hp).toBe(191)
    expect(next.enemies.find((enemy) => enemy.id === 'behind')!.hp).toBe(200)
  })
})

describe('蓄能反震 keystone：閃避尾段新增真實格擋判定窗；E 改寫成層數兌現', () => {
  it('每次閃避 +1 層蓄能，上限 3', () => {
    const state = buildState({ phase: 'encounter2', selectedMark: 'charged-retaliation', enemies: [] })
    const next = tick(state, input({ dodge: true, moveX: 1 }))
    expect(next.player.guardStacks).toBe(1)

    const atCap: GameState = { ...state, player: { ...state.player, guardStacks: 3 } }
    const stillCapped = tick(atCap, input({ dodge: true, moveX: 1 }))
    expect(stillCapped.player.guardStacks).toBe(3)
  })

  it('格擋尾段（無敵幀結束後 0.15 秒）內判定生效的攻擊被格擋，不掉血、不扣層數', () => {
    const state = buildState({
      phase: 'encounter2',
      selectedMark: 'charged-retaliation',
      enemies: [
        // 玩家向 +x 閃避 3 單位；敵人必須在閃避終點的攻擊範圍內，才能驗證
        // 「原本會命中、但被尾段格擋」而不是因離開攻擊範圍而自然揮空。
        makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 3.5, y: 0 }, attackState: 'telegraph', timerTicks: 35 }),
      ],
    })
    const { states, events } = stepN(state, 40, input({ dodge: true, moveX: 1 }))
    expect(events.some((e) => e.type === 'playerBlocked')).toBe(true)
    expect(events.some((e) => e.type === 'playerHit')).toBe(false)
    expect(states.at(-1)!.player.hp).toBe(220)
    expect(states.at(-1)!.player.guardStacks).toBe(1) // 來自這次閃避本身，沒有因為格擋而增減
  })

  it('判定生效時機落在無敵幀與格擋尾段之外：正常受擊，扣血並損失一層蓄能', () => {
    const state = buildState({
      phase: 'encounter2',
      selectedMark: 'charged-retaliation',
      enemies: [
        makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 }, attackState: 'telegraph', timerTicks: 60 }),
      ],
      player: {
        ...buildState().player,
        guardStacks: 1,
      },
    })
    const { states, events } = stepN(state, 65)
    expect(events.some((e) => e.type === 'playerHit')).toBe(true)
    expect(states.at(-1)!.player.hp).toBe(220 - 10)
    expect(states.at(-1)!.player.guardStacks).toBe(0)
  })

  it('E 造成 6×層數 AoE 傷害並擊退、層數歸零；沒有層數時 E 失效', () => {
    const base = buildState({ phase: 'encounter2', selectedMark: 'charged-retaliation' })
    const withStacks: GameState = {
      ...base,
      player: { ...base.player, guardStacks: 2 },
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 1, y: 0 } })],
    }
    const next = tick(withStacks, input({ skillE: true }))
    expect(next.enemies[0]!.hp).toBe(200 - 12)
    expect(next.enemies[0]!.position.x).toBeGreaterThan(1) // 擊退
    expect(next.player.guardStacks).toBe(0)

    const noStacks: GameState = { ...base, player: { ...base.player, guardStacks: 0 } }
    const failed = tick(noStacks, input({ skillE: true }))
    expect(failed.events.some((e) => e.type === 'eFailed')).toBe(true)
  })
})
