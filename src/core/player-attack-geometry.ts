import { clampToArena } from './arena.js'
import {
  ATTACK_HALF_ANGLES_RAD,
  ATTACK_RANGES_UNITS,
  ATTACK_STROKE_HALF_WIDTH_UNITS,
  COMBO_LUNGE_UNITS,
} from './constants.js'
import { markEffectNumber } from './content.js'
import type { EnemyKind, MarkId } from './types.js'
import { add, distance, normalize, scale, sub, type Vector2 } from './vector.js'

export type PlayerAttackVariant = 'base' | 'cracking-flame' | 'pursuit' | 'bulwark'

/**
 * 一次普攻主斬的權威幾何快照。
 *
 * `range` 是劍光中心線的 physical blade reach；有效碰撞還會把
 * `strokeHalfWidthUnits` 與目標依 kind 決定的圓形 hurtbox 一起納入。
 * 這讓可見刃帶外緣落在碰撞 envelope 內，而不是把 sprite 中心點硬塞進扇形。
 */
export type PlayerAttackGeometry = {
  readonly origin: Vector2
  readonly facing: Vector2
  readonly range: number
  readonly halfAngle: number
  readonly hitIndex: 1 | 2 | 3
  readonly strokeHalfWidthUnits: number
  readonly targetHurtboxRule: 'enemy-circle-by-kind'
  readonly variant: PlayerAttackVariant
}

export type CreatePlayerAttackGeometryInput = {
  /** active 起點向前推進之前的玩家腳點。 */
  readonly position: Vector2
  readonly facing: Vector2
  readonly hitIndex: 1 | 2 | 3
  readonly selectedMarks: readonly MarkId[]
  readonly pursuitActive: boolean
  readonly guardStacks: number
}

const ENEMY_HURTBOX_RADIUS: Readonly<Record<EnemyKind, number>> = {
  'ember-thrall': 0.5,
  'shade-skirmisher': 0.42,
  'bulwark-sentinel': 0.72,
  'ashen-warlord': 1,
}

export function enemyHurtboxRadius(kind: EnemyKind): number {
  return ENEMY_HURTBOX_RADIUS[kind]
}

export function createPlayerAttackGeometry(input: CreatePlayerAttackGeometryInput): PlayerAttackGeometry {
  const facing = normalize(input.facing)
  const direction = facing.x === 0 && facing.y === 0 ? { x: 1, y: 0 } : facing
  const origin = clampToArena(add(input.position, scale(direction, COMBO_LUNGE_UNITS[input.hitIndex - 1]!)))
  const cracking = input.hitIndex === 3 && input.selectedMarks.includes('cracking-flame-combo')
  const pursuit = input.hitIndex === 1 && input.pursuitActive && input.selectedMarks.includes('pursuit-strike')
  const bulwark = input.hitIndex === 1 && input.guardStacks >= 2 && input.selectedMarks.includes('bulwark-chain')

  const variant: PlayerAttackVariant = cracking ? 'cracking-flame' : pursuit ? 'pursuit' : bulwark ? 'bulwark' : 'base'
  const range = cracking
    ? markEffectNumber('cracking-flame-combo', 'cone_range_units')
    : pursuit
      ? markEffectNumber('pursuit-strike', 'lunge_distance_units')
      : ATTACK_RANGES_UNITS[input.hitIndex - 1]! * (bulwark ? 1 + markEffectNumber('bulwark-chain', 'range_bonus_pct') / 100 : 1)
  const halfAngle = cracking ? Math.PI / 3 : pursuit ? 0.2 : ATTACK_HALF_ANGLES_RAD[input.hitIndex - 1]!

  return {
    origin,
    facing: direction,
    range,
    halfAngle,
    hitIndex: input.hitIndex,
    strokeHalfWidthUnits: ATTACK_STROKE_HALF_WIDTH_UNITS[input.hitIndex - 1]!,
    targetHurtboxRule: 'enemy-circle-by-kind',
    variant,
  }
}

function distanceToSegment(point: Vector2, start: Vector2, end: Vector2): number {
  const segment = sub(end, start)
  const lengthSquared = segment.x * segment.x + segment.y * segment.y
  if (lengthSquared === 0) return distance(point, start)
  const offset = sub(point, start)
  const projection = Math.max(0, Math.min(1, (offset.x * segment.x + offset.y * segment.y) / lengthSquared))
  return distance(point, add(start, scale(segment, projection)))
}

/** 精確處理扇形徑向外緣與兩條角度側邊，不退化成單純 `range + radius`。 */
export function circleIntersectsSector(
  center: Vector2,
  circleRadius: number,
  origin: Vector2,
  facing: Vector2,
  sectorRange: number,
  halfAngle: number,
): boolean {
  const offset = sub(center, origin)
  const centerDistance = distance(center, origin)
  if (centerDistance <= circleRadius) return true
  if (centerDistance - circleRadius > sectorRange) return false

  const direction = normalize(facing)
  const angleToCenter = Math.atan2(offset.y, offset.x)
  const facingAngle = Math.atan2(direction.y, direction.x)
  const angleDelta = Math.abs(Math.atan2(Math.sin(angleToCenter - facingAngle), Math.cos(angleToCenter - facingAngle)))
  if (angleDelta <= halfAngle) return true

  const left = add(origin, scale({ x: Math.cos(facingAngle - halfAngle), y: Math.sin(facingAngle - halfAngle) }, sectorRange))
  const right = add(origin, scale({ x: Math.cos(facingAngle + halfAngle), y: Math.sin(facingAngle + halfAngle) }, sectorRange))
  return distanceToSegment(center, origin, left) <= circleRadius || distanceToSegment(center, origin, right) <= circleRadius
}

export function playerAttackHitsCircle(geometry: PlayerAttackGeometry, targetCenter: Vector2, targetHurtboxRadius: number): boolean {
  return circleIntersectsSector(
    targetCenter,
    targetHurtboxRadius + geometry.strokeHalfWidthUnits,
    geometry.origin,
    geometry.facing,
    geometry.range,
    geometry.halfAngle,
  )
}
