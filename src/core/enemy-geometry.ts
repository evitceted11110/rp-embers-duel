import {
  BOSS_CHARGE_HALF_WIDTH_UNITS,
  BOSS_CHARGE_LENGTH_UNITS,
  BOSS_SMASH_FORWARD_OFFSET_UNITS,
  BOSS_SMASH_RADIUS_UNITS,
  BOSS_SUMMON_LATERAL_OFFSET_UNITS,
  BOSS_SUMMON_RADIUS_UNITS,
  BULWARK_CONE_HALF_ANGLE_RAD,
  BULWARK_CONE_RADIUS_UNITS,
  SKIRMISHER_LANE_HALF_WIDTH_UNITS,
  SKIRMISHER_LANE_LENGTH_UNITS,
  THRALL_CONE_HALF_ANGLE_RAD,
  THRALL_CONE_RADIUS_UNITS,
} from './constants.js'
import type { BossAttackPattern, EnemyAttackGeometry, EnemyKind } from './types.js'
import { add, distance, normalize, scale, sub, type Vector2 } from './vector.js'

function lockedDirection(origin: Vector2, target: Vector2): Vector2 {
  const direction = normalize(sub(target, origin))
  return direction.x === 0 && direction.y === 0 ? { x: 1, y: 0 } : direction
}

export function createEnemyAttackGeometry(
  kind: EnemyKind,
  bossAttack: BossAttackPattern | null,
  origin: Vector2,
  target: Vector2,
): EnemyAttackGeometry {
  const direction = lockedDirection(origin, target)
  if (kind === 'ember-thrall') {
    return { kind: 'cone', origin, direction, radius: THRALL_CONE_RADIUS_UNITS, halfAngleRad: THRALL_CONE_HALF_ANGLE_RAD }
  }
  if (kind === 'shade-skirmisher') {
    return { kind: 'lane', origin, direction, length: SKIRMISHER_LANE_LENGTH_UNITS, halfWidth: SKIRMISHER_LANE_HALF_WIDTH_UNITS }
  }
  if (kind === 'bulwark-sentinel') {
    return { kind: 'cone', origin, direction, radius: BULWARK_CONE_RADIUS_UNITS, halfAngleRad: BULWARK_CONE_HALF_ANGLE_RAD }
  }
  if (bossAttack === 'charge') {
    return { kind: 'lane', origin, direction, length: BOSS_CHARGE_LENGTH_UNITS, halfWidth: BOSS_CHARGE_HALF_WIDTH_UNITS }
  }
  if (bossAttack === 'summon') {
    const perpendicular = { x: -direction.y, y: direction.x }
    return {
      kind: 'summon',
      circles: [
        { center: add(origin, scale(perpendicular, BOSS_SUMMON_LATERAL_OFFSET_UNITS)), radius: BOSS_SUMMON_RADIUS_UNITS },
        { center: add(origin, scale(perpendicular, -BOSS_SUMMON_LATERAL_OFFSET_UNITS)), radius: BOSS_SUMMON_RADIUS_UNITS },
      ],
    }
  }
  return {
    kind: 'circle',
    center: add(origin, scale(direction, BOSS_SMASH_FORWARD_OFFSET_UNITS)),
    radius: BOSS_SMASH_RADIUS_UNITS,
  }
}

export function enemyGeometryContains(geometry: EnemyAttackGeometry, point: Vector2): boolean {
  if (geometry.kind === 'circle') return distance(geometry.center, point) <= geometry.radius
  if (geometry.kind === 'summon') return false
  const offset = sub(point, geometry.origin)
  const forward = offset.x * geometry.direction.x + offset.y * geometry.direction.y
  if (geometry.kind === 'lane') {
    if (forward < 0 || forward > geometry.length) return false
    const lateral = Math.abs(offset.x * -geometry.direction.y + offset.y * geometry.direction.x)
    return lateral <= geometry.halfWidth
  }
  const dist = Math.hypot(offset.x, offset.y)
  if (dist > geometry.radius) return false
  if (dist === 0) return true
  return forward / dist >= Math.cos(geometry.halfAngleRad)
}
