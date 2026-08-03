import { describe, expect, it } from 'vitest'
import { PLAYER_MOVE_SPEED_UNITS_PER_S, TICK_SECONDS } from './constants.js'
import { advanceEnemies, enemySustainedSpeedLimit } from './enemy.js'
import { buildState, makeEnemy } from './test-utils.js'
import type { EnemyKind, EnemyState, PlayerState } from './types.js'

function simulate(
  enemy: EnemyState,
  ticks: number,
  player: PlayerState = buildState().player,
): readonly EnemyState[] {
  const history: EnemyState[] = [enemy]
  let enemies: readonly EnemyState[] = [enemy]
  let nextPlayer = player
  for (let tick = 0; tick < ticks; tick += 1) {
    const result = advanceEnemies(enemies, nextPlayer, [])
    enemies = result.enemies
    nextPlayer = result.player
    history.push(enemies[0]!)
  }
  return history
}

function trajectory(kind: EnemyKind): readonly EnemyState[] {
  return simulate(makeEnemy({
    id: `${kind}-trajectory`,
    kind,
    position: { x: 3.2, y: 0.8 },
    attackState: 'cooldown',
    timerTicks: 35,
    bossPhase: kind === 'ashen-warlord' ? 1 : 0,
    bossAttack: kind === 'ashen-warlord' ? 'smash' : null,
  }), 300)
}

describe('敵人決定性動態走位', () => {
  it('玩家正常移速明確高於所有敵人的持續追擊／繞側／後撤上限', () => {
    for (const kind of ['ember-thrall', 'shade-skirmisher', 'bulwark-sentinel', 'ashen-warlord'] as const) {
      expect(PLAYER_MOVE_SPEED_UNITS_PER_S).toBeGreaterThan(enemySustainedSpeedLimit(kind))
    }
  })

  it('玩家追逐正在後撤的最快影刺客三秒後，實際距離縮短', () => {
    let player = { ...buildState().player, position: { x: 0, y: 0 } }
    let enemies: readonly EnemyState[] = [makeEnemy({
      id: 'retreating-shade', kind: 'shade-skirmisher', position: { x: 2, y: 0 }, attackState: 'cooldown', timerTicks: 1000,
    })]
    const initialDistance = Math.abs(enemies[0]!.position.x - player.position.x)
    for (let tick = 0; tick < 300; tick += 1) {
      const chaseDirection = Math.sign(enemies[0]!.position.x - player.position.x)
      player = { ...player, position: { x: player.position.x + chaseDirection * PLAYER_MOVE_SPEED_UNITS_PER_S * TICK_SECONDS, y: 0 } }
      const result = advanceEnemies(enemies, player, [])
      enemies = result.enemies
      player = result.player
    }
    expect(Math.abs(enemies[0]!.position.x - player.position.x)).toBeLessThan(initialDistance)
  })

  it.each<EnemyKind>(['ember-thrall', 'shade-skirmisher', 'bulwark-sentinel', 'ashen-warlord'])(
    '%s 在三秒觀察窗中不會進入接戰距離後永久停止',
    (kind) => {
      const history = trajectory(kind)
      const sampled = history.filter((_, index) => index % 30 === 0)
      const distinct = new Set(sampled.map((enemy) => `${enemy.position.x.toFixed(3)},${enemy.position.y.toFixed(3)}`))
      expect(distinct.size).toBeGreaterThanOrEqual(5)
      expect(history.some((enemy) => Math.hypot(enemy.velocity.x, enemy.velocity.y) > 0.05)).toBe(true)
    },
  )

  it('焰奴壓近、影刺客換側、甲衛封位與 Boss 模式走位形成不同軌跡', () => {
    const traces = (['ember-thrall', 'shade-skirmisher', 'bulwark-sentinel', 'ashen-warlord'] as const)
      .map((kind) => trajectory(kind).filter((_, index) => index % 60 === 0).map((enemy) => [enemy.position.x.toFixed(2), enemy.position.y.toFixed(2)]).join('|'))
    expect(new Set(traces).size).toBe(4)
  })

  it('重疊敵人會以 id 決定方向做 separation，不會疊成同一點', () => {
    const player = buildState().player
    let enemies: readonly EnemyState[] = [
      makeEnemy({ id: 'left-id', kind: 'ember-thrall', position: { x: 2, y: 0 }, attackState: 'cooldown', timerTicks: 80 }),
      makeEnemy({ id: 'right-id', kind: 'ember-thrall', position: { x: 2, y: 0 }, attackState: 'cooldown', timerTicks: 80 }),
    ]
    for (let tick = 0; tick < 80; tick += 1) enemies = advanceEnemies(enemies, player, []).enemies
    expect(Math.hypot(enemies[0]!.position.x - enemies[1]!.position.x, enemies[0]!.position.y - enemies[1]!.position.y)).toBeGreaterThan(0.45)
  })
})

describe('鎖定預兆幾何與命中', () => {
  function lockThrallTelegraph(player: PlayerState): EnemyState {
    const enemy = makeEnemy({
      id: 'locked-thrall', kind: 'ember-thrall', position: { x: 0, y: 0 },
      attackState: 'cooldown', timerTicks: 1,
    })
    return advanceEnemies([enemy], player, []).enemies[0]!
  }

  it('預兆開始後移動玩家不會改寫已鎖定的方向與落點；走出提示範圍安全', () => {
    const base = buildState().player
    const locked = lockThrallTelegraph({ ...base, position: { x: 1, y: 0 } })
    expect(locked.telegraphGeometry).not.toBeNull()
    const geometry = locked.telegraphGeometry
    let enemy = locked
    let player = { ...base, position: { x: -3, y: 0 } }
    const hp = player.hp
    while (enemy.attackState === 'telegraph') {
      const result = advanceEnemies([enemy], player, [])
      enemy = result.enemies[0]!
      player = result.player
      if (enemy.attackState === 'telegraph') expect(enemy.telegraphGeometry).toEqual(geometry)
    }
    expect(player.hp).toBe(hp)
  })

  it('玩家留在鎖定提示內時，在預兆結束的 active 起點命中', () => {
    const base = buildState().player
    let enemy = lockThrallTelegraph({ ...base, position: { x: 1, y: 0 } })
    let player = { ...base, position: { x: 1, y: 0 } }
    const hp = player.hp
    while (enemy.attackState === 'telegraph') {
      const result = advanceEnemies([enemy], player, [])
      enemy = result.enemies[0]!
      player = result.player
    }
    expect(player.hp).toBe(hp - 10)
  })
})
