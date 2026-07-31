/**
 * 玩家動作解算：移動、三段連擊、閃避（含無敵幀／精準閃避／彎曲弧線／格擋尾段）、Q、E。
 *
 * 這裡是三枚 keystone 印記真正「改寫動作幾何」的地方——不是加乘傷害數字：
 * - 餘燼核心：Q 從位移突進斬變成放置固定點核心；閃避路徑本身在核心武裝時從直線
 *   （`lerp`）變成朝核心彎曲的二次貝茲曲線（`quadraticBezier`），掃過核心才引爆。
 * - 精準殘影：只有「精準閃避」（判定生效前 `PRECISION_AFTERIMAGE.precisionWindowS`
 *   秒內完成）才留下殘影並充能；E 從固定範圍傷害變成瞬移到殘影座標。
 * - 蓄能反震：閃避無敵幀結束後新增一段真實連續時間的格擋判定尾段（不是機率骰——
 *   本引擎有 tick 級的連續時間軸，直接檢查敵人判定生效的那一刻是否落在這段尾段內，
 *   見 enemy.ts 的 `resolveIncomingHit()`）；E 從固定傷害變成層數兌現。
 *
 * 本函式不觸碰敵人的攻擊時序（那是 enemy.ts 的職責），只處理玩家主動觸發的一切。
 */
import {
  ATTACK_ACTIVE_S,
  ATTACK_COMBO_WINDOW_S,
  ATTACK_RANGE_UNITS,
  ATTACK_STARTUP_S,
  BASE_E_COOLDOWN_S,
  BASE_E_PRIMARY_DAMAGE,
  BASE_E_SECONDARY_DAMAGE,
  BASE_Q_COOLDOWN_S,
  BASE_Q_DAMAGE,
  CORE_BEND_DETECTION_RADIUS_UNITS,
  CORE_BEND_STRENGTH,
  DODGE_BASE_COOLDOWN_S,
  DODGE_DISTANCE_UNITS,
  DODGE_INVINCIBILITY_S,
  E_KNOCKBACK_DISTANCE_UNITS,
  GUARD_E_RADIUS_UNITS,
  PLAYER_MOVE_SPEED_UNITS_PER_S,
  Q_LUNGE_DISTANCE_UNITS,
  COMBO_DAMAGE,
  secondsToTicks,
  TICK_SECONDS,
} from './constants.js'
import { CHARGED_RETALIATION, EMBER_CORE, PRECISION_AFTERIMAGE } from './content.js'
import { enemyTypeDef } from './enemy.js'
import type { ComboState, EnemyState, GameEvent, MarkId, PlayerState, TickInput } from './types.js'
import { add, distance, lerp, normalize, quadraticBezier, scale, sub, type Vector2 } from './vector.js'

function comboDamage(hitIndex: 1 | 2 | 3): number {
  if (hitIndex === 1) return COMBO_DAMAGE[0]
  if (hitIndex === 2) return COMBO_DAMAGE[1]
  return COMBO_DAMAGE[2]
}

function bendControlPoint(start: Vector2, end: Vector2, core: Vector2): Vector2 {
  const midpoint = lerp(start, end, 0.5)
  const towardCore = sub(core, midpoint)
  return add(midpoint, scale(towardCore, CORE_BEND_STRENGTH))
}

export type PlayerTickResult = {
  readonly player: PlayerState
  readonly enemies: readonly EnemyState[]
  readonly events: readonly GameEvent[]
}

export function resolvePlayerTick(
  player: PlayerState,
  enemies: readonly EnemyState[],
  input: TickInput,
  previousInput: TickInput,
  selectedMark: MarkId | null,
): PlayerTickResult {
  const events: GameEvent[] = []
  let workingEnemies: EnemyState[] = enemies.map((e) => ({ ...e }))

  let position = player.position
  let facing = player.facing
  let combo: ComboState = player.combo
  let dodge = player.dodge
  let qCooldown = player.qCooldownTicksRemaining
  let eCooldown = player.eCooldownTicksRemaining
  let attackBonusPct = player.attackBonusPct
  let attackBonusTicks = player.attackBonusTicksRemaining
  let emberCores = player.emberCores.map((c) => ({ ...c }))
  let afterimages = player.afterimages.map((a) => ({ ...a }))
  let guardStacks = player.guardStacks

  const attackEdge = input.attack && !previousInput.attack
  const dodgeEdge = input.dodge && !previousInput.dodge
  const qEdge = input.skillQ && !previousInput.skillQ
  const eEdge = input.skillE && !previousInput.skillE

  function damageEnemy(id: string, amount: number): void {
    workingEnemies = workingEnemies.map((e) => {
      if (e.id !== id || e.hp <= 0) return e
      const def = enemyTypeDef(e.kind)
      const newHp = Math.max(0, e.hp - amount * def.armorMultiplier)
      if (newHp <= 0) events.push({ type: 'enemyDefeated', id })
      return { ...e, hp: newHp }
    })
  }

  function knockback(id: string, from: Vector2): void {
    workingEnemies = workingEnemies.map((e) => {
      if (e.id !== id) return e
      const pushDir = normalize(sub(e.position, from))
      return { ...e, position: add(e.position, scale(pushDir, E_KNOCKBACK_DISTANCE_UNITS)) }
    })
  }

  function nearestLiving(from: Vector2, excludeId?: string): EnemyState | undefined {
    let best: EnemyState | undefined
    let bestDist = Number.POSITIVE_INFINITY
    for (const e of workingEnemies) {
      if (e.hp <= 0) continue
      if (excludeId !== undefined && e.id === excludeId) continue
      const d = distance(from, e.position)
      if (d < bestDist) {
        bestDist = d
        best = e
      }
    }
    return best
  }

  // ---------------------------------------------------------------------
  // 1. 閃避是否觸發：可在閒置或連段窗口（後搖）期間發動，冷卻中不可發動。
  //    閃避優先權高於攻擊——觸發時立即打斷連段。
  // ---------------------------------------------------------------------
  const dodgeCanStart =
    dodgeEdge &&
    dodge.cooldownTicksRemaining <= 0 &&
    (combo.phase === 'idle' || combo.phase === 'recovery')

  if (dodgeCanStart) {
    combo = { hitIndex: 0, phase: 'idle', phaseTicksRemaining: 0 }

    const rawDir = { x: input.moveX, y: input.moveY }
    const normDir = normalize(rawDir)
    const direction = normDir.x !== 0 || normDir.y !== 0 ? normDir : facing
    const start = position
    const end = add(start, scale(direction, DODGE_DISTANCE_UNITS))

    let bendTarget: Vector2 | null = null
    if (selectedMark === 'ember-core') {
      for (const core of emberCores) {
        if (core.armTicksRemaining <= 0 && distance(start, core.position) <= CORE_BEND_DETECTION_RADIUS_UNITS) {
          bendTarget = core.position
          break
        }
      }
    }

    const precisionWindowTicks = secondsToTicks(PRECISION_AFTERIMAGE.precisionWindowS)
    const wasPrecision = workingEnemies.some(
      (e) => e.hp > 0 && e.attackState === 'telegraph' && e.timerTicks <= precisionWindowTicks,
    )

    dodge = {
      active: true,
      invincibilityTicksRemaining: secondsToTicks(DODGE_INVINCIBILITY_S),
      parryTailActive: false,
      parryTailTicksRemaining: 0,
      cooldownTicksRemaining: secondsToTicks(DODGE_BASE_COOLDOWN_S),
      startPosition: start,
      endPosition: end,
      bendTarget,
      wasPrecision,
      detonatedThisDodge: false,
    }
    facing = direction
    events.push({ type: 'dodgeStart', precision: wasPrecision, bent: bendTarget !== null })

    if (selectedMark === 'charged-retaliation') {
      guardStacks = Math.min(CHARGED_RETALIATION.maxStacks, guardStacks + 1)
    }
    if (wasPrecision && selectedMark === 'precision-afterimage') {
      afterimages = [
        ...afterimages,
        { position: start, ticksRemaining: secondsToTicks(PRECISION_AFTERIMAGE.afterimageDurationS) },
      ]
      if (afterimages.length > PRECISION_AFTERIMAGE.maxCharges) {
        afterimages = afterimages.slice(afterimages.length - PRECISION_AFTERIMAGE.maxCharges)
      }
      events.push({ type: 'afterimageSpawned', position: start })
    }
  } else if (dodge.invincibilityTicksRemaining <= 0) {
    // 一般移動：只有沒有在無敵幀中才吃 WASD 輸入（閃避期間的位移由步驟 2 接管）。
    const moveVec = normalize({ x: input.moveX, y: input.moveY })
    if (moveVec.x !== 0 || moveVec.y !== 0) {
      facing = moveVec
      position = add(position, scale(moveVec, PLAYER_MOVE_SPEED_UNITS_PER_S * TICK_SECONDS))
    }
  }

  // ---------------------------------------------------------------------
  // 2. 閃避位移推進：無論本 tick 是否剛觸發，只要無敵幀尚未結束就推進一步。
  //    這是餘燼核心 keystone 唯一改寫的位移路徑：無 bendTarget 時走直線
  //    （lerp），有 bendTarget 時走朝核心彎曲的二次貝茲曲線。
  // ---------------------------------------------------------------------
  if (dodge.invincibilityTicksRemaining > 0) {
    const totalTicks = secondsToTicks(DODGE_INVINCIBILITY_S)
    const remaining = dodge.invincibilityTicksRemaining - 1
    const t = 1 - remaining / totalTicks
    position =
      dodge.bendTarget === null
        ? lerp(dodge.startPosition, dodge.endPosition, t)
        : quadraticBezier(
            dodge.startPosition,
            bendControlPoint(dodge.startPosition, dodge.endPosition, dodge.bendTarget),
            dodge.endPosition,
            t,
          )

    let detonated = dodge.detonatedThisDodge
    if (!detonated && dodge.bendTarget !== null && selectedMark === 'ember-core' && emberCores.length > 0) {
      const core = emberCores[0]
      if (
        core !== undefined &&
        core.armTicksRemaining <= 0 &&
        distance(position, core.position) <= EMBER_CORE.detonateRadiusUnits
      ) {
        for (const enemy of workingEnemies) {
          if (enemy.hp > 0 && distance(enemy.position, core.position) <= EMBER_CORE.detonateRadiusUnits) {
            damageEnemy(enemy.id, EMBER_CORE.detonateDamage)
          }
        }
        attackBonusPct = EMBER_CORE.postDetonateAttackBonusPct
        attackBonusTicks = secondsToTicks(EMBER_CORE.postDetonateAttackBonusDurationS)
        emberCores = []
        detonated = true
        events.push({ type: 'coreDetonated', position: core.position })
      }
    }

    dodge = { ...dodge, invincibilityTicksRemaining: remaining, detonatedThisDodge: detonated }

    if (remaining <= 0) {
      if (selectedMark === 'charged-retaliation') {
        dodge = {
          ...dodge,
          parryTailActive: true,
          parryTailTicksRemaining: secondsToTicks(CHARGED_RETALIATION.dodgeTrailingParryS),
        }
      } else {
        dodge = { ...dodge, active: false }
      }
    }
  } else if (dodge.parryTailActive) {
    const remaining = dodge.parryTailTicksRemaining - 1
    dodge =
      remaining <= 0
        ? { ...dodge, parryTailActive: false, parryTailTicksRemaining: 0, active: false }
        : { ...dodge, parryTailTicksRemaining: remaining }
  } else if (dodge.active) {
    dodge = { ...dodge, active: false }
  }

  if (dodge.cooldownTicksRemaining > 0) {
    dodge = { ...dodge, cooldownTicksRemaining: dodge.cooldownTicksRemaining - 1 }
  }

  // ---------------------------------------------------------------------
  // 3. 三段連擊（keystone 均未改寫普攻本身，三條流派的普攻行為完全相同）。
  // ---------------------------------------------------------------------
  if (!dodgeCanStart) {
    if (combo.phase === 'idle') {
      if (attackEdge) {
        combo = { hitIndex: 1, phase: 'startup', phaseTicksRemaining: secondsToTicks(ATTACK_STARTUP_S) }
      }
    } else if (combo.phase === 'startup') {
      const remaining = combo.phaseTicksRemaining - 1
      combo =
        remaining <= 0
          ? { ...combo, phase: 'active', phaseTicksRemaining: secondsToTicks(ATTACK_ACTIVE_S) }
          : { ...combo, phaseTicksRemaining: remaining }
    } else if (combo.phase === 'active') {
      const remaining = combo.phaseTicksRemaining - 1
      if (remaining <= 0) {
        const target = nearestLiving(position)
        if (target !== undefined && distance(position, target.position) <= ATTACK_RANGE_UNITS) {
          const bonus = attackBonusTicks > 0 ? 1 + attackBonusPct / 100 : 1
          const damage = comboDamage(combo.hitIndex as 1 | 2 | 3) * bonus
          damageEnemy(target.id, damage)
          events.push({ type: 'comboHit', hitIndex: combo.hitIndex as 1 | 2 | 3, damage, targetId: target.id })
        } else {
          events.push({ type: 'comboWhiff' })
        }
        combo = { ...combo, phase: 'recovery', phaseTicksRemaining: secondsToTicks(ATTACK_COMBO_WINDOW_S) }
      } else {
        combo = { ...combo, phaseTicksRemaining: remaining }
      }
    } else {
      // combo.phase === 'recovery'：spec.md 稱為「連段窗口」——期間可被閃避打斷
      // （已在上面的 dodgeCanStart 分支處理），也可以在此輸入下一段銜接連擊。
      if (attackEdge && combo.hitIndex < 3) {
        combo = {
          hitIndex: (combo.hitIndex + 1) as 1 | 2 | 3,
          phase: 'startup',
          phaseTicksRemaining: secondsToTicks(ATTACK_STARTUP_S),
        }
      } else {
        const remaining = combo.phaseTicksRemaining - 1
        combo = remaining <= 0 ? { hitIndex: 0, phase: 'idle', phaseTicksRemaining: 0 } : { ...combo, phaseTicksRemaining: remaining }
      }
    }
  }

  // ---------------------------------------------------------------------
  // 4. Q：餘燼核心 keystone 改寫成「放置固定點核心」；其餘情況（含未選印記）
  //    為基礎版突進斬。
  // ---------------------------------------------------------------------
  if (qEdge && qCooldown <= 0) {
    if (selectedMark === 'ember-core') {
      emberCores = [
        {
          position: add(position, scale(facing, EMBER_CORE.placeDistanceUnits)),
          armTicksRemaining: secondsToTicks(EMBER_CORE.armDelayS),
        },
      ]
      qCooldown = secondsToTicks(EMBER_CORE.qCooldownS)
      events.push({ type: 'qCast' })
    } else {
      const target = nearestLiving(position)
      if (target !== undefined) {
        const distToTarget = distance(position, target.position)
        const lunge = Math.min(Q_LUNGE_DISTANCE_UNITS, Math.max(0, distToTarget - 0.1))
        position = add(position, scale(normalize(sub(target.position, position)), lunge))
        damageEnemy(target.id, BASE_Q_DAMAGE)
        qCooldown = secondsToTicks(BASE_Q_COOLDOWN_S)
        events.push({ type: 'qCast' })
      }
    }
  }

  // ---------------------------------------------------------------------
  // 5. E：精準殘影改寫成「瞬移到殘影」；蓄能反震改寫成「層數兌現 AoE」；
  //    其餘情況為基礎版破隙衝擊。
  // ---------------------------------------------------------------------
  if (eEdge && eCooldown <= 0) {
    if (selectedMark === 'precision-afterimage') {
      if (afterimages.length > 0) {
        let bestIndex = 0
        let bestDist = distance(position, afterimages[0]!.position)
        for (let i = 1; i < afterimages.length; i += 1) {
          const d = distance(position, afterimages[i]!.position)
          if (d < bestDist) {
            bestDist = d
            bestIndex = i
          }
        }
        const destination = afterimages[bestIndex]!.position
        afterimages = afterimages.filter((_, i) => i !== bestIndex)
        position = destination
        for (const enemy of workingEnemies) {
          if (enemy.hp > 0 && distance(enemy.position, destination) <= PRECISION_AFTERIMAGE.eTeleportRadiusUnits) {
            damageEnemy(enemy.id, PRECISION_AFTERIMAGE.eTeleportDamage)
          }
        }
        eCooldown = secondsToTicks(PRECISION_AFTERIMAGE.eCooldownS)
        events.push({ type: 'eCast' })
      } else {
        events.push({ type: 'eFailed' })
      }
    } else if (selectedMark === 'charged-retaliation') {
      if (guardStacks > 0) {
        const damage = CHARGED_RETALIATION.damagePerStack * guardStacks
        for (const enemy of workingEnemies) {
          if (enemy.hp > 0 && distance(enemy.position, position) <= GUARD_E_RADIUS_UNITS) {
            damageEnemy(enemy.id, damage)
            knockback(enemy.id, position)
          }
        }
        guardStacks = 0
        eCooldown = secondsToTicks(CHARGED_RETALIATION.eCooldownS)
        events.push({ type: 'eCast' })
      } else {
        events.push({ type: 'eFailed' })
      }
    } else {
      const primary = nearestLiving(position)
      if (primary !== undefined) {
        damageEnemy(primary.id, BASE_E_PRIMARY_DAMAGE)
        const secondary = nearestLiving(position, primary.id)
        if (secondary !== undefined) {
          damageEnemy(secondary.id, BASE_E_SECONDARY_DAMAGE)
          knockback(secondary.id, position)
        }
        eCooldown = secondsToTicks(BASE_E_COOLDOWN_S)
        events.push({ type: 'eCast' })
      } else {
        events.push({ type: 'eFailed' })
      }
    }
  }

  // ---------------------------------------------------------------------
  // 6. 每 tick 固定推進的計時器：冷卻、核心武裝、殘影存續、普攻加成持續時間。
  // ---------------------------------------------------------------------
  if (qCooldown > 0) qCooldown -= 1
  if (eCooldown > 0) eCooldown -= 1

  emberCores = emberCores.map((core) => {
    if (core.armTicksRemaining <= 0) return core
    const remaining = core.armTicksRemaining - 1
    if (remaining <= 0) events.push({ type: 'coreArmed', position: core.position })
    return { ...core, armTicksRemaining: remaining }
  })

  afterimages = afterimages
    .map((a) => ({ ...a, ticksRemaining: a.ticksRemaining - 1 }))
    .filter((a) => a.ticksRemaining > 0)

  if (attackBonusTicks > 0) {
    attackBonusTicks -= 1
    if (attackBonusTicks <= 0) {
      attackBonusTicks = 0
      attackBonusPct = 0
    }
  }

  const nextPlayer: PlayerState = {
    position,
    facing,
    hp: player.hp,
    combo,
    dodge,
    qCooldownTicksRemaining: qCooldown,
    eCooldownTicksRemaining: eCooldown,
    attackBonusPct,
    attackBonusTicksRemaining: attackBonusTicks,
    emberCores,
    afterimages,
    guardStacks,
  }

  return { player: nextPlayer, enemies: workingEnemies, events }
}
