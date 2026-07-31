/**
 * 敵人 AI：接近 → 冷卻 → 預兆 → 判定生效，循環。
 *
 * 唯一使用亂數的地方是 `spawnEncounter()`——只在遭遇戰「建立當下」用一次，把結果
 * （每隻敵人的初始延遲 tick 數）烘焙成普通數字存進 EnemyState，之後 `advanceEnemies()`
 * 完全是純函式、不消耗任何亂數。這是本引擎決定性重播的關鍵：GameState 裡沒有任何
 * mutable 的 Rng 物件，只有普通資料，`toEqual` 才能正確比較兩次重播的每一 tick 狀態。
 */
import type { Rng } from '@rogue-paradise/rng'
import {
  EMBER_THRALL,
  ENCOUNTER_1,
  ENCOUNTER_2,
  SHADE_SKIRMISHER,
  type EncounterEnemyRef,
  type EnemyTypeDef,
} from './content.js'
import { ENEMY_CYCLE_REFERENCE_S, ENEMY_ENGAGE_RANGE_UNITS, secondsToTicks, TICK_SECONDS } from './constants.js'
import type { DodgeState, EnemyKind, EnemyState, GameEvent, PlayerState } from './types.js'
import { distance, normalize, scale, sub, add } from './vector.js'

const ARENA_SPAWN_RADIUS_UNITS = 4.0

export function enemyTypeDef(kind: EnemyKind): EnemyTypeDef {
  return kind === 'ember-thrall' ? EMBER_THRALL : SHADE_SKIRMISHER
}

function expandRefs(refs: readonly EncounterEnemyRef[]): EnemyKind[] {
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
export function spawnEncounter(
  encounterId: 'z1-e1' | 'z1-e2',
  rng: Rng,
): readonly EnemyState[] {
  const refs = encounterId === 'z1-e1' ? ENCOUNTER_1 : ENCOUNTER_2
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
    const jitter = rng.fork(`${encounterId}-${kind}-${index}`).next()
    const initialDelayTicks = Math.max(1, Math.round(intervalTicks * (0.5 + jitter * 0.5)))
    return {
      id: `${kind}-${index}`,
      kind,
      position,
      hp: def.hp,
      maxHp: def.hp,
      attackState: 'approach' as const,
      timerTicks: initialDelayTicks,
    }
  })
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
): 'dodged' | 'parried' | 'hit' {
  if (dodge.invincibilityTicksRemaining > 0) return 'dodged'
  if (dodge.parryTailActive) return 'parried'
  return 'hit'
}

export function advanceEnemies(
  enemies: readonly EnemyState[],
  player: PlayerState,
  hasChargedRetaliation: boolean,
): EnemyAdvanceResult {
  const events: GameEvent[] = []
  let hp = player.hp
  let guardStacks = player.guardStacks

  const nextEnemies = enemies.map((enemy): EnemyState => {
    if (enemy.hp <= 0) return enemy
    const def = enemyTypeDef(enemy.kind)

    if (enemy.attackState === 'approach') {
      const toPlayer = sub(player.position, enemy.position)
      const dist = distance(player.position, enemy.position)
      if (dist <= ENEMY_ENGAGE_RANGE_UNITS) {
        return { ...enemy, attackState: 'cooldown' }
      }
      const step = scale(normalize(toPlayer), def.moveSpeedUnitsPerS * TICK_SECONDS)
      return { ...enemy, position: add(enemy.position, step) }
    }

    if (enemy.attackState === 'cooldown') {
      const remaining = enemy.timerTicks - 1
      if (remaining > 0) return { ...enemy, timerTicks: remaining }
      const telegraphTicks = secondsToTicks(def.telegraphS)
      return { ...enemy, attackState: 'telegraph', timerTicks: telegraphTicks }
    }

    // attackState === 'telegraph'
    const remaining = enemy.timerTicks - 1
    if (remaining > 0) return { ...enemy, timerTicks: remaining }

    // 判定生效
    const outcome = resolveIncomingHit(player.dodge)
    if (outcome === 'dodged') {
      // 無事發生：precision 判定已在閃避開始當下算過，這裡不重複處理。
    } else if (outcome === 'parried') {
      events.push({ type: 'playerBlocked' })
    } else {
      hp = Math.max(0, hp - def.damage)
      events.push({ type: 'playerHit', damage: def.damage })
      if (hasChargedRetaliation) guardStacks = Math.max(0, guardStacks - 1)
    }

    const intervalTicks = secondsToTicks(def.attackIntervalCycles * ENEMY_CYCLE_REFERENCE_S)
    return { ...enemy, attackState: 'cooldown', timerTicks: intervalTicks }
  })

  return {
    enemies: nextEnemies,
    player: { ...player, hp, guardStacks },
    events,
  }
}
