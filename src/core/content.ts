/**
 * 讀取 content/*.json 並做嚴格型別驗證，作為印記／敵人／戰區數值的單一權威來源。
 *
 * 沿用 sim/prototype.ts 的既有慣例（core 不 import sim/，因為 sim/ 是 Balance Engineer
 * 的職權範圍，但兩邊各自對同一份 content/*.json 做一樣嚴格的「缺欄位就在載入當下丟例外」
 * 檢查，而不是靜默回退成某個預設值）：Designer 改 content/marks.json 的數值，這裡與
 * sim 都會立刻反映，不會有「內容正本改了但程式邏輯沒讀到」的漂移風險。
 *
 * 本檔讀取完整十二枚印記、三種一般敵人、灰燼君主、六場遭遇與三戰區回復資料。
 */
import marksJson from '../../content/marks.json'
import enemiesJson from '../../content/enemies.json'
import zonesJson from '../../content/zones.json'
import type { EncounterId, EnemyKind, MarkId } from './types.js'

export type MarkSchool = 'ember' | 'shadow' | 'guard'
export type MarkSlot = 'q' | 'e' | null
export type MarkDef = {
  readonly id: MarkId
  readonly name: string
  readonly school: MarkSchool
  readonly keystone: boolean
  readonly slot: MarkSlot
  readonly requires: MarkId | null
  readonly effect: Readonly<Record<string, unknown>>
}

const rawMarks = marksJson.marks as unknown as MarkDef[]
export const MARKS: readonly MarkDef[] = rawMarks
if (MARKS.length !== 12) throw new Error(`content/marks.json 必須恰好有 12 枚印記，收到 ${MARKS.length}`)

export function markDef(id: MarkId): MarkDef {
  const mark = MARKS.find((candidate) => candidate.id === id)
  if (mark === undefined) throw new Error(`content/marks.json 缺少印記 ${id}`)
  return mark
}

export function markEffectNumber(id: MarkId, field: string): number {
  const value = markDef(id).effect[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`印記 ${id} 的 effect.${field} 缺失或不是合法數字`)
  }
  return value
}

export type EnemyTypeDef = {
  readonly id: EnemyKind
  readonly hp: number
  readonly damage: number
  readonly attackIntervalCycles: number
  readonly telegraphS: number
  readonly moveSpeedUnitsPerS: number
  readonly armorMultiplier: number
}

type RawEnemy = {
  id: EnemyKind
  hp: number
  damage: number
  attack_interval_cycles: number
  telegraph_ms: number
  move_speed_units_per_s: number
  armor_multiplier: number
}
type RawBoss = {
  id: 'ashen-warlord'
  hp: number
  armor_multiplier: number
  phases: readonly { attack_interval_cycles: number; damage: number }[]
}
const rawEnemies = enemiesJson.enemies as RawEnemy[]
const rawBoss = enemiesJson.boss as RawBoss

function enemyFromJson(id: Exclude<EnemyKind, 'ashen-warlord'>): EnemyTypeDef {
  const enemy = rawEnemies.find((candidate) => candidate.id === id)
  if (enemy === undefined) throw new Error(`content/enemies.json 缺少敵人 ${id}`)
  return {
    id,
    hp: enemy.hp,
    damage: enemy.damage,
    attackIntervalCycles: enemy.attack_interval_cycles,
    telegraphS: enemy.telegraph_ms / 1000,
    moveSpeedUnitsPerS: enemy.move_speed_units_per_s,
    armorMultiplier: enemy.armor_multiplier,
  }
}

export const ENEMY_DEFS: Readonly<Record<EnemyKind, EnemyTypeDef>> = {
  'ember-thrall': enemyFromJson('ember-thrall'),
  'shade-skirmisher': enemyFromJson('shade-skirmisher'),
  'bulwark-sentinel': enemyFromJson('bulwark-sentinel'),
  'ashen-warlord': {
    id: 'ashen-warlord', hp: rawBoss.hp, damage: rawBoss.phases[0]?.damage ?? 20,
    attackIntervalCycles: rawBoss.phases[0]?.attack_interval_cycles ?? 2,
    telegraphS: 0.9, moveSpeedUnitsPerS: 2.1, armorMultiplier: rawBoss.armor_multiplier,
  },
}

export const BOSS_PHASES = rawBoss.phases.map((phase) => ({
  attackIntervalCycles: phase.attack_interval_cycles,
  damage: phase.damage,
}))

type RawZone = {
  id: string
  zone_clear_heal_hp: number
  encounters: readonly { id: EncounterId; enemies: readonly { enemy_id: EnemyKind; count: number }[] }[]
}
const rawZones = zonesJson.zones as RawZone[]
export type EncounterDef = {
  readonly id: EncounterId
  readonly enemies: readonly { readonly kind: Exclude<EnemyKind, 'ashen-warlord'>; readonly count: number }[]
}
export const ENCOUNTERS: readonly EncounterDef[] = rawZones.flatMap((zone) => zone.encounters.map((encounter) => ({
  id: encounter.id,
  enemies: encounter.enemies.map((enemy) => {
    if (enemy.enemy_id === 'ashen-warlord') throw new Error('Boss 不可出現在一般遭遇資料')
    return { kind: enemy.enemy_id, count: enemy.count }
  }),
})))
if (ENCOUNTERS.length !== 6) throw new Error(`content/zones.json 必須恰好有六場非 Boss 遭遇，收到 ${ENCOUNTERS.length}`)
export const ZONE_CLEAR_HEALS = rawZones.map((zone) => zone.zone_clear_heal_hp)
export const EMBER_THRALL = ENEMY_DEFS['ember-thrall']
export const SHADE_SKIRMISHER = ENEMY_DEFS['shade-skirmisher']
export const ENCOUNTER_1 = ENCOUNTERS[0]!.enemies
export const ENCOUNTER_2 = ENCOUNTERS[1]!.enemies
export const ZONE_1_CLEAR_HEAL_HP = ZONE_CLEAR_HEALS[0]!

export const EMBER_CORE = {
  placeDistanceUnits: markEffectNumber('ember-core', 'place_distance_units'), armDelayS: markEffectNumber('ember-core', 'arm_delay_s'),
  qCooldownS: markEffectNumber('ember-core', 'q_cooldown_s'), detonateRadiusUnits: markEffectNumber('ember-core', 'detonate_radius_units'),
  detonateDamage: markEffectNumber('ember-core', 'detonate_damage'), postDetonateAttackBonusPct: markEffectNumber('ember-core', 'post_detonate_attack_bonus_pct'),
  postDetonateAttackBonusDurationS: markEffectNumber('ember-core', 'post_detonate_attack_bonus_duration_s'),
} as const
export const PRECISION_AFTERIMAGE = {
  precisionWindowS: markEffectNumber('precision-afterimage', 'precision_window_s'), afterimageDurationS: markEffectNumber('precision-afterimage', 'afterimage_duration_s'),
  maxCharges: markEffectNumber('precision-afterimage', 'max_charges'), eCooldownS: markEffectNumber('precision-afterimage', 'e_cooldown_s'),
  eTeleportDamage: markEffectNumber('precision-afterimage', 'e_teleport_damage'), eTeleportRadiusUnits: markEffectNumber('precision-afterimage', 'e_teleport_radius_units'),
} as const
export const CHARGED_RETALIATION = {
  maxStacks: markEffectNumber('charged-retaliation', 'max_stacks'), dodgeTrailingParryS: markEffectNumber('charged-retaliation', 'dodge_trailing_parry_s'),
  eCooldownS: markEffectNumber('charged-retaliation', 'e_cooldown_s'), damagePerStack: markEffectNumber('charged-retaliation', 'damage_per_stack'),
} as const
