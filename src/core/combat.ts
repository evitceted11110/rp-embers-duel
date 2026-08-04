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
import type { ClassId } from './class-expansion.js'
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
  classId: ClassId | null = null,
  selectedClassCards: readonly string[] = [],
): PlayerTickResult {
  const hasMark = (id: MarkId): boolean => selectedMarks.includes(id)
  const hasClassCard = (id: string): boolean => selectedClassCards.includes(id)
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
  let classObjects = player.classObjects
  if (classObjects.facingLock !== undefined && classObjects.facingLock.ticksRemaining > 0) {
    // 裂盾楔擊已承諾的重擊方向不能被游標偷轉；結束後才重新交還瞄準。
    facing = classObjects.facingLock.direction
  }

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

  function distanceToSegment(point: Vector2, start: Vector2, end: Vector2): number {
    const segment = sub(end, start)
    const lengthSquared = segment.x * segment.x + segment.y * segment.y
    if (lengthSquared <= 0.0001) return distance(point, start)
    const offset = sub(point, start)
    const t = Math.max(0, Math.min(1, (offset.x * segment.x + offset.y * segment.y) / lengthSquared))
    return distance(point, add(start, scale(segment, t)))
  }

  function performComboHit(current: ComboState): ComboState {
    const hitIndex = current.hitIndex as 1 | 2 | 3
    const cracking = hitIndex === 3 && hasMark('cracking-flame-combo')
    const pursuit = hitIndex === 1 && pursuitTicks > 0 && hasMark('pursuit-strike')
    let geometry = createPlayerAttackGeometry({
      position,
      facing,
      hitIndex,
      selectedMarks,
      pursuitActive: pursuit,
      guardStacks,
    })
    if (classId === 'forgeguard' && hasClassCard('bulwark-hammer') && hitIndex === 3) {
      // 原地半圓重錘：用更寬的幾何換掉追擊，讓第三段服務防區而不是追人。
      geometry = { ...geometry, range: 2.25, halfAngle: Math.PI * 0.72, variant: 'bulwark' }
    }
    if (classId === 'shadowline-hunter' && hasClassCard('broken-shadow-step') && hitIndex === 3) {
      // 窄長切線：只有穿過已建立的影線才會留下可回收的殘切。
      geometry = { ...geometry, range: 2.45, halfAngle: Math.PI * 0.18, variant: 'pursuit' }
    }
    if (classId === 'shadowline-hunter' && hasClassCard('crossed-sheath') && hitIndex === 3) {
      // 側滑回斬取代直穿：少了追身位移，但為被標定目標留下較可靠切口。
      geometry = { ...geometry, range: 2.1, halfAngle: Math.PI * 0.48, variant: 'bulwark' }
      const side = { x: -facing.y, y: facing.x }
      position = clampToArena(add(position, scale(side, 0.65)))
    }
    const stitchedCorner = classId === 'shadowline-hunter' && hasClassCard('stitched-corner') && hitIndex === 3
    const anchoredRiposte = classId === 'forgeguard' && hasClassCard('anchored-riposte') && hitIndex === 3
    const pinnedBodySwap = classId === 'shadowline-hunter' && hasClassCard('pinned-body-swap') && hitIndex === 3
    if (classId === 'forgeguard' && hasClassCard('shield-wedge') && hitIndex === 3) {
      // 窄長楔擊：只承諾一個角度，並在命中點留下必須靠 E 格擋兌現的裂盾點。
      geometry = { ...geometry, range: 2.8, halfAngle: Math.PI * 0.13, variant: 'pursuit' }
      classObjects = { ...classObjects, facingLock: { direction: facing, ticksRemaining: secondsToTicks(0.42) } }
    }
    if (stitchedCorner) {
      const line = classObjects.shadowLine
      if (line === null) {
        events.push({ type: 'comboWhiff', geometry })
        return { ...current, phase: 'active', phaseTicksRemaining: secondsToTicks(ATTACK_ACTIVE_TIMES_S[hitIndex - 1]!), attackGeometry: geometry }
      }
      // 沿既有線切至最近交點後才向游標補斬：沒有預先布線就沒有第三段收益。
      const segment = sub(line.end, line.start)
      const lengthSquared = segment.x * segment.x + segment.y * segment.y
      const offset = sub(position, line.start)
      const t = lengthSquared <= 0.0001 ? 0 : Math.max(0, Math.min(1, (offset.x * segment.x + offset.y * segment.y) / lengthSquared))
      position = clampToArena(add(line.start, scale(segment, t)))
      geometry = { ...geometry, origin: position, range: 2.2, halfAngle: Math.PI * 0.26, variant: 'pursuit' }
    }
    position = geometry.origin
    const target = nearestLivingHitByAttack(geometry)
    if (target !== undefined) {
      const bonus = attackBonusTicks > 0 ? 1 + attackBonusPct / 100 : 1
      const baseDamage = cracking ? markEffectNumber('cracking-flame-combo', 'damage') : pursuit ? markEffectNumber('pursuit-strike', 'damage') : comboDamage(hitIndex)
      const damage = baseDamage * bonus
      damageEnemy(target.id, damage)
      recoilEnemy(target.id, hitIndex, position)
      if (classId === 'forgeguard' && hasClassCard('bulwark-hammer') && hitIndex === 3 && classObjects.forgeNail !== null) {
        const pressuredEnemyIds = workingEnemies
          .filter((enemy) => enemy.hp > 0 && distance(enemy.position, classObjects.forgeNail!.position) <= 2.4)
          .map((enemy) => enemy.id)
        classObjects = { ...classObjects, forgeNail: { ...classObjects.forgeNail, pressuredEnemyIds } }
        events.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'bulwark-hammer', effect: '壁壘重錘', targetIds: pressuredEnemyIds })
      }
      if (classId === 'shadowline-hunter' && hasClassCard('broken-shadow-step') && hitIndex === 3 && classObjects.shadowLine?.markedEnemyIds.includes(target.id)) {
        classObjects = { ...classObjects, shadowLine: { ...classObjects.shadowLine, residualEnemyIds: [...classObjects.shadowLine.residualEnemyIds, target.id] } }
        events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'broken-shadow-step', effect: '斷影追步', targetIds: [target.id] })
      }
      if (classId === 'shadowline-hunter' && hasClassCard('crossed-sheath') && hitIndex === 3 && classObjects.shadowLine?.markedEnemyIds.includes(target.id)) {
        classObjects = { ...classObjects, shadowLine: { ...classObjects.shadowLine, residualEnemyIds: [...new Set([...classObjects.shadowLine.residualEnemyIds, target.id])] } }
        events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'crossed-sheath', effect: '交錯收刀', targetIds: [target.id] })
      }
      if (classId === 'forgeguard' && hasClassCard('heated-rotation') && hitIndex === 3 && classObjects.forgeNail !== null && distance(position, classObjects.forgeNail.position) <= 2.4) {
        // 防區內才補上慢速外掃；離區時刻意不補傷害／擊退，讓守點成為真取捨。
        const rotationTargetIds: string[] = []
        for (const enemy of workingEnemies) {
          if (enemy.hp > 0 && enemy.id !== target.id && distance(enemy.position, classObjects.forgeNail.position) <= 2.6) {
            damageEnemy(enemy.id, comboDamage(1))
            knockback(enemy.id, classObjects.forgeNail.position)
            rotationTargetIds.push(enemy.id)
          }
        }
        if (rotationTargetIds.length > 0) events.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'heated-rotation', effect: '灼鐵回旋', targetIds: rotationTargetIds })
      }
      if (classId === 'forgeguard' && hasClassCard('shield-wedge') && hitIndex === 3) {
        classObjects = { ...classObjects, breachPoint: { enemyId: target.id, position: target.position, ticksRemaining: secondsToTicks(5.2) } }
        events.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'shield-wedge', effect: '裂盾楔點', targetIds: [target.id] })
      }
      if (stitchedCorner) {
        events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'stitched-corner', effect: '縫影折角', targetIds: [target.id] })
      }
      if (anchoredRiposte && classObjects.forgeNail !== null) {
        // 定錨回擊不追著第三段的目標走：命中後沿可見火索退半步回防，
        // 之後只有熔鎖退讓成功格擋才能把這條路徑兌現成真正撤離。
        const tetherStart = position
        const towardNail = normalize(sub(classObjects.forgeNail.position, position))
        position = clampToArena(add(position, scale(towardNail, Math.min(0.7, distance(position, classObjects.forgeNail.position)))))
        classObjects = { ...classObjects, forgeTether: { start: tetherStart, end: classObjects.forgeNail.position, ticksRemaining: secondsToTicks(4.6) } }
        events.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'anchored-riposte', effect: '定錨回擊', targetIds: [target.id] })
      }
      if (pinnedBodySwap && classObjects.shadowLine?.markedEnemyIds.includes(target.id)) {
        // 只有先由 Q 標記同一敵人才交換位置；沒有標記時第三段仍只是短斬，
        // 不把玩家免費送穿敵群。
        const origin = position
        position = clampToArena(target.position)
        workingEnemies = workingEnemies.map((enemy) => enemy.id === target.id
          ? { ...enemy, position: origin, velocity: { x: 0, y: 0 }, locomotion: 'recover' }
          : enemy)
        classObjects = {
          ...classObjects,
          shadowLine: {
            ...classObjects.shadowLine,
            residualEnemyIds: [...new Set([...classObjects.shadowLine.residualEnemyIds, target.id])],
            swappedEnemyId: target.id,
          },
        }
        events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'pinned-body-swap', effect: '釘身換位', targetIds: [target.id] })
      }
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
    if (classId === 'forgeguard' && (hasClassCard('double-nail-seal') || hasClassCard('fire-hook') || hasClassCard('ring-forged-boundary') || hasClassCard('reforge-relocation'))) {
      // 同槽卡不是替換關係：雙釘決定可維持的防區數，引火鉤則在每次落釘時
      // 額外拉近邊緣敵人。兩者同時持有時，第二次 Q 仍能造第二枚釘，且兩次
      // 都會保有鉤子的可觀察拉扯。
      const hasDoubleNail = hasClassCard('double-nail-seal')
      const hasFireHook = hasClassCard('fire-hook')
      const hasRingBoundary = hasClassCard('ring-forged-boundary')
      const hasReforgeRelocation = hasClassCard('reforge-relocation')
      const nailPosition = clampToArena(add(position, scale(facing, hasDoubleNail ? 2.15 : 2.4)))
      let doubleNailTargetIds: readonly string[] | undefined
      if (hasReforgeRelocation && classObjects.forgeNail !== null) {
        // 回爐移釘不是多一個免費安全點：原釘整枚離開，防區與受壓名單一併重置。
        // 若玩家先建立雙釘，第二枚仍留在原地，清楚暴露「移哪一端」的風險。
        // 移釘後仍需活過 Q 冷卻，否則「再按 Q 拖移」在真實流程永遠不能成立。
        classObjects = { ...classObjects, forgeNail: { position: nailPosition, ticksRemaining: secondsToTicks(8.2), pressuredEnemyIds: [], ...(hasRingBoundary ? { arcFacing: facing } : {}) } }
        events.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'reforge-relocation', effect: '回爐移釘', targetIds: [] })
      } else if (classObjects.forgeNail === null || !hasDoubleNail) {
        // 第二枚釘需等 Q 的 7.4 秒冷卻才可建立；保留額外操作窗，
        // 讓玩家能真的接第三段壓力與 E 格擋，而不是只在資料上短暫同時存在。
        classObjects = { ...classObjects, forgeNail: { position: nailPosition, ticksRemaining: secondsToTicks(hasDoubleNail ? 15 : hasReforgeRelocation ? 8.2 : 4.4), pressuredEnemyIds: [], ...(hasRingBoundary ? { arcFacing: facing } : {}) } }
      } else {
        // 第二枚釘不覆蓋第一枚；兩釘之間的低矮熔鏈成為 E 的收束幾何。
        const caughtIds = workingEnemies
          .filter((enemy) => enemy.hp > 0 && distanceToSegment(enemy.position, classObjects.forgeNail!.position, nailPosition) <= 0.5)
          .map((enemy) => enemy.id)
        classObjects = {
          ...classObjects,
          forgeNail: { ...classObjects.forgeNail, pressuredEnemyIds: caughtIds },
          sealNail: { position: nailPosition, ticksRemaining: secondsToTicks(15), pressuredEnemyIds: caughtIds },
        }
        workingEnemies = workingEnemies.map((enemy) => caughtIds.includes(enemy.id)
          ? { ...enemy, position: add(enemy.position, scale(normalize(sub(add(classObjects.forgeNail!.position, nailPosition), enemy.position)), 0.34)), velocity: { x: 0, y: 0 }, locomotion: 'recover' }
          : enemy)
        doubleNailTargetIds = caughtIds
      }
      if (hasDoubleNail && doubleNailTargetIds !== undefined) events.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'double-nail-seal', effect: '雙釘封口', targetIds: doubleNailTargetIds })
      if (hasFireHook) {
        // 僅拖拉防區邊緣、沒有傷害，避免 Q 取代讀招與 E 的責任。
        const hookedTargetIds: string[] = []
        workingEnemies = workingEnemies.map((enemy) => {
          const d = distance(enemy.position, nailPosition)
          if (enemy.hp <= 0 || d < 1.2 || d > 4.4) return enemy
          const toward = normalize(sub(nailPosition, enemy.position))
          hookedTargetIds.push(enemy.id)
          return { ...enemy, position: clampToArena(add(enemy.position, scale(toward, 0.75))), velocity: { x: 0, y: 0 }, locomotion: 'recover' }
        })
        if (hookedTargetIds.length > 0) events.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'fire-hook', effect: '引火鉤', targetIds: hookedTargetIds })
      }
      if (hasRingBoundary) events.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'ring-forged-boundary', effect: '環鑄界線', targetIds: [] })
      qCooldown = secondsToTicks(hasDoubleNail ? 7.4 : 7)
      events.push({ type: 'qCast' })
    } else if (classId === 'shadowline-hunter' && (hasClassCard('double-line-return') || hasClassCard('gap-marking') || hasClassCard('reverse-mark-anchor') || hasClassCard('loop-tether'))) {
      // 雙線與標定是兩個可疊合的 Q 管線：前者保留第二條短命折返線，後者
      // 將命中寬度收窄為精準標定。任一張不會因另一張已投資而失效。
      const hasLoopTether = hasClassCard('loop-tether')
      // 環扣索改變的是線的幾何（彎折控制點），雙線折返改變的是線的數量。
      // 兩者可以同時成立：每條折返線都保留可繪製的彎線資料，第二次 Q
      // 也仍會建立 returnLine；不能以 loop-tether 靜默吃掉雙線構築。
      const hasDoubleLine = hasClassCard('double-line-return')
      const hasGapMarking = hasClassCard('gap-marking')
      const hasReverseAnchor = hasClassCard('reverse-mark-anchor')
      const end = clampToArena(add(position, scale(facing, 4.3)))
      const segment = sub(end, position)
      const lengthSquared = segment.x * segment.x + segment.y * segment.y
      const markedEnemyIds = workingEnemies.filter((enemy) => {
        if (enemy.hp <= 0) return false
        const offset = sub(enemy.position, position)
        const projection = Math.max(0, Math.min(1, (offset.x * segment.x + offset.y * segment.y) / lengthSquared))
        return distance(enemy.position, add(position, scale(segment, projection))) <= (hasGapMarking ? 0.52 : 0.75)
      }).map((enemy) => enemy.id)
      const anchor = hasReverseAnchor
        ? workingEnemies.filter((enemy) => markedEnemyIds.includes(enemy.id)).sort((a, b) => distance(position, a.position) - distance(position, b.position))[0]
        : undefined
      const lineEnd = anchor?.position ?? end
      // 折返線必須至少存活至 Q 冷卻結束，否則「雙線」只會在資料上存在、
      // 實戰永遠無法形成第二條線。
      const curveControl = hasLoopTether
        ? clampToArena(add(add(position, scale(segment, 0.5)), scale({ x: -facing.y, y: facing.x }, 1.15)))
        : undefined
      const nextLine = {
        start: position,
        end: lineEnd,
        ticksRemaining: secondsToTicks(hasDoubleLine ? 7.2 : 3.8),
        markedEnemyIds,
        residualEnemyIds: [],
        ...(anchor === undefined ? {} : { anchorEnemyId: anchor.id }),
        ...(hasDoubleLine ? { kind: 'double-line' as const } : hasLoopTether ? { kind: 'loop-tether' as const } : {}),
        ...(curveControl === undefined ? {} : { curveControl }),
      }
      classObjects = !hasDoubleLine || classObjects.shadowLine === null
        ? { ...classObjects, shadowLine: nextLine }
        : { ...classObjects, returnLine: nextLine }
      qCooldown = secondsToTicks(hasDoubleLine ? 6.5 : 5.8)
      events.push({ type: 'qCast' })
      if (hasLoopTether) events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'loop-tether', effect: '環扣索', targetIds: markedEnemyIds })
      if (hasDoubleLine && classObjects.returnLine !== undefined) events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'double-line-return', effect: '雙線折返', targetIds: markedEnemyIds })
      if (hasGapMarking && markedEnemyIds.length > 0) events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'gap-marking', effect: '獵隙標定', targetIds: markedEnemyIds })
      if (anchor !== undefined) events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'reverse-mark-anchor', effect: '逆標吊點', targetIds: [anchor.id] })
    } else if (hasMark('mirror-plating')) {
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
    if (classId === 'forgeguard' && (hasClassCard('pressure-furnace-roar') || hasClassCard('iron-curtain-recall') || hasClassCard('corner-pivot') || hasClassCard('molten-lock-retreat'))) {
      // 空按只有短格擋窗，沒有隱性收益；成功格擋後才由 run.ts 兌現防區反震。
      mirrorStanceTicks = secondsToTicks(0.24)
      eCooldown = secondsToTicks(5.5)
      events.push({ type: 'eCast' })
    } else if (classId === 'shadowline-hunter' && (hasClassCard('returning-rend') || hasClassCard('residual-collection') || hasClassCard('terminal-drop') || hasClassCard('cross-line-borrow'))) {
      const line = classObjects.shadowLine
      const hasReturningRend = hasClassCard('returning-rend')
      const hasResidualCollection = hasClassCard('residual-collection')
      const hasTerminalDrop = hasClassCard('terminal-drop')
      const hasCrossLineBorrow = hasClassCard('cross-line-borrow')
      if (line === null || (hasResidualCollection && !hasReturningRend && !hasTerminalDrop && line.residualEnemyIds.length === 0)) {
        events.push({ type: 'eFailed' })
      } else {
        const terminalTarget = hasTerminalDrop
          ? workingEnemies.filter((enemy) => line.markedEnemyIds.includes(enemy.id) && enemy.hp > 0).sort((a, b) => distance(position, a.position) - distance(position, b.position))[0]
          : undefined
        // 斷端落刃不能把「線端剛好跟著吊點」誤當成已落在吊點；必須真的有被標記
        // 的落刃目標。否則保留位置並讓 run.ts 輸出可追溯的未落於吊點。
        if (hasTerminalDrop && terminalTarget === undefined) {
          events.push({ type: 'eFailed' })
        } else {
          const crossLine = classObjects.returnLine?.kind === 'double-line' ? classObjects.returnLine : undefined
          const origin = position
          position = hasCrossLineBorrow && crossLine !== undefined ? crossLine.end : terminalTarget?.position ?? line.end
          if (hasCrossLineBorrow && crossLine !== undefined) {
            classObjects = { ...classObjects, crossBorrow: { start: origin, end: crossLine.end, ticksRemaining: secondsToTicks(1.1) } }
            events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'cross-line-borrow', effect: '跨線借位', targetIds: [...new Set([...line.markedEnemyIds, ...crossLine.markedEnemyIds])] })
          }
          if (hasTerminalDrop && terminalTarget !== undefined) {
          const retreat = normalize(sub(line.start, position))
          const exit = clampToArena(add(position, scale(retreat, Math.min(1.5, distance(position, line.start)))))
          classObjects = { ...classObjects, returnLine: { start: position, end: exit, ticksRemaining: secondsToTicks(3.4), markedEnemyIds: [], residualEnemyIds: [], kind: 'return-exit' } }
          events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'terminal-drop', effect: '斷端落刃', targetIds: [terminalTarget.id] })
        }
          if (hasReturningRend) {
          // 到線端後向起點回看，僅狹窄線帶中的敵人受回斬，不是免費全圖清場。
          const rendTargetIds = workingEnemies.filter((enemy) => enemy.hp > 0 && distanceToSegment(enemy.position, line.start, line.end) <= 0.42).map((enemy) => enemy.id)
          for (const enemy of workingEnemies) {
            if (rendTargetIds.includes(enemy.id)) damageEnemy(enemy.id, 13)
          }
          if (rendTargetIds.length > 0) events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'returning-rend', effect: '回身割裂', targetIds: rendTargetIds })
        }
          if (hasResidualCollection && line.residualEnemyIds.length > 0) {
          const targetIds = line.residualEnemyIds.filter((id) => workingEnemies.some((enemy) => enemy.id === id && enemy.hp > 0))
          for (const id of targetIds) {
            damageEnemy(id, 14)
            knockback(id, line.start)
          }
          // 回身割裂仍需讀到原本的主線來驗證折返落點，因此只清殘切而不靜默移除線。
          classObjects = { ...classObjects, shadowLine: hasReturningRend ? { ...line, residualEnemyIds: [] } : null }
          if (targetIds.length > 0) events.push({ type: 'classEffectResolved', classId: 'shadowline-hunter', cardId: 'residual-collection', effect: '殘切回收', targetIds })
          events.push({ type: 'resonanceResolved', classId: 'shadowline-hunter', resonance: '線路收割', targetIds })
        }
          eCooldown = secondsToTicks(hasReturningRend ? 7.8 : 7)
          events.push({ type: 'eCast' })
        }
      }
    } else if (hasMark('ember-sacrifice')) {
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
  if (classObjects.forgeNail !== null) {
    const remaining = classObjects.forgeNail.ticksRemaining - 1
    classObjects = { ...classObjects, forgeNail: remaining > 0 ? { ...classObjects.forgeNail, ticksRemaining: remaining } : null }
  }
  if (classObjects.sealNail !== undefined) {
    const remaining = classObjects.sealNail.ticksRemaining - 1
    classObjects = remaining > 0 ? { ...classObjects, sealNail: { ...classObjects.sealNail, ticksRemaining: remaining } } : { ...classObjects, sealNail: undefined }
  }
  if (classObjects.shadowLine !== null) {
    const remaining = classObjects.shadowLine.ticksRemaining - 1
    classObjects = { ...classObjects, shadowLine: remaining > 0 ? { ...classObjects.shadowLine, ticksRemaining: remaining } : null }
  }
  if (classObjects.returnLine !== undefined) {
    const remaining = classObjects.returnLine.ticksRemaining - 1
    classObjects = remaining > 0 ? { ...classObjects, returnLine: { ...classObjects.returnLine, ticksRemaining: remaining } } : { ...classObjects, returnLine: undefined }
  }
  if (classObjects.breachPoint !== undefined) {
    const remaining = classObjects.breachPoint.ticksRemaining - 1
    classObjects = remaining > 0 ? { ...classObjects, breachPoint: { ...classObjects.breachPoint, ticksRemaining: remaining } } : { ...classObjects, breachPoint: undefined }
  }
  if (classObjects.facingLock !== undefined) {
    const remaining = classObjects.facingLock.ticksRemaining - 1
    classObjects = remaining > 0 ? { ...classObjects, facingLock: { ...classObjects.facingLock, ticksRemaining: remaining } } : { ...classObjects, facingLock: undefined }
  }
  if (classObjects.pivotSweep !== undefined) {
    const remaining = classObjects.pivotSweep.ticksRemaining - 1
    classObjects = remaining > 0 ? { ...classObjects, pivotSweep: { ...classObjects.pivotSweep, ticksRemaining: remaining } } : { ...classObjects, pivotSweep: undefined }
  }
  if (classObjects.forgeTether !== undefined) {
    const remaining = classObjects.forgeTether.ticksRemaining - 1
    classObjects = remaining > 0 ? { ...classObjects, forgeTether: { ...classObjects.forgeTether, ticksRemaining: remaining } } : { ...classObjects, forgeTether: undefined }
  }
  if (classObjects.moltenLock !== undefined) {
    const remaining = classObjects.moltenLock.ticksRemaining - 1
    classObjects = remaining > 0 ? { ...classObjects, moltenLock: { ...classObjects.moltenLock, ticksRemaining: remaining } } : { ...classObjects, moltenLock: undefined }
  }
  if (classObjects.crossBorrow !== undefined) {
    const remaining = classObjects.crossBorrow.ticksRemaining - 1
    classObjects = remaining > 0 ? { ...classObjects, crossBorrow: { ...classObjects.crossBorrow, ticksRemaining: remaining } } : { ...classObjects, crossBorrow: undefined }
  }
  if (classObjects.shadowLine?.anchorEnemyId !== undefined) {
    const anchor = workingEnemies.find((enemy) => enemy.id === classObjects.shadowLine!.anchorEnemyId && enemy.hp > 0)
    if (anchor !== undefined) classObjects = { ...classObjects, shadowLine: { ...classObjects.shadowLine, end: anchor.position } }
  }

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
    classObjects,
  }

  return { player: nextPlayer, enemies: workingEnemies, events }
}
