/**
 * 讀取 content/*.json 並做嚴格型別驗證，作為印記／敵人／戰區數值的單一權威來源。
 *
 * 沿用 sim/prototype.ts 的既有慣例（core 不 import sim/，因為 sim/ 是 Balance Engineer
 * 的職權範圍，但兩邊各自對同一份 content/*.json 做一樣嚴格的「缺欄位就在載入當下丟例外」
 * 檢查，而不是靜默回退成某個預設值）：Designer 改 content/marks.json 的數值，這裡與
 * sim 都會立刻反映，不會有「內容正本改了但程式邏輯沒讀到」的漂移風險。
 *
 * 本檔只讀取 Vertical Slice 範圍內用得到的三枚 keystone 印記與兩種敵人；其餘 9 枚印記與
 * 甲衛／Boss 不在本切片範圍，未讀取。
 */
import marksJson from '../../content/marks.json'
import enemiesJson from '../../content/enemies.json'
import zonesJson from '../../content/zones.json'

type MarkContent = {
  id: string
  effect: Record<string, unknown>
}

type EnemyContent = {
  id: string
  hp: number
  damage: number
  attack_interval_cycles: number
  telegraph_ms: number
  move_speed_units_per_s: number
  armor_multiplier: number
}

type ZoneEncounterEnemyRef = { enemy_id: string; count: number }
type ZoneEncounterContent = { id: string; enemies: ZoneEncounterEnemyRef[] }
type ZoneContent = {
  id: string
  encounters: ZoneEncounterContent[]
  zone_clear_heal_hp: number
}

const marks = marksJson.marks as MarkContent[]
const enemies = enemiesJson.enemies as EnemyContent[]
const zones = zonesJson.zones as ZoneContent[]

function findMark(id: string): MarkContent {
  const mark = marks.find((candidate) => candidate.id === id)
  if (mark === undefined) throw new Error(`content/marks.json 缺少印記 ${id}`)
  return mark
}

function effectNumber(markId: string, field: string): number {
  const value = findMark(markId).effect[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`印記 ${markId} 的 effect.${field} 缺失或不是合法數字，core 無法啟動`)
  }
  return value
}

function findEnemy(id: string): EnemyContent {
  const enemy = enemies.find((candidate) => candidate.id === id)
  if (enemy === undefined) throw new Error(`content/enemies.json 缺少敵人 ${id}`)
  return enemy
}

export type EnemyTypeDef = {
  readonly id: 'ember-thrall' | 'shade-skirmisher'
  readonly hp: number
  readonly damage: number
  readonly attackIntervalCycles: number
  readonly telegraphS: number
  readonly moveSpeedUnitsPerS: number
  readonly armorMultiplier: number
}

function toEnemyTypeDef(id: 'ember-thrall' | 'shade-skirmisher'): EnemyTypeDef {
  const enemy = findEnemy(id)
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

export const EMBER_THRALL: EnemyTypeDef = toEnemyTypeDef('ember-thrall')
export const SHADE_SKIRMISHER: EnemyTypeDef = toEnemyTypeDef('shade-skirmisher')

// --- 餘燼核心（keystone，裂焰）---------------------------------------------
export const EMBER_CORE = {
  placeDistanceUnits: effectNumber('ember-core', 'place_distance_units'),
  armDelayS: effectNumber('ember-core', 'arm_delay_s'),
  qCooldownS: effectNumber('ember-core', 'q_cooldown_s'),
  detonateRadiusUnits: effectNumber('ember-core', 'detonate_radius_units'),
  detonateDamage: effectNumber('ember-core', 'detonate_damage'),
  postDetonateAttackBonusPct: effectNumber('ember-core', 'post_detonate_attack_bonus_pct'),
  postDetonateAttackBonusDurationS: effectNumber(
    'ember-core',
    'post_detonate_attack_bonus_duration_s',
  ),
} as const

// --- 精準殘影（keystone，影步）---------------------------------------------
export const PRECISION_AFTERIMAGE = {
  // 精準閃避窗口：design/spec.md〈玩家角色〉描述為「所有玩家一律生效」的通用定義
  // （閃避在敵方攻擊判定生效前這段時間內完成即為精準），這裡直接讀取此印記自己的
  // trigger 描述所附帶的欄位值 0.12 秒作為引擎唯一的權威數字，供全部閃避判定使用，
  // 不限於選了這枚印記才生效——sim/prototype.ts 的抽象機率模型把它拆成兩個獨立近似值
  // （PRECISION_WINDOW_OFFSET 機率偏移 vs 這裡的秒數），是因為那個模型沒有連續時間可用；
  // 本引擎有真正的 tick 時間軸，兩者其實是同一件事，因此只需要這一份數字。
  precisionWindowS: effectNumber('precision-afterimage', 'precision_window_s'),
  afterimageDurationS: effectNumber('precision-afterimage', 'afterimage_duration_s'),
  maxCharges: effectNumber('precision-afterimage', 'max_charges'),
  eCooldownS: effectNumber('precision-afterimage', 'e_cooldown_s'),
  eTeleportDamage: effectNumber('precision-afterimage', 'e_teleport_damage'),
  eTeleportRadiusUnits: effectNumber('precision-afterimage', 'e_teleport_radius_units'),
} as const

// --- 蓄能反震（keystone，守勢）---------------------------------------------
export const CHARGED_RETALIATION = {
  maxStacks: effectNumber('charged-retaliation', 'max_stacks'),
  // 閃避尾段格擋判定秒數：sim/prototype.ts 因為只有離散「每次判定各自擲骰」的模型，
  // 被迫把這個連續時間窗口近似成一個保守的機率值（3%，而非字面換算的 13.6%），並在
  // design/spec.md〈模擬近似落差揭露〉明確承認這是「模型把連續時間窗口離散化成單次
  // 判定機率時必然損失資訊」的已知落差。本引擎有真正的連續 tick 時間軸，不需要這個
  // 近似——直接用這 0.15 秒本身當一個真實的格擋判定窗（見 src/core/combat.ts 的
  // resolveEnemyExecute()），這是本切片對該落差的實質解決，不是繞過。
  dodgeTrailingParryS: effectNumber('charged-retaliation', 'dodge_trailing_parry_s'),
  eCooldownS: effectNumber('charged-retaliation', 'e_cooldown_s'),
  damagePerStack: effectNumber('charged-retaliation', 'damage_per_stack'),
} as const

// --- 戰區一（design/spec.md 範圍：一個戰區、兩場遭遇戰）---------------------
const zoneOneLookup = zones.find((zone) => zone.id === 'zone-1')
if (zoneOneLookup === undefined) throw new Error('content/zones.json 缺少 zone-1')
const zoneOne: ZoneContent = zoneOneLookup

function findEncounter(id: string): ZoneEncounterContent {
  const encounter = zoneOne.encounters.find((candidate) => candidate.id === id)
  if (encounter === undefined) throw new Error(`content/zones.json 的 zone-1 缺少遭遇戰 ${id}`)
  return encounter
}

export type EncounterEnemyRef = {
  readonly kind: 'ember-thrall' | 'shade-skirmisher'
  readonly count: number
}

function toEncounterRefs(encounter: ZoneEncounterContent): readonly EncounterEnemyRef[] {
  return encounter.enemies.map((ref) => {
    if (ref.enemy_id !== 'ember-thrall' && ref.enemy_id !== 'shade-skirmisher') {
      throw new Error(`本切片範圍外的敵人：${ref.enemy_id}（甲衛與 Boss 不在 Vertical Slice 範圍）`)
    }
    return { kind: ref.enemy_id, count: ref.count }
  })
}

export const ENCOUNTER_1: readonly EncounterEnemyRef[] = toEncounterRefs(findEncounter('z1-e1'))
export const ENCOUNTER_2: readonly EncounterEnemyRef[] = toEncounterRefs(findEncounter('z1-e2'))
export const ZONE_1_CLEAR_HEAL_HP = zoneOne.zone_clear_heal_hp
