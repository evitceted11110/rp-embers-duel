import { describe, expect, it } from 'vitest'
import { ATTACK_RANGE_UNITS } from './constants.js'
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
  const imminent = state.enemies.some(
    (enemy) => enemy.hp > 0 && enemy.attackState === 'telegraph' && enemy.timerTicks <= 8,
  )
  const canDodge =
    state.player.dodge.cooldownTicksRemaining <= 0 &&
    (state.player.combo.phase === 'idle' || state.player.combo.phase === 'recovery')

  if (imminent && canDodge) {
    if (nearest !== undefined) {
      const dx = nearest.enemy.position.x - state.player.position.x
      const dy = nearest.enemy.position.y - state.player.position.y
      const len = Math.hypot(dx, dy) || 1
      return input({ dodge: true, moveX: -dy / len, moveY: dx / len }) // 側向閃避
    }
    return input({ dodge: true, moveX: 1 })
  }

  if (nearest !== undefined && nearest.dist > ATTACK_RANGE_UNITS) {
    const dx = nearest.enemy.position.x - state.player.position.x
    const dy = nearest.enemy.position.y - state.player.position.y
    const len = Math.hypot(dx, dy) || 1
    return input({ moveX: dx / len, moveY: dy / len, attack: state.tick % 2 === 0 })
  }

  return input({ attack: state.tick % 2 === 0 })
}

function autoplay(initial: GameState, maxTicks: number, draftChoice: MarkId): GameState {
  let state = initial
  for (let i = 0; i < maxTicks; i += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') return state
    if (state.phase === 'draft') {
      state = tick(state, input({ draftChoice }))
      continue
    }
    state = tick(state, autoFightInput(state))
  }
  return state
}

describe('run：一個戰區、兩場遭遇戰、一次三選一（在遭遇1與遭遇2之間）', () => {
  it('createRun 建立遭遇1、玩家滿血、尚未選印記', () => {
    const state = createRun('flow-seed')
    expect(state.phase).toBe('encounter1')
    expect(state.selectedMark).toBeNull()
    expect(state.player.hp).toBe(220)
    expect(state.enemies).toHaveLength(1) // z1-e1：焰奴×1
  })

  it('遭遇1清空後進入三選一（draft），畫面上只有三枚 keystone 可選', () => {
    const state = buildState({ phase: 'draft', enemies: [] })
    expect(state.phase).toBe('draft')
    const next = tick(state, input({ draftChoice: 'charged-retaliation' }))
    expect(next.phase).toBe('encounter2')
    expect(next.selectedMark).toBe('charged-retaliation')
    expect(next.enemies).toHaveLength(3) // z1-e2：焰奴×2＋影刺客×1
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
    '完整打完遭遇1→三選一（選 %s）→遭遇2→勝利，並套用戰區清空回復',
    (choice) => {
      const result = autoplay(createRun(`flow-${choice}`), 20000, choice)
      expect(result.phase).toBe('victory')
      expect(result.selectedMark).toBe(choice)
      expect(result.enemies.every((enemy) => enemy.hp <= 0)).toBe(true)
      expect(result.player.hp).toBeGreaterThan(0)
      expect(result.player.hp).toBeLessThanOrEqual(220)
    },
  )

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
