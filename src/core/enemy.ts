/**
 * 敵人 AI：接近 → 冷卻 → 預兆 → 判定生效，循環。
 *
 * 唯一使用亂數的地方是 `spawnEncounter()`——只在遭遇戰「建立當下」用一次，把結果
 * （每隻敵人的初始延遲 tick 數）烘焙成普通數字存進 EnemyState，之後 `advanceEnemies()`
 * 完全是純函式、不消耗任何亂數。這是本引擎決定性重播的關鍵：GameState 裡沒有任何
 * mutable 的 Rng 物件，只有普通資料，`toEqual` 才能正確比較兩次重播的每一 tick 狀態。
 */
import type { Rng } from '@rogue-paradise/rng'
import { BOSS_PHASES, ENCOUNTERS, ENEMY_DEFS, type EnemyTypeDef } from './content.js'
import { ENEMY_ATTACK_RECOVERY_S, ENEMY_CYCLE_REFERENCE_S, ENEMY_SEPARATION_RADIUS_UNITS, secondsToTicks, TICK_SECONDS } from './constants.js'
import { createEnemyAttackGeometry, enemyGeometryContains } from './enemy-geometry.js'
import { clampToArena } from './arena.js'
import type { BossAttackPattern, DodgeState, EnemyKind, EnemyLocomotion, EnemyState, GameEvent, MarkId, PlayerState } from './types.js'
import { markEffectNumber } from './content.js'
import { distance, normalize, scale, sub, add } from './vector.js'

const ARENA_SPAWN_RADIUS_UNITS = 4.0

export function enemyTypeDef(kind: EnemyKind): EnemyTypeDef {
  return ENEMY_DEFS[kind]
}

function expandRefs(refs: readonly { kind: EnemyKind; count: number }[]): EnemyKind[] {
  const kinds: EnemyKind[] = []
  for (const ref of refs) {
    for (let i = 0; i < ref.count; i += 1) kinds.push(ref.kind)
  }
  return kinds
}

/**
 * 建立一場遭遇戰的敵人陣列。位置以玩家出生點（原點）為圓心、`ARENA_SPAWN_RADIUS_UNITS`
 * 為半徑均勻分佈——content/zones.json 沒有規定具體站位，這是工程假設（見 constants.ts
 * 說明），用「依敵人數量均分角度」這個通用規則取代逐場硬編碼座標。
 */
export function spawnEncounter(encounterIndex: number, rng: Rng): readonly EnemyState[] {
  const encounter = ENCOUNTERS[encounterIndex]
  if (encounter === undefined) throw new Error(`不存在的遭遇索引 ${encounterIndex}`)
  const refs = encounter.enemies
  const kinds = expandRefs(refs)
  return kinds.map((kind, index) => {
    const def = enemyTypeDef(kind)
    const angle = (2 * Math.PI * index) / kinds.length
    const position = {
      x: Math.cos(angle) * ARENA_SPAWN_RADIUS_UNITS,
      y: Math.sin(angle) * ARENA_SPAWN_RADIUS_UNITS,
    }
    const intervalTicks = secondsToTicks(def.attackIntervalCycles * ENEMY_CYCLE_REFERENCE_S)
    // 只在建立時消耗一次亂數，抖動第一次攻擊的時機，避免多隻敵人的攻擊完全同步
    // （沿用 sim/prototype.ts 的既有慣例：0.5~1.0 倍攻擊間隔）。結果立刻烘焙成
    // 普通數字，往後不再需要這個 rng 實例。
    const jitter = rng.fork(`${encounter.id}-${kind}-${index}`).next()
    const initialDelayTicks = Math.max(1, Math.round(intervalTicks * (0.5 + jitter * 0.5)))
    return {
      id: `${kind}-${index}`,
      kind,
      position,
      hp: def.hp,
      maxHp: def.hp,
      attackState: 'approach' as const,
      velocity: { x: 0, y: 0 },
      locomotion: 'advance' as const,
      attackRecoveryTicksRemaining: 0,
      telegraphGeometry: null,
      timerTicks: initialDelayTicks,
      attacksPerformed: 0,
      bossPhase: 0,
      bossAttack: null,
    }
  })
}

export function spawnBoss(rng: Rng): readonly EnemyState[] {
  const def = enemyTypeDef('ashen-warlord')
  return [{
    id: 'ashen-warlord', kind: 'ashen-warlord', position: { x: 3.4, y: -1.2 }, hp: def.hp, maxHp: def.hp,
    attackState: 'approach', timerTicks: Math.max(1, Math.round(secondsToTicks(ENEMY_CYCLE_REFERENCE_S) * (0.75 + rng.next() * 0.2))),
    velocity: { x: 0, y: 0 }, locomotion: 'advance', attackRecoveryTicksRemaining: 0, telegraphGeometry: null,
    attacksPerformed: 0, bossPhase: 1, bossAttack: 'smash',
  }]
}

export type EnemyAdvanceResult = {
  readonly enemies: readonly EnemyState[]
  readonly player: PlayerState
  readonly events: readonly GameEvent[]
}

/**
 * 判定敵人本次執行的攻擊是否被玩家擋下：無敵幀優先，其次是蓄能反震的格擋尾段。
 * 尾段本身就是「本來會命中」轉判為格擋的真實連續時間窗（見 content.ts 對
 * dodgeTrailingParryS 的說明），不是機率骰。
 */
function resolveIncomingHit(
  dodge: DodgeState,
  mirrorStanceTicksRemaining: number,
): 'dodged' | 'parried' | 'hit' {
  if (dodge.invincibilityTicksRemaining > 0) return 'dodged'
  if (dodge.parryTailActive || mirrorStanceTicksRemaining > 0) return 'parried'
  return 'hit'
}

function bossPhase(enemy: EnemyState): 1 | 2 | 3 {
  const ratio = enemy.hp / enemy.maxHp
  return ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1
}

function bossPattern(attacksPerformed: number, phase: number, firstBoss = false): BossAttackPattern {
  // 第三關以重擊為主、只在第二階段叫援軍；第六關較常穿插衝撞與增援。
  if (firstBoss) return phase >= 2 && attacksPerformed % 4 === 3 ? 'summon' : attacksPerformed % 3 === 1 ? 'charge' : 'smash'
  if (phase >= 2 && attacksPerformed % 3 === 2) return 'summon'
  return attacksPerformed % 2 === 0 ? 'smash' : 'charge'
}

function sideFor(enemy: EnemyState): number {
  let hash = 0
  for (let index = 0; index < enemy.id.length; index += 1) hash = (hash * 31 + enemy.id.charCodeAt(index)) | 0
  return ((hash + (enemy.attacksPerformed ?? 0)) & 1) === 0 ? 1 : -1
}

function engagementDistance(enemy: EnemyState, phase: number): number {
  if (enemy.kind === 'ember-thrall') return 1.55
  if (enemy.kind === 'shade-skirmisher') return 3.1
  if (enemy.kind === 'bulwark-sentinel') return 2.35
  const pattern = bossPattern(enemy.attacksPerformed ?? 0, phase, enemy.id.startsWith('r2-'))
  return pattern === 'smash' ? 2.4 : pattern === 'charge' ? 4.2 : 4.8
}

function movementVelocity(enemy: EnemyState, allEnemies: readonly EnemyState[], player: PlayerState, phase: number): { velocity: { x: number; y: number }; locomotion: EnemyLocomotion } {
  const def = enemyTypeDef(enemy.kind)
  const offset = sub(player.position, enemy.position)
  const dist = Math.max(0.0001, distance(player.position, enemy.position))
  const toward = normalize(offset)
  const tangent = { x: -toward.y * sideFor(enemy), y: toward.x * sideFor(enemy) }
  let desired = { x: 0, y: 0 }
  let locomotion: EnemyLocomotion = 'advance'

  if (enemy.kind === 'ember-thrall') {
    desired = add(scale(toward, dist > 0.82 ? def.moveSpeedUnitsPerS : def.moveSpeedUnitsPerS * 0.18), scale(tangent, def.moveSpeedUnitsPerS * 0.16))
  } else if (enemy.kind === 'shade-skirmisher') {
    const targetDistance = (enemy.attacksPerformed ?? 0) % 2 === 0 ? 2.1 : 2.65
    const radial = Math.max(-0.72, Math.min(1, (dist - targetDistance) * 1.2))
    desired = add(scale(toward, def.moveSpeedUnitsPerS * radial), scale(tangent, def.moveSpeedUnitsPerS * 0.72))
    locomotion = radial < -0.2 ? 'retreat' : 'strafe'
  } else if (enemy.kind === 'bulwark-sentinel') {
    const radial = Math.max(-0.55, Math.min(0.7, (dist - 2.05) * 0.8))
    desired = add(scale(toward, def.moveSpeedUnitsPerS * radial), scale(tangent, def.moveSpeedUnitsPerS * 0.23))
    locomotion = Math.abs(radial) < 0.2 ? 'strafe' : radial < 0 ? 'retreat' : 'advance'
  } else {
    const pattern = bossPattern(enemy.attacksPerformed ?? 0, phase, enemy.id.startsWith('r2-'))
    const targetDistance = pattern === 'smash' ? 1.75 : pattern === 'charge' ? 3.8 : 4.4
    const radial = Math.max(-1, Math.min(1, (dist - targetDistance) * 0.9))
    const orbit = pattern === 'summon' ? 0.42 : pattern === 'charge' ? 0.18 : 0.08
    desired = add(scale(toward, def.moveSpeedUnitsPerS * radial), scale(tangent, def.moveSpeedUnitsPerS * orbit))
    locomotion = radial < -0.2 ? 'retreat' : orbit > 0.2 ? 'strafe' : 'advance'
  }

  // Exact overlap can happen when both actors reach a clamped corner. Step toward arena
  // center instead of producing a zero vector forever; stable coordinates keep this deterministic.
  if (dist < 0.35) {
    const inward = normalize({ x: -enemy.position.x, y: -enemy.position.y })
    desired = scale(inward.x === 0 && inward.y === 0 ? { x: sideFor(enemy), y: 0 } : inward, def.moveSpeedUnitsPerS * 0.65)
    locomotion = 'retreat'
  }

  let separation = { x: 0, y: 0 }
  for (const other of allEnemies) {
    if (other.id === enemy.id || other.hp <= 0) continue
    const delta = sub(enemy.position, other.position)
    const gap = Math.hypot(delta.x, delta.y)
    if (gap >= ENEMY_SEPARATION_RADIUS_UNITS) continue
    const away = gap < 0.0001
      ? { x: enemy.id < other.id ? -1 : 1, y: sideFor(enemy) * 0.25 }
      : scale(delta, 1 / gap)
    separation = add(separation, scale(away, (ENEMY_SEPARATION_RADIUS_UNITS - gap) * 5.5))
  }
  const combined = add(desired, separation)
  const magnitude = Math.hypot(combined.x, combined.y)
  const maximum = enemySustainedSpeedLimit(enemy.kind)
  return { velocity: magnitude > maximum ? scale(combined, maximum / magnitude) : combined, locomotion }
}

/** Max speed for continuous steering. Telegraph-driven lane dash/charge may exceed it briefly. */
export function enemySustainedSpeedLimit(kind: EnemyKind): number {
  return enemyTypeDef(kind).moveSpeedUnitsPerS
}

function moveEnemy(enemy: EnemyState, allEnemies: readonly EnemyState[], player: PlayerState, phase: number): EnemyState {
  if (enemy.attackRecoveryTicksRemaining > 0) {
    return { ...enemy, velocity: { x: 0, y: 0 }, locomotion: 'recover', attackRecoveryTicksRemaining: enemy.attackRecoveryTicksRemaining - 1 }
  }
  const motion = movementVelocity(enemy, allEnemies, player, phase)
  return { ...enemy, ...motion, position: clampToArena(add(enemy.position, scale(motion.velocity, TICK_SECONDS))) }
}

export function advanceEnemies(
  enemies: readonly EnemyState[],
  player: PlayerState,
  selectedMarks: readonly MarkId[],
): EnemyAdvanceResult {
  const hasChargedRetaliation = selectedMarks.includes('charged-retaliation')
  const events: GameEvent[] = []
  let hp = player.hp
  let guardStacks = player.guardStacks
  let aftershockBonusReady = player.aftershockBonusReady
  let summoned = 0
  const summonPositions: { x: number; y: number }[] = []
  let phaseEvent: 2 | 3 | null = null
  const hasLivingSummon = enemies.some((enemy) => enemy.kind === 'ember-thrall' && enemy.hp > 0)

  const nextEnemies = enemies.map((enemy): EnemyState => {
    if (enemy.hp <= 0) return enemy
    const def = enemyTypeDef(enemy.kind)
    const phase = enemy.kind === 'ashen-warlord' ? bossPhase(enemy) : 0
    if (phase > (enemy.bossPhase ?? 0) && phase > 1) phaseEvent = phase as 2 | 3

    if (enemy.attackState === 'approach') {
      const dist = distance(player.position, enemy.position)
      const moved = moveEnemy(enemy, enemies, player, phase)
      const remaining = Math.max(0, enemy.timerTicks - 1)
      return dist <= engagementDistance(enemy, phase)
        ? { ...moved, bossPhase: phase, attackState: 'cooldown', timerTicks: remaining }
        : { ...moved, bossPhase: phase, timerTicks: remaining }
    }

    if (enemy.attackState === 'cooldown') {
      const remaining = enemy.timerTicks - 1
      const moved = moveEnemy(enemy, enemies, player, phase)
      if (remaining > 0) return { ...moved, bossPhase: phase, timerTicks: remaining }
      const telegraphTicks = secondsToTicks(enemy.kind === 'ashen-warlord' ? (phase === 3 ? 0.55 : 0.8) : def.telegraphS)
      const nextPattern = enemy.kind === 'ashen-warlord' ? bossPattern(enemy.attacksPerformed ?? 0, phase, enemy.id.startsWith('r2-')) : null
      return {
        ...moved,
        bossPhase: phase,
        bossAttack: nextPattern,
        attackState: 'telegraph',
        timerTicks: telegraphTicks,
        velocity: { x: 0, y: 0 },
        locomotion: 'brace',
        telegraphGeometry: createEnemyAttackGeometry(enemy.kind, nextPattern, moved.position, player.position),
      }
    }

    // attackState === 'telegraph'
    const remaining = enemy.timerTicks - 1
    if (remaining > 0) return { ...enemy, timerTicks: remaining, velocity: { x: 0, y: 0 }, locomotion: 'brace' }

    // active 起點：使用預兆開始時鎖定的幾何判定，不追蹤玩家的新位置重算方向。
    const isSummon = enemy.kind === 'ashen-warlord' && enemy.bossAttack === 'summon'
    const geometry = enemy.telegraphGeometry ?? createEnemyAttackGeometry(enemy.kind, enemy.bossAttack ?? null, enemy.position, player.position)
    const inGeometry = enemyGeometryContains(geometry, player.position)
    const outcome = isSummon || !inGeometry ? 'dodged' : resolveIncomingHit(player.dodge, player.mirrorStanceTicksRemaining)
    if (outcome === 'dodged') {
      // 無事發生：precision 判定已在閃避開始當下算過，這裡不重複處理。
    } else if (outcome === 'parried') {
      events.push({ type: 'playerBlocked' })
      if (selectedMarks.includes('aftershock-shield') && guardStacks >= 3) aftershockBonusReady = true
    } else {
      const bossDamage = phase > 0 ? BOSS_PHASES[phase - 1]?.damage : undefined
      const damage = bossDamage ?? def.damage
      hp = Math.max(0, hp - damage)
      events.push({ type: 'playerHit', damage })
      if (hasChargedRetaliation) guardStacks = Math.max(0, guardStacks - 1)
    }

    let resolvedHp = enemy.hp
    if (outcome === 'parried' && player.mirrorStanceTicksRemaining > 0 && selectedMarks.includes('mirror-plating')) {
      resolvedHp = Math.max(0, resolvedHp - markEffectNumber('mirror-plating', 'reflect_damage') * def.armorMultiplier)
      guardStacks = Math.min(3, guardStacks + markEffectNumber('mirror-plating', 'grants_stack'))
      if (resolvedHp <= 0) events.push({ type: 'enemyDefeated', id: enemy.id })
    }
    if (isSummon && !hasLivingSummon) {
      summoned += 1
      if (geometry.kind === 'summon') summonPositions.push(...geometry.circles.map((circle) => circle.center))
    }
    const bossData = phase > 0 ? BOSS_PHASES[phase - 1] : undefined
    const intervalCycles = bossData?.attackIntervalCycles ?? def.attackIntervalCycles
    const dashPosition = geometry.kind === 'lane' && (enemy.kind === 'shade-skirmisher' || enemy.bossAttack === 'charge')
      ? add(geometry.origin, scale(geometry.direction, geometry.length * 0.78))
      : enemy.position
    return {
      ...enemy,
      position: clampToArena(dashPosition),
      velocity: geometry.kind === 'lane' ? scale(geometry.direction, geometry.length / TICK_SECONDS) : { x: 0, y: 0 },
      locomotion: geometry.kind === 'lane' ? 'dash' : 'recover',
      telegraphGeometry: null,
      attackRecoveryTicksRemaining: secondsToTicks(ENEMY_ATTACK_RECOVERY_S),
      hp: resolvedHp,
      bossPhase: phase,
      attacksPerformed: (enemy.attacksPerformed ?? 0) + 1,
      attackState: 'cooldown',
      timerTicks: secondsToTicks(intervalCycles * ENEMY_CYCLE_REFERENCE_S),
    }
  })

  const withSummons = [...nextEnemies]
  for (let i = 0; i < summoned; i += 1) {
    const def = enemyTypeDef('ember-thrall')
    const position = clampToArena(summonPositions[i] ?? { x: -3 + i * 1.5, y: 2.5 })
    withSummons.push({ id: `boss-thrall-${nextEnemies[0]?.attacksPerformed ?? 0}-${i}`, kind: 'ember-thrall', position, hp: def.hp, maxHp: def.hp, attackState: 'approach', velocity: { x: 0, y: 0 }, locomotion: 'advance', attackRecoveryTicksRemaining: 0, telegraphGeometry: null, timerTicks: secondsToTicks(0.65), attacksPerformed: 0, bossPhase: 0, bossAttack: null })
  }
  if (summoned > 0) events.push({ type: 'bossSummoned', count: summoned })
  if (phaseEvent !== null) events.push({ type: 'bossPhaseChanged', phase: phaseEvent })

  return {
    enemies: withSummons,
    player: { ...player, hp, guardStacks, aftershockBonusReady },
    events,
  }
}
