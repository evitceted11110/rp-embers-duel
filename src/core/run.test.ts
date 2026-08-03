import { describe, expect, it } from 'vitest'
import { ATTACK_RANGE_UNITS, DODGE_INVINCIBILITY_S, secondsToTicks } from './constants.js'
import { CHARGED_RETALIATION } from './content.js'
import { createRun, tick } from './run.js'
import { buildState, input, makeEnemy } from './test-utils.js'
import type { EnemyState, GameState, MarkId, TickInput } from './types.js'

function nearestLivingEnemy(state: GameState): { enemy: EnemyState; dist: number } | undefined {
  let best: EnemyState | undefined
  let bestDist = Number.POSITIVE_INFINITY
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue
    const dist = Math.hypot(
      enemy.position.x - state.player.position.x,
      enemy.position.y - state.player.position.y,
    )
    if (dist < bestDist) {
      bestDist = dist
      best = enemy
    }
  }
  return best === undefined ? undefined : { enemy: best, dist: bestDist }
}

/**
 * 簡單的自動代打，只為了證明「整條 encounter1 → draft → encounter2 → victory 的流程
 * 走得通」，不是在驗證平衡數值——會朝最近敵人靠近、敵人預兆將近時朝側向閃避
 * （不往固定世界方向逃跑，避免把自己越拉越遠），否則持續交替按攻擊鍵製造連段輸入邊緣。
 */
function autoFightInput(state: GameState): TickInput {
  const nearest = nearestLivingEnemy(state)
  const aim = nearest === undefined
    ? { aimX: state.player.facing.x, aimY: state.player.facing.y }
    : {
        aimX: nearest.enemy.position.x - state.player.position.x,
        aimY: nearest.enemy.position.y - state.player.position.y,
      }
  const guardParryLeadTicks = secondsToTicks(
    DODGE_INVINCIBILITY_S + CHARGED_RETALIATION.dodgeTrailingParryS / 2,
  )
  const dodgeLeadTicks = state.selectedMarks.includes('charged-retaliation') ? guardParryLeadTicks : 8
  const imminent = state.enemies.some(
    (enemy) => enemy.hp > 0 && enemy.attackState === 'telegraph' && enemy.timerTicks <= dodgeLeadTicks,
  )
  const canDodge =
    state.player.dodge.cooldownTicksRemaining <= 0 &&
    (state.player.combo.phase === 'idle' || state.player.combo.phase === 'recovery')

  if (imminent && canDodge) {
    if (nearest !== undefined) {
      const dx = nearest.enemy.position.x - state.player.position.x
      const dy = nearest.enemy.position.y - state.player.position.y
      const len = Math.hypot(dx, dy) || 1
      return input({ ...aim, dodge: true, moveX: -dy / len, moveY: dx / len }) // 側向閃避
    }
    return input({ ...aim, dodge: true, moveX: 1 })
  }

  const guardCanSpend =
    state.selectedMarks.includes('charged-retaliation') &&
    state.player.guardStacks === 3 &&
    (!state.selectedMarks.includes('aftershock-shield') || state.player.aftershockBonusReady)
  if (nearest !== undefined && nearest.dist <= 3 && state.player.eCooldownTicksRemaining <= 0 && (guardCanSpend || state.player.afterimages.length > 0 || !state.selectedMarks.some((id) => id === 'precision-afterimage' || id === 'charged-retaliation'))) return input({ ...aim, skillE: true })
  if (nearest !== undefined && nearest.dist <= 4 && state.player.qCooldownTicksRemaining <= 0 && (!state.selectedMarks.includes('ember-core') || state.player.emberCores.length === 0)) return input({ ...aim, skillQ: true })

  if (nearest !== undefined && nearest.dist > ATTACK_RANGE_UNITS) {
    const dx = nearest.enemy.position.x - state.player.position.x
    const dy = nearest.enemy.position.y - state.player.position.y
    const len = Math.hypot(dx, dy) || 1
    return input({ ...aim, moveX: dx / len, moveY: dy / len, attack: state.tick % 2 === 0 })
  }

  if (nearest !== undefined) {
    const dx = nearest.enemy.position.x - state.player.position.x
    const dy = nearest.enemy.position.y - state.player.position.y
    const len = Math.hypot(dx, dy) || 1
    return input({ ...aim, moveX: -dy / len, moveY: dx / len, attack: state.tick % 2 === 0 })
  }
    return input({ ...aim, attack: state.tick % 2 === 0 })
}

function autoplay(initial: GameState, maxTicks: number, draftChoice: MarkId): GameState {
  let state = initial
  for (let i = 0; i < maxTicks; i += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') return state
    if (state.phase === 'draft') {
      const choice = state.draftOptions.includes(draftChoice) ? draftChoice : state.draftOptions[0]!
      state = tick(state, input({ draftChoice: choice }))
      continue
    }
    state = tick(state, autoFightInput(state))
  }
  return state
}

describe('run：兩段六關、第三與第六關 Boss 的波次遭遇', () => {
  it('createRun 建立遭遇1、玩家滿血、尚未選印記', () => {
    const state = createRun('flow-seed')
    expect(state.phase).toBe('encounter1')
    expect(state.selectedMark).toBeNull()
    expect(state.player.hp).toBe(220)
    expect(state.enemies).toHaveLength(2) // z1-e1 第一波：焰奴×2；後續波次預告後進場
  })

  it('遭遇1清空後進入三選一（draft），畫面上只有三枚 keystone 可選', () => {
    const state = buildState({ phase: 'draft', enemies: [], draftOptions: ['ember-core', 'precision-afterimage', 'charged-retaliation'] })
    expect(state.phase).toBe('draft')
    const next = tick(state, input({ draftChoice: 'charged-retaliation' }))
    expect(next.phase).toBe('encounter2')
    expect(next.selectedMark).toBe('charged-retaliation')
    expect(next.enemies).toHaveLength(2) // 第一波：焰奴＋影刺客；下一波會預告後進場
  })

  it('draft 階段暫停戰鬥計時：cooldown 等計時器不會在等待選擇時繼續推進', () => {
    const state = buildState({
      phase: 'draft',
      enemies: [],
      player: { ...buildState().player, qCooldownTicksRemaining: 50 },
    })
    const waited = tick(state, input())
    expect(waited.player.qCooldownTicksRemaining).toBe(50)
    expect(waited.phase).toBe('draft')
  })

  it.each<MarkId>(['ember-core', 'precision-afterimage', 'charged-retaliation'])(
    '完整打完六場遭遇與 Boss（首選 %s），每戰都套用一枚合法印記',
    (choice) => {
      const result = autoplay(createRun(`flow-${choice}`), 120000, choice)
      expect(result.phase, `index=${result.encounterIndex} hp=${result.player.hp} player=(${result.player.position.x.toFixed(2)},${result.player.position.y.toFixed(2)}) enemies=${result.enemies.map((enemy) => `${enemy.id}:${enemy.hp.toFixed(1)}@${enemy.position.x.toFixed(2)},${enemy.position.y.toFixed(2)}`).join('|')} marks=${result.selectedMarks.join(',')}`).toBe('victory')
      expect(result.selectedMarks).toContain(choice)
      expect(result.selectedMarks).toHaveLength(5)
      expect(result.encounterIndex).toBe(5)
      expect(result.enemies.every((enemy) => enemy.hp <= 0)).toBe(true)
      expect(result.player.hp).toBeGreaterThan(0)
      expect(result.player.hp).toBeLessThanOrEqual(220)
    },
  )

  it('完整六遭遇與 Boss 自動輸入以同 seed 重播，終局 GameState 完全一致', () => {
    const first = autoplay(createRun('full-boss-replay'), 120000, 'ember-core')
    const second = autoplay(createRun('full-boss-replay'), 120000, 'ember-core')
    expect(first.phase, `player=(${first.player.position.x.toFixed(2)},${first.player.position.y.toFixed(2)}) enemies=${first.enemies.map((enemy) => `${enemy.id}:${enemy.hp.toFixed(1)}@${enemy.position.x.toFixed(2)},${enemy.position.y.toFixed(2)}`).join('|')}`).toBe('victory')
    expect(second).toEqual(first)
  })

  it('玩家血量歸零時進入 defeat 階段，之後只有 restart 能離開', () => {
    const state = buildState({
      phase: 'encounter2',
      enemies: [
        makeEnemy({ id: 'e0', kind: 'ember-thrall', position: { x: 0.5, y: 0 }, attackState: 'telegraph', timerTicks: 1 }),
      ],
      player: { ...buildState().player, hp: 1 },
    })
    const next = tick(state, input())
    expect(next.phase).toBe('defeat')
    expect(next.player.hp).toBe(0)
    expect(next.events.some((e) => e.type === 'defeat')).toBe(true)

    const frozen = tick(next, input({ attack: true, moveX: 1 }))
    expect(frozen.phase).toBe('defeat')
    expect(frozen.player.hp).toBe(0)
  })

  it('快速重開（restart）：不論目前在哪個階段，都會回到全新的遭遇1、清空已選印記', () => {
    const midDraft = buildState({ phase: 'draft', selectedMark: null, enemies: [] })
    const restarted1 = tick(midDraft, input({ restart: true }))
    expect(restarted1.phase).toBe('encounter1')
    expect(restarted1.selectedMark).toBeNull()
    expect(restarted1.player.hp).toBe(220)
    expect(restarted1.seed).toBe(midDraft.seed)

    const midEncounter2 = buildState({ phase: 'encounter2', selectedMark: 'ember-core' })
    const restarted2 = tick(midEncounter2, input({ restart: true }))
    expect(restarted2.phase).toBe('encounter1')
    expect(restarted2.selectedMark).toBeNull()
  })
})
