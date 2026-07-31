import { describe, expect, it } from 'vitest'
import { tick } from './run.js'
import { buildState, input, makeEnemy } from './test-utils.js'
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
  it('三段依序命中造成 8/10/16 傷害，且需要在連段窗口內輸入才會銜接', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 } })],
    })
    // 第一段：startup(10) + active(7) 後命中；events 是每 tick 重新產生的，
    // 要在推進期間逐 tick 收集才抓得到，不能只看最後一個 tick 的 events。
    const step1 = stepN(state, 20, input({ attack: true }))
    const hit1 = step1.events.find((e) => e.type === 'comboHit')
    expect(hit1).toMatchObject({ type: 'comboHit', hitIndex: 1, damage: 8 })

    // 連段窗口內按下第二次攻擊，銜接第二段。
    const step2 = stepN(step1.states.at(-1)!, 20, input({ attack: true }))
    const hit2 = step2.events.find((e) => e.type === 'comboHit')
    expect(hit2).toMatchObject({ type: 'comboHit', hitIndex: 2, damage: 10 })

    const step3 = stepN(step2.states.at(-1)!, 20, input({ attack: true }))
    const hit3 = step3.events.find((e) => e.type === 'comboHit')
    expect(hit3).toMatchObject({ type: 'comboHit', hitIndex: 3, damage: 16 })
    // 第三段（finisher）沒有第四段可以銜接：放著不輸入，連段窗口跑完後應歸零。
    const afterFinisherWindow = stepN(step3.states.at(-1)!, 25).states.at(-1)!
    expect(afterFinisherWindow.player.combo.hitIndex).toBe(0)
  })

  it('連段窗口逾時未輸入則重置為第一段', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 } })],
    })
    const step1 = stepN(state, 20, input({ attack: true }))
    expect(step1.states.at(-1)!.player.combo.hitIndex).toBe(1)
    // 連段窗口 20 tick，放到超過，不輸入下一次攻擊。
    const timedOut = stepN(step1.states.at(-1)!, 25).states.at(-1)!
    expect(timedOut.player.combo).toEqual({ hitIndex: 0, phase: 'idle', phaseTicksRemaining: 0 })
    // 逾時後再攻擊，應該從第一段重新開始，而不是接續第二段。
    const restarted = stepN(timedOut, 20, input({ attack: true }))
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
        makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 }, attackState: 'telegraph', timerTicks: 35 }),
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
