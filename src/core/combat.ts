/**
 * 玩家動作解算：移動、三段連擊、閃避（含無敵幀／精準閃避／彎曲弧線／格擋尾段）、Q、E。
 *
 * 這裡是十二枚印記真正「改寫動作幾何」的地方——不是只在 HUD 顯示名稱：
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
  ATTACK_ACTIVE_TIMES_S,
  ATTACK_STARTUP_TIMES_S,
  BASE_E_HALF_ANGLE_RAD,
  BASE_E_RANGE_UNITS,
  BASE_E_COOLDOWN_S,
  BASE_E_PRIMARY_DAMAGE,
  BASE_E_SECONDARY_DAMAGE,
  BASE_Q_COOLDOWN_S,
  BASE_Q_DAMAGE,
  BASE_Q_HALF_ANGLE_RAD,
  BASE_Q_TARGET_RANGE_UNITS,
  CORE_BEND_DETECTION_RADIUS_UNITS,
  CORE_BEND_STRENGTH,
  COMBO_LINK_WINDOWS_S,
  COMBO_HIT_RECOVERY_S,
  COMBO_RECOIL_UNITS,
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
import { clampToArena } from './arena.js'
import { CHARGED_RETALIATION, EMBER_CORE, PRECISION_AFTERIMAGE, markEffectNumber } from './content.js'
import { enemyTypeDef } from './enemy.js'
import {
  createPlayerAttackGeometry,
  enemyHurtboxRadius,
  playerAttackHitsCircle,
  type PlayerAttackGeometry,
} from './player-attack-geometry.js'
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
  selectedMarks: readonly MarkId[],
): PlayerTickResult {
  const hasMark = (id: MarkId): boolean => selectedMarks.includes(id)
  const events: GameEvent[] = []
  let workingEnemies: EnemyState[] = enemies.map((e) => ({ ...e }))

  let position = player.position
  const aimDirection = normalize({ x: input.aimX, y: input.aimY })
  const hasAim = aimDirection.x !== 0 || aimDirection.y !== 0
  let facing = hasAim ? aimDirection : player.facing
  let combo: ComboState = player.combo
  let dodge = player.dodge
  let qCooldown = player.qCooldownTicksRemaining
  let eCooldown = player.eCooldownTicksRemaining
  let attackBonusPct = player.attackBonusPct
  let attackBonusTicks = player.attackBonusTicksRemaining
  let emberCores = player.emberCores.map((c) => ({ ...c }))
  let afterimages = player.afterimages.map((a) => ({ ...a }))
  let guardStacks = player.guardStacks
  let pursuitTicks = player.pursuitTicksRemaining
  let aftershockBonusReady = player.aftershockBonusReady
  let mirrorStanceTicks = player.mirrorStanceTicksRemaining

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

  function recoilEnemy(id: string, hitIndex: 1 | 2 | 3, from: Vector2): void {
    workingEnemies = workingEnemies.map((enemy) => {
      if (enemy.id !== id || enemy.hp <= 0) return enemy
      const direction = normalize(sub(enemy.position, from))
      const fallback = direction.x === 0 && direction.y === 0 ? facing : direction
      return {
        ...enemy,
        position: clampToArena(add(enemy.position, scale(fallback, COMBO_RECOIL_UNITS[hitIndex - 1]!))),
        velocity: { x: 0, y: 0 },
        locomotion: 'recover',
        attackRecoveryTicksRemaining: Math.max(
          enemy.attackRecoveryTicksRemaining,
          secondsToTicks(COMBO_HIT_RECOVERY_S[hitIndex - 1]!),
        ),
      }
    })
  }

  function knockback(id: string, from: Vector2): void {
    workingEnemies = workingEnemies.map((e) => {
      if (e.id !== id) return e
      const pushDir = normalize(sub(e.position, from))
      return { ...e, position: clampToArena(add(e.position, scale(pushDir, E_KNOCKBACK_DISTANCE_UNITS))) }
    })
  }

  function nearestLivingInCone(range: number, halfAngle: number, excludeId?: string): EnemyState | undefined {
    const minimumDot = Math.cos(halfAngle)
    let best: EnemyState | undefined
    let bestDist = Number.POSITIVE_INFINITY
    for (const enemy of workingEnemies) {
      if (enemy.hp <= 0 || enemy.id === excludeId) continue
      const offset = sub(enemy.position, position)
      const dist = distance(position, enemy.position)
      if (dist > range || dist >= bestDist) continue
      if (dist <= 0.0001) {
        best = enemy
        bestDist = dist
        continue
      }
      const direction = normalize(offset)
      const dot = direction.x * facing.x + direction.y * facing.y
      if (dot < minimumDot) continue
      best = enemy
      bestDist = dist
    }
    return best
  }

  function nearestLivingHitByAttack(geometry: PlayerAttackGeometry): EnemyState | undefined {
    let best: EnemyState | undefined
    let bestDist = Number.POSITIVE_INFINITY
    for (const enemy of workingEnemies) {
      if (enemy.hp <= 0) continue
      const dist = distance(geometry.origin, enemy.position)
      if (dist >= bestDist || !playerAttackHitsCircle(geometry, enemy.position, enemyHurtboxRadius(enemy.kind))) continue
      best = enemy
      bestDist = dist
    }
    return best
  }

  function performComboHit(current: ComboState): ComboState {
    const hitIndex = current.hitIndex as 1 | 2 | 3
    const cracking = hitIndex === 3 && hasMark('cracking-flame-combo')
    const pursuit = hitIndex === 1 && pursuitTicks > 0 && hasMark('pursuit-strike')
    const geometry = createPlayerAttackGeometry({
      position,
      facing,
      hitIndex,
      selectedMarks,
      pursuitActive: pursuit,
      guardStacks,
    })
    position = geometry.origin
    const target = nearestLivingHitByAttack(geometry)
    if (target !== undefined) {
      const bonus = attackBonusTicks > 0 ? 1 + attackBonusPct / 100 : 1
      const baseDamage = cracking ? markEffectNumber('cracking-flame-combo', 'damage') : pursuit ? markEffectNumber('pursuit-strike', 'damage') : comboDamage(hitIndex)
      const damage = baseDamage * bonus
      damageEnemy(target.id, damage)
      recoilEnemy(target.id, hitIndex, position)
      if (cracking) for (const enemy of workingEnemies) if (enemy.id !== target.id && enemy.hp > 0 && distance(enemy.position, position) <= markEffectNumber('cracking-flame-combo', 'cone_range_units')) damageEnemy(enemy.id, markEffectNumber('cracking-flame-combo', 'secondary_splash_damage'))
      if (pursuit) pursuitTicks = 0
      events.push({ type: 'comboHit', hitIndex, damage, targetId: target.id, geometry })
    } else {
      events.push({ type: 'comboWhiff', geometry })
    }
    return {
      ...current,
      phase: 'active',
      phaseTicksRemaining: secondsToTicks(ATTACK_ACTIVE_TIMES_S[hitIndex - 1]!),
      attackGeometry: geometry,
    }
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
    const end = clampToArena(add(start, scale(direction, DODGE_DISTANCE_UNITS)))

    let bendTarget: Vector2 | null = null
    if (hasMark('ember-core')) {
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

    if (hasMark('charged-retaliation')) {
      guardStacks = Math.min(CHARGED_RETALIATION.maxStacks, guardStacks + 1)
    }
    if (wasPrecision && hasMark('precision-afterimage')) {
      afterimages = [
        ...afterimages,
        { position: start, ticksRemaining: secondsToTicks(PRECISION_AFTERIMAGE.afterimageDurationS) },
      ]
      if (afterimages.length > PRECISION_AFTERIMAGE.maxCharges) {
        afterimages = afterimages.slice(afterimages.length - PRECISION_AFTERIMAGE.maxCharges)
      }
      events.push({ type: 'afterimageSpawned', position: start })
    }
    if (wasPrecision && hasMark('pursuit-strike')) pursuitTicks = secondsToTicks(markEffectNumber('pursuit-strike', 'window_s'))
    if (wasPrecision && hasMark('phantom-reset')) dodge = { ...dodge, cooldownTicksRemaining: 0 }
  } else if (dodge.invincibilityTicksRemaining <= 0) {
    // 一般移動：只有沒有在無敵幀中才吃 WASD 輸入（閃避期間的位移由步驟 2 接管）。
    const moveVec = normalize({ x: input.moveX, y: input.moveY })
    if (moveVec.x !== 0 || moveVec.y !== 0) {
      if (!hasAim) facing = moveVec
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
    if (!detonated && dodge.bendTarget !== null && hasMark('ember-core') && emberCores.length > 0) {
      const core = emberCores.find((candidate) => candidate.armTicksRemaining <= 0 && distance(position, candidate.position) <= EMBER_CORE.detonateRadiusUnits)
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
        const detonatedPosition = core.position
        emberCores = emberCores.filter((candidate) => candidate !== core)
        if (hasMark('twin-core-resonance')) {
          const chained = emberCores.find((candidate) => candidate.armTicksRemaining <= 0)
          if (chained !== undefined) {
            const chainDamage = markEffectNumber('twin-core-resonance', 'second_core_damage')
            for (const enemy of workingEnemies) if (enemy.hp > 0 && distance(enemy.position, chained.position) <= EMBER_CORE.detonateRadiusUnits) damageEnemy(enemy.id, chainDamage)
            emberCores = emberCores.filter((candidate) => candidate !== chained)
            events.push({ type: 'coreDetonated', position: chained.position })
          }
        }
        detonated = true
        events.push({ type: 'coreDetonated', position: detonatedPosition })
      }
    }

    dodge = { ...dodge, invincibilityTicksRemaining: remaining, detonatedThisDodge: detonated }

    if (remaining <= 0) {
      if (hasMark('charged-retaliation')) {
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
  // 3. 三段連擊（裂焰終結斬、精準後追擊與高蓄能鐵壁會改寫判定）。
  // ---------------------------------------------------------------------
  if (!dodgeCanStart) {
    if (combo.phase === 'idle') {
      if (input.attack) {
        combo = { hitIndex: 1, phase: 'startup', phaseTicksRemaining: Math.max(0, secondsToTicks(ATTACK_STARTUP_TIMES_S[0]) - 1), attackQueued: false }
      }
    } else if (combo.phase === 'startup') {
      const remaining = combo.phaseTicksRemaining - 1
      combo =
        remaining <= 0
          ? performComboHit(combo)
          : { ...combo, phaseTicksRemaining: remaining, attackQueued: combo.attackQueued === true || attackEdge }
    } else if (combo.phase === 'active') {
      const remaining = combo.phaseTicksRemaining - 1
      if (remaining <= 0) {
        combo = { ...combo, phase: 'recovery', phaseTicksRemaining: secondsToTicks(COMBO_LINK_WINDOWS_S[combo.hitIndex - 1]!), attackQueued: combo.attackQueued === true || input.attack }
      } else {
        combo = { ...combo, phaseTicksRemaining: remaining, attackQueued: combo.attackQueued === true || attackEdge }
      }
    } else {
      // `phaseTicksRemaining === 1` 是最後合法輸入 tick：本 tick 先取樣 edge／held，再結算
      // 窗口。若沒有輸入則轉 idle，下一 tick 的攻擊只能從第一段開始。
      const queued = combo.attackQueued === true || input.attack
      const remaining = combo.phaseTicksRemaining - 1
      if (remaining <= 0 && queued) {
        const nextHit = (combo.hitIndex === 3 ? 1 : combo.hitIndex + 1) as 1 | 2 | 3
        combo = { hitIndex: nextHit, phase: 'startup', phaseTicksRemaining: Math.max(0, secondsToTicks(ATTACK_STARTUP_TIMES_S[nextHit - 1]!) - 1), attackQueued: false }
      } else if (remaining <= 0) {
        combo = { hitIndex: 0, phase: 'idle', phaseTicksRemaining: 0, attackQueued: false }
      } else combo = { ...combo, phaseTicksRemaining: remaining, attackQueued: queued }
    }
  }

  // ---------------------------------------------------------------------
  // 4. Q：餘燼核心 keystone 改寫成「放置固定點核心」；其餘情況（含未選印記）
  //    為基礎版突進斬。
  // ---------------------------------------------------------------------
  if (qEdge && qCooldown <= 0) {
    if (hasMark('mirror-plating')) {
      mirrorStanceTicks = secondsToTicks(markEffectNumber('mirror-plating', 'stance_duration_s'))
      qCooldown = secondsToTicks(markEffectNumber('mirror-plating', 'q_cooldown_s'))
      events.push({ type: 'qCast' })
    } else if (hasMark('shadow-harvest')) {
      for (const image of afterimages) for (const enemy of workingEnemies) if (enemy.hp > 0 && distance(enemy.position, image.position) <= markEffectNumber('shadow-harvest', 'radius_units')) damageEnemy(enemy.id, markEffectNumber('shadow-harvest', 'damage_per_afterimage'))
      qCooldown = secondsToTicks(markEffectNumber('shadow-harvest', 'q_cooldown_s'))
      events.push({ type: 'qCast' })
    } else if (hasMark('ember-core')) {
      const nextCore = {
        position: add(position, scale(facing, EMBER_CORE.placeDistanceUnits)),
        armTicksRemaining: secondsToTicks(EMBER_CORE.armDelayS),
      }
      const maxCores = hasMark('twin-core-resonance') ? 2 : 1
      emberCores = [...emberCores, nextCore].slice(-maxCores)
      qCooldown = secondsToTicks(hasMark('twin-core-resonance') ? markEffectNumber('twin-core-resonance', 'q_cooldown_s') : EMBER_CORE.qCooldownS)
      events.push({ type: 'qCast' })
    } else {
      const target = nearestLivingInCone(BASE_Q_TARGET_RANGE_UNITS, BASE_Q_HALF_ANGLE_RAD)
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
    if (hasMark('ember-sacrifice')) {
      const armed = emberCores.filter((core) => core.armTicksRemaining <= 0)
      if (armed.length === 0) events.push({ type: 'eFailed' })
      else {
        for (const core of armed) {
          for (const enemy of workingEnemies) if (enemy.hp > 0 && distance(enemy.position, core.position) <= EMBER_CORE.detonateRadiusUnits) damageEnemy(enemy.id, EMBER_CORE.detonateDamage)
          events.push({ type: 'coreDetonated', position: core.position })
        }
        emberCores = emberCores.filter((core) => core.armTicksRemaining > 0)
        eCooldown = secondsToTicks(markEffectNumber('ember-sacrifice', 'e_cooldown_s'))
        events.push({ type: 'eCast' })
      }
    } else if (hasMark('precision-afterimage')) {
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
        position = clampToArena(destination)
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
    } else if (hasMark('charged-retaliation')) {
      if (guardStacks > 0) {
        const damage = CHARGED_RETALIATION.damagePerStack * guardStacks * (aftershockBonusReady ? 1 + markEffectNumber('aftershock-shield', 'one_time_next_e_bonus_pct') / 100 : 1)
        for (const enemy of workingEnemies) {
          if (enemy.hp > 0 && distance(enemy.position, position) <= GUARD_E_RADIUS_UNITS) {
            damageEnemy(enemy.id, damage)
            knockback(enemy.id, position)
          }
        }
        guardStacks = 0
        aftershockBonusReady = false
        eCooldown = secondsToTicks(CHARGED_RETALIATION.eCooldownS)
        events.push({ type: 'eCast' })
      } else {
        events.push({ type: 'eFailed' })
      }
    } else {
      const primary = nearestLivingInCone(BASE_E_RANGE_UNITS, BASE_E_HALF_ANGLE_RAD)
      if (primary !== undefined) {
        damageEnemy(primary.id, BASE_E_PRIMARY_DAMAGE)
        const secondary = nearestLivingInCone(BASE_E_RANGE_UNITS, BASE_E_HALF_ANGLE_RAD, primary.id)
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
  if (pursuitTicks > 0) pursuitTicks -= 1
  if (mirrorStanceTicks > 0) mirrorStanceTicks -= 1

  const nextPlayer: PlayerState = {
    position: clampToArena(position),
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
    pursuitTicksRemaining: pursuitTicks,
    aftershockBonusReady,
    mirrorStanceTicksRemaining: mirrorStanceTicks,
  }

  return { player: nextPlayer, enemies: workingEnemies, events }
}
