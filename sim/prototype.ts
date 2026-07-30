import {
  frequency,
  numericStats,
  rate,
  simulate,
  type NumericStats,
} from '@rogue-paradise/sim'
import { createRng, type Rng } from '@rogue-paradise/rng'
import marksJson from '../content/marks.json'
import enemiesJson from '../content/enemies.json'
import zonesJson from '../content/zones.json'

// ---------------------------------------------------------------------------
// 拋棄式極簡規則原型：僅供 Balance Engineer 在 Gate 2 前跑模擬。
// 不含表現層／渲染；戰鬥以「連擊循環」(CYCLE_SECONDS) 為離散時間單位近似。
// ---------------------------------------------------------------------------

export type SchoolId = 'ember' | 'shadow' | 'guard'
export type MarkId =
  | 'ember-core'
  | 'cracking-flame-combo'
  | 'twin-core-resonance'
  | 'ember-sacrifice'
  | 'precision-afterimage'
  | 'pursuit-strike'
  | 'phantom-reset'
  | 'shadow-harvest'
  | 'charged-retaliation'
  | 'aftershock-shield'
  | 'mirror-plating'
  | 'bulwark-chain'
export type ActionName = 'attack' | 'dodge' | 'q' | 'e'
export type SlotName = 'q' | 'e'
export type EnemyId = 'ember-thrall' | 'shade-skirmisher' | 'bulwark-sentinel'

type MarkDef = {
  id: MarkId
  name: string
  school: SchoolId
  keystone: boolean
  changes_actions: ActionName[]
  slot: SlotName | null
  requires: MarkId | null
  trigger: string
  effect: Record<string, unknown>
  decision_change: string
  visible_feedback: string
  design_rationale: string
  differentiation_note?: string
}

type EnemyDef = {
  id: EnemyId
  name: string
  role: string
  hp: number
  damage: number
  attack_interval_cycles: number
  telegraph_ms: number
  telegraph_tell: string
  move_speed_units_per_s: number
  dodge_difficulty_modifier: number
  armor_multiplier: number
  design_rationale: string
}

type BossPhase = {
  id: string
  hp_threshold: number
  attack_interval_cycles: number
  damage: number
  dodge_difficulty_modifier: number
  description: string
}

type BossDef = {
  id: string
  name: string
  hp: number
  armor_multiplier: number
  telegraph_tell: string
  phases: BossPhase[]
  design_rationale: string
}

type ZoneEncounterEnemyRef = { enemy_id: EnemyId; count: number }
type ZoneEncounter = {
  id: string
  enemies: ZoneEncounterEnemyRef[]
  target_duration_s: number
  note: string
}
type Zone = {
  id: string
  name: string
  order: number
  encounters: ZoneEncounter[]
  zone_clear_heal_hp: number
  boss_id?: string
  boss_target_duration_s?: number
}

const marks = marksJson.marks as MarkDef[]
const enemies = enemiesJson.enemies as EnemyDef[]
const boss = enemiesJson.boss as BossDef
const zones = zonesJson.zones as Zone[]
const tutorialOverheadS = zonesJson.tutorial_overhead_s
const draftOverheadS = zonesJson.draft_overhead_s
const bossIntroOutroS = zonesJson.boss_intro_outro_s
const encounterTransitionS = zonesJson.encounter_transition_s

const markIds = marks.map((mark) => mark.id)
const schoolIds: readonly SchoolId[] = ['ember', 'shadow', 'guard']

function getMarkEffect(id: MarkId): Record<string, unknown> {
  return getMark(id).effect
}

// 嚴格讀取印記 effect 欄位：缺欄位或型別錯誤直接丟例外（模組載入時就會失敗），
// 而不是靜默回退成某個預設值——這是任務 A 要修的結構性缺陷之一：
// 過去 content/marks.json 的數值即使漂移或缺漏，模擬完全不會發現。
function effectNumber(id: MarkId, field: string): number {
  const value = getMarkEffect(id)[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`印記 ${id} 的 effect.${field} 缺失或不是合法數字，模擬無法啟動`)
  }
  return value
}

function effectPercentAsFraction(id: MarkId, field: string): number {
  return effectNumber(id, field) / 100
}

// 秒數換算成「連擊循環數」的整數近似：本原型把時間離散化成 CYCLE_SECONDS 為單位，
// 少數印記欄位（例如攻擊加成持續時間）是以連續秒數設計，但模型內部用循環計數追蹤，
// 故在模組載入時一次性換算並四捨五入到最接近的整數循環、下限為 1
// （0 循環等同於完全沒有加成，不會是任何一枚印記的設計意圖）。
function effectSecondsToCycles(id: MarkId, field: string): number {
  const seconds = effectNumber(id, field)
  return Math.max(1, Math.round(seconds / CYCLE_SECONDS))
}

// --- 戰鬥常數 -----------------------------------------------------------
//
// 以下這組常數刻意保留為原型常數、不從 content/*.json 讀取，因為它們不屬於
// 「印記改寫的內容數值」，而是模擬模型本身的離散化假設或玩家基礎數值——
// 目前沒有任何 content 檔案描述玩家基礎版 Q/E/生命/連擊傷害或模擬的時間顆粒度，
// 這些數字的出處是 design/spec.md〈玩家角色〉一節的設計意圖，不是被印記覆寫的欄位。

// 一次完整連擊約 1.1 秒，模擬中作為離散時間單位（design/spec.md〈玩家角色〉三段連擊）。
const CYCLE_SECONDS = 1.1
// 玩家生命（design/spec.md〈玩家角色〉：220）。
const PLAYER_MAX_HP = 220
// 三段連擊基礎傷害合計 8(第一段)+10(第二段)+16(第三段)（design/spec.md〈玩家角色〉）。
const PLAYER_COMBO_BASE_DAMAGE = 34
// 模擬用的普攻空揮機率，純模型雜訊，spec.md 未給定精確數值。
const WHIFF_CHANCE = 0.08
// 同時預兆敵人數的閃避難度懲罰，見 design/spec.md〈玩家角色〉閃避成功率公式。
const CONCURRENCY_PENALTY_PER_EXTRA = 0.05
// 精準閃避窗口偏移量，見 design/spec.md〈玩家角色〉：低於「成功率−0.30」視為精準閃避。
// 對所有玩家一律生效（供影步系印記讀取精準閃避事件），與 marks.json 個別印記描述性的
// precision_window_s（例如精準殘影的 0.12 秒，僅為文案用途）是兩個獨立的量，不應混用。
const PRECISION_WINDOW_OFFSET = 0.3
// 無限迴圈安全閥，純工程防呆，非平衡數值。
const SAFETY_CAP_CYCLES = 400

// 玩家 Q/E 基礎版數值（design/spec.md〈玩家角色〉），沒有被任何印記改寫時的預設行為。
const BASE_Q_COOLDOWN_S = 6.0
const BASE_Q_DAMAGE = 12
const BASE_E_COOLDOWN_S = 12.0
const BASE_E_DAMAGE = 18
const BASE_E_SECOND_TARGET_DAMAGE = 9

// --- 以下全部從 content/marks.json 動態讀取（任務 A 重構核心）---------------
//
// 過去這裡是一組鏡射 JSON 數值的硬編碼常數，Designer 改 content/marks.json
// 對模擬結果毫無影響。現在改為在模組載入時直接從印記的 effect 物件讀取，
// 若欄位缺失或型別錯誤會在載入當下立即丟出例外。

const EMBER_CORE_ARM_DELAY_S = effectNumber('ember-core', 'arm_delay_s')
const EMBER_CORE_Q_COOLDOWN_S = effectNumber('ember-core', 'q_cooldown_s')
const EMBER_CORE_DETONATE_DAMAGE = effectNumber('ember-core', 'detonate_damage')
const EMBER_CORE_BUFF_PCT = effectNumber('ember-core', 'post_detonate_attack_bonus_pct')
// 修正一處常數與 JSON 漂移：舊常數把 post_detonate_attack_bonus_duration_s(1.5s)
// 直接寫死成 2 個連擊循環（=2.2s，比設計值多 47%）。改為從欄位換算。
const EMBER_CORE_BUFF_DURATION_CYCLES = effectSecondsToCycles(
  'ember-core',
  'post_detonate_attack_bonus_duration_s',
)

const TWIN_CORE_SECOND_DAMAGE = effectNumber('twin-core-resonance', 'second_core_damage')
const TWIN_CORE_CHAIN_CHANCE = effectPercentAsFraction('twin-core-resonance', 'chain_probability_pct')
// 同上：舊常數把 extended_attack_bonus_duration_s(2.2s＝整數 2 個循環) 寫死成 3 個循環。
const TWIN_CORE_BUFF_DURATION_CYCLES = effectSecondsToCycles(
  'twin-core-resonance',
  'extended_attack_bonus_duration_s',
)
// 任務 C：雙核共振自己的 Q 冷卻——選取後大幅縮短 Q 冷卻，讓雙核有機會在被引爆前
// 一起武裝完成（根因見 sim/reports/2026-07-30-gate-2-feasibility.md〈印記健康度〉）。
const TWIN_CORE_Q_COOLDOWN_S = effectNumber('twin-core-resonance', 'q_cooldown_s')

const EMBER_SACRIFICE_E_COOLDOWN_S = effectNumber('ember-sacrifice', 'e_cooldown_s')

const SHADOW_E_COOLDOWN_S = effectNumber('precision-afterimage', 'e_cooldown_s')
const SHADOW_E_DAMAGE = effectNumber('precision-afterimage', 'e_teleport_damage')
const MAX_SHADOW_STACKS = effectNumber('precision-afterimage', 'max_charges')
// 已知未建模欄位：precision-afterimage.effect.afterimage_duration_s（殘影 1.6 秒後
// 應該自動到期消失）目前完全沒有被模擬讀取或實作——shadowStacks 只靠 E／Q 消耗，
// 不會因時間經過而過期。這代表模擬可能高估了影步玩家能囤積的殘影層數／E 可用頻率。
// 本輪未建模，因為模型目前沒有追蹤「每個殘影各自的存續時間」的資料結構，屬於比較
// 大的模型改動；已列入 design/spec.md 的已知限制，Gate 3 前不得視為已驗證的機制。
const SHADOW_Q_COOLDOWN_S = effectNumber('shadow-harvest', 'q_cooldown_s')
const SHADOW_Q_DAMAGE_PER_STACK = effectNumber('shadow-harvest', 'damage_per_afterimage')
// 突進追擊的加成是「改寫後傷害 − 基礎第一段傷害」，兩者皆為 JSON 欄位；
// 模型把整段連擊視為單一聚合傷害值（不拆分段數），故以「+加成」的形式疊加，
// 而非直接取代整段傷害。
const PURSUIT_STRIKE_BONUS =
  effectNumber('pursuit-strike', 'damage') - effectNumber('pursuit-strike', 'base_first_hit_damage')
// 虛影重置：目前模擬把「每次成功閃避都要通過同一個機率骰」離散化為單一次成功率判定，
// 沒有連續時間的閃避冷卻計時器可供「冷卻歸零」直接作用；因此用「下一次判定的成功率
// 加成」近似「精準閃避後可以再閃一次幾乎必過」的手感。0.06 沒有對應的 content 欄位
// （marks.json 的 phantom-reset.effect 只描述冷卐秒數，未描述成功率），是模擬模型
// 對這個簡化必須自行決定的近似值，不屬於內容數值，因此保留為原型常數。
const PHANTOM_RESET_SUCCESS_BONUS = 0.06

const GUARD_E_COOLDOWN_S = effectNumber('charged-retaliation', 'e_cooldown_s')
const GUARD_E_DAMAGE_PER_STACK = effectNumber('charged-retaliation', 'damage_per_stack')
const MAX_GUARD_STACKS = effectNumber('charged-retaliation', 'max_stacks')
// 任務 B：閃避尾段格擋判定（dodge_trailing_parry_s＝0.15 秒）。這是模擬需要自行決定
// 換算方式的少數欄位之一：把秒數直接除以 CYCLE_SECONDS（如 EMBER_CORE_BUFF_DURATION_CYCLES
// 採用的換算慣例）會得到 ≈13.6%，但敏感度測試（同 seed 30,000 局，見
// design/spec.md／sim/reports）顯示這個量級對離散化的「每次判定各自獨立擲骰」模型過強：
// 單獨把它從 0 調到 13.6% 就讓守勢勝率從 ~46% 推到 ~60%（+14pp），遠超 Gate 2 的
// 流派差距門檻。因此改用一個經同一組敏感度測試校準過、明顯保守的固定值，
// 讓格擋尾段「存在且可被 blockedHits 觀測到」但不成為守勢的主要防禦來源
// （主要保底防禦仍是下方餘波護盾的『E 後必格擋』）。
const CHARGED_RETALIATION_PARRY_CHANCE = 0.03

// 任務 C 修訂（Studio Head 2026-07-30 裁決，還原設計）：餘波護盾的低觸發率根因
// 是原型的自動施放 AI 缺乏「屏住層數」這個策略選項（一律層數 >0、冷卻好就自動
// 施放 E 並清空層數），不是印記設計本身自我衝突——真人玩家可以自主選擇「屏住 3 層
// 換格擋保底」或「立即花掉層數換傷害」，這正是這枚印記要創造的操作張力。
// 因此還原為原始設計：滿層才必定格擋，仍與 charged-retaliation 的 MAX_GUARD_STACKS
// 共用「層數」這個資源（AFTERSHOCK_SHIELD_REQUIRED_STACKS 為獨立欄位，數值上與
// max_stacks 相同但概念上不再耦合，方便未來各自調整）。此印記已知在本原型的簡化
// AI 下無法驗證真實效用，登記在 sim/report.ts 的 KNOWN_PROTOTYPE_AI_LIMITATIONS
// 與 sim/prototype.test.ts 的 KNOWN_STRUCTURALLY_NARROW_MARKS，不視為廢物選項。
const AFTERSHOCK_SHIELD_REQUIRED_STACKS = effectNumber('aftershock-shield', 'required_stacks')
const GUARD_OVERFLOW_BONUS_PCT = effectNumber('aftershock-shield', 'one_time_next_e_bonus_pct')

const MIRROR_PLATING_Q_COOLDOWN_S = effectNumber('mirror-plating', 'q_cooldown_s')
const MIRROR_PLATING_REFLECT_DAMAGE = effectNumber('mirror-plating', 'reflect_damage')
const MIRROR_PLATING_GRANTS_STACK = effectNumber('mirror-plating', 'grants_stack')

const BULWARK_CHAIN_MIN_STACKS = effectNumber('bulwark-chain', 'required_stacks')
const BULWARK_CHAIN_SPLASH_DAMAGE = effectNumber('bulwark-chain', 'secondary_splash_damage')
// 「連段不重置」是操作節奏的改變（這次攻擊視為接住完整連段效率），不是額外傷害數值——
// 見下方 resolveEncounter 對 efficiency 的處理，以及 content/marks.json 的 design_rationale
// 對這處實作缺陷（曾誤植為「+8 額外傷害」）的修正說明。
const BULWARK_CHAIN_NO_RESET_CHANCE = effectPercentAsFraction('bulwark-chain', 'combo_no_reset_chance_pct')

// 裂焰連擊：第三段從基礎傷害升級的差額，以及命中第二目標的濺射傷害，皆為 JSON 欄位。
const CRACKING_FLAME_FINISHER_BONUS =
  effectNumber('cracking-flame-combo', 'damage') -
  effectNumber('cracking-flame-combo', 'base_third_hit_damage')
const CRACKING_FLAME_SPLASH_DAMAGE = effectNumber('cracking-flame-combo', 'secondary_splash_damage')

// 每場非 Boss 遭遇戰之間的走位／換場／拾取節奏（Vertical Slice 才會有實際場景轉換，
// 此處以固定秒數近似，讓單局總時長估計不只靠戰鬥輸出堆出來）。讀自 content/zones.json
// 的 encounter_transition_s（與 tutorial_overhead_s 等同層級的節奏常數）。
const ENCOUNTER_TRANSITION_S = encounterTransitionS

function getMark(id: MarkId): MarkDef {
  const mark = marks.find((candidate) => candidate.id === id)
  if (mark === undefined) throw new Error(`未知印記：${id}`)
  return mark
}

function getEnemy(id: EnemyId): EnemyDef {
  const enemy = enemies.find((candidate) => candidate.id === id)
  if (enemy === undefined) throw new Error(`未知敵人：${id}`)
  return enemy
}

function has(selected: readonly MarkId[], id: MarkId): boolean {
  return selected.includes(id)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ---------------------------------------------------------------------------
// 內容驗證
// ---------------------------------------------------------------------------

// 任務 A 新增：每一枚印記的 effect 物件裡，被 resolveEncounter／頂層常數實際讀取的
// 欄位清單與型別。過去 content/marks.json 的數值即使少一個欄位，模擬也不會發現
// （因為根本沒有讀取，只有鏡射的硬編碼常數）；現在這些欄位改由模組載入時的
// effectNumber() 直接讀取，缺欄位會直接拋例外讓模擬無法啟動，這裡則是讓
// validateContent() 也能用非拋例外的方式列出同一組缺陷，供測試／報告工具檢查。
const REQUIRED_EFFECT_FIELDS: ReadonlyArray<{
  markId: MarkId
  field: string
  type: 'number'
}> = [
  { markId: 'ember-core', field: 'arm_delay_s', type: 'number' },
  { markId: 'ember-core', field: 'q_cooldown_s', type: 'number' },
  { markId: 'ember-core', field: 'detonate_damage', type: 'number' },
  { markId: 'ember-core', field: 'post_detonate_attack_bonus_pct', type: 'number' },
  { markId: 'ember-core', field: 'post_detonate_attack_bonus_duration_s', type: 'number' },
  { markId: 'cracking-flame-combo', field: 'damage', type: 'number' },
  { markId: 'cracking-flame-combo', field: 'base_third_hit_damage', type: 'number' },
  { markId: 'cracking-flame-combo', field: 'secondary_splash_damage', type: 'number' },
  { markId: 'twin-core-resonance', field: 'second_core_damage', type: 'number' },
  { markId: 'twin-core-resonance', field: 'chain_probability_pct', type: 'number' },
  { markId: 'twin-core-resonance', field: 'extended_attack_bonus_duration_s', type: 'number' },
  { markId: 'twin-core-resonance', field: 'q_cooldown_s', type: 'number' },
  { markId: 'ember-sacrifice', field: 'e_cooldown_s', type: 'number' },
  { markId: 'precision-afterimage', field: 'e_cooldown_s', type: 'number' },
  { markId: 'precision-afterimage', field: 'e_teleport_damage', type: 'number' },
  { markId: 'precision-afterimage', field: 'max_charges', type: 'number' },
  { markId: 'pursuit-strike', field: 'damage', type: 'number' },
  { markId: 'pursuit-strike', field: 'base_first_hit_damage', type: 'number' },
  { markId: 'shadow-harvest', field: 'q_cooldown_s', type: 'number' },
  { markId: 'shadow-harvest', field: 'damage_per_afterimage', type: 'number' },
  { markId: 'charged-retaliation', field: 'e_cooldown_s', type: 'number' },
  { markId: 'charged-retaliation', field: 'damage_per_stack', type: 'number' },
  { markId: 'charged-retaliation', field: 'max_stacks', type: 'number' },
  { markId: 'charged-retaliation', field: 'dodge_trailing_parry_s', type: 'number' },
  { markId: 'aftershock-shield', field: 'required_stacks', type: 'number' },
  { markId: 'aftershock-shield', field: 'one_time_next_e_bonus_pct', type: 'number' },
  { markId: 'mirror-plating', field: 'q_cooldown_s', type: 'number' },
  { markId: 'mirror-plating', field: 'reflect_damage', type: 'number' },
  { markId: 'mirror-plating', field: 'grants_stack', type: 'number' },
  { markId: 'bulwark-chain', field: 'required_stacks', type: 'number' },
  { markId: 'bulwark-chain', field: 'secondary_splash_damage', type: 'number' },
  { markId: 'bulwark-chain', field: 'combo_no_reset_chance_pct', type: 'number' },
]

function validateRequiredEffectFields(): string[] {
  const violations: string[] = []
  for (const spec of REQUIRED_EFFECT_FIELDS) {
    const mark = marks.find((candidate) => candidate.id === spec.markId)
    if (mark === undefined) continue // 印記本身缺失已由下方的印記數量／id 檢查涵蓋
    const value = mark.effect[spec.field]
    if (value === undefined) {
      violations.push(`${spec.markId} 的 effect.${spec.field} 缺失（模擬需要讀取此欄位）`)
    } else if (typeof value !== spec.type) {
      violations.push(
        `${spec.markId} 的 effect.${spec.field} 型別應為 ${spec.type}，實際為 ${typeof value}`,
      )
    } else if (spec.type === 'number' && !Number.isFinite(value as number)) {
      violations.push(`${spec.markId} 的 effect.${spec.field} 不是合法的有限數字`)
    }
  }
  return violations
}

export function validateContent(): string[] {
  const violations: string[] = [...validateRequiredEffectFields()]

  if (marks.length !== 12) {
    violations.push(`印記數量應為 12，實際 ${marks.length}`)
  }
  const idSet = new Set<string>()
  for (const mark of marks) {
    if (idSet.has(mark.id)) violations.push(`重複印記 id：${mark.id}`)
    idSet.add(mark.id)
    if (mark.requires !== null && !marks.some((candidate) => candidate.id === mark.requires)) {
      violations.push(`${mark.id} 的 requires 指向未知印記 ${mark.requires}`)
    }
    if (mark.slot !== null && mark.slot !== 'q' && mark.slot !== 'e') {
      violations.push(`${mark.id} 使用非法 slot ${String(mark.slot)}`)
    }
    for (const action of mark.changes_actions) {
      if (!['attack', 'dodge', 'q', 'e'].includes(action)) {
        violations.push(`${mark.id} 改變了非法動作 ${action}`)
      }
    }
    if (mark.keystone && !(mark.changes_actions.includes('dodge') && (mark.changes_actions.includes('q') || mark.changes_actions.includes('e')))) {
      violations.push(`${mark.id} 標記為 keystone 但未同時重寫閃避與一項主動技能`)
    }
  }
  for (const school of schoolIds) {
    const schoolMarks = marks.filter((mark) => mark.school === school)
    if (schoolMarks.length !== 4) {
      violations.push(`流派 ${school} 應有 4 枚印記，實際 ${schoolMarks.length}`)
    }
    const keystones = schoolMarks.filter((mark) => mark.keystone)
    if (keystones.length !== 1) {
      violations.push(`流派 ${school} 應恰有 1 枚 keystone 印記，實際 ${keystones.length}`)
    }
  }

  if (enemies.length !== 3) {
    violations.push(`敵人種類應為 3，實際 ${enemies.length}`)
  }
  const enemyIdSet = new Set(enemies.map((enemy) => enemy.id))
  if (enemyIdSet.size !== enemies.length) violations.push('敵人 id 有重複')
  if (boss === undefined || boss.hp <= 0) violations.push('Boss 資料缺失或血量非法')
  if (boss !== undefined) {
    if (boss.phases.length !== 3) {
      violations.push(`Boss 應有 3 個階段，實際 ${boss.phases.length}`)
    }
    let previousThreshold = Number.POSITIVE_INFINITY
    for (const phase of boss.phases) {
      if (phase.hp_threshold >= previousThreshold) {
        violations.push(`Boss 階段 ${phase.id} 的 hp_threshold 未遞減排序`)
      }
      previousThreshold = phase.hp_threshold
    }
  }

  if (zones.length !== 3) violations.push(`戰區數量應為 3，實際 ${zones.length}`)
  for (const zone of zones) {
    if (zone.encounters.length !== 2) {
      violations.push(`${zone.id} 應恰有 2 場非 Boss 遭遇戰，實際 ${zone.encounters.length}`)
    }
    for (const encounter of zone.encounters) {
      for (const ref of encounter.enemies) {
        if (!enemyIdSet.has(ref.enemy_id)) {
          violations.push(`${encounter.id} 使用未知敵人 ${ref.enemy_id}`)
        }
      }
    }
    if (zone.boss_id !== undefined && boss !== undefined && zone.boss_id !== boss.id) {
      violations.push(`${zone.id} 的 boss_id 與 content/enemies.json 的 boss.id 不一致`)
    }
  }
  if (zones.filter((zone) => zone.boss_id !== undefined).length !== 1) {
    violations.push('應恰有一個戰區掛載 Boss')
  }

  return violations
}

// ---------------------------------------------------------------------------
// 印記選取（三選一，逐戰抽取）
// ---------------------------------------------------------------------------

function eligibleMarks(selected: readonly MarkId[]): MarkDef[] {
  const claimedSlots = new Set(
    selected
      .map((id) => getMark(id).slot)
      .filter((slot): slot is SlotName => slot !== null),
  )
  return marks.filter((mark) => {
    if (selected.includes(mark.id)) return false
    if (mark.requires !== null && !selected.includes(mark.requires)) return false
    if (mark.slot !== null && claimedSlots.has(mark.slot)) return false
    return true
  })
}

function draftScore(
  mark: MarkDef,
  schoolAffinity: SchoolId,
  selected: readonly MarkId[],
  rng: Rng,
): number {
  let score = rng.next() * 3.2
  if (mark.school === schoolAffinity) score += 0.8
  if (mark.requires !== null && selected.includes(mark.requires)) score += 0.6
  if (mark.keystone && !selected.some((id) => getMark(id).keystone)) score += 0.4
  return score
}

// draftMode 'random' 供 Balance Engineer 建立「若三選一畫面完全隨機挑選、
// 不偏好流派親和力」的理論基準線，用來對照 Gate 2 build 集中度門檻是否合理；
// 不影響預設（'affinity'）行為，spec.md 既有重現指令的輸出不變。
export type DraftMode = 'affinity' | 'random'

function draftMark(
  rng: Rng,
  schoolAffinity: SchoolId,
  selected: readonly MarkId[],
  draftMode: DraftMode = 'affinity',
): MarkId | null {
  const eligible = eligibleMarks(selected)
  if (eligible.length === 0) return null
  const offer = rng.shuffle(eligible).slice(0, Math.min(3, eligible.length))
  if (draftMode === 'random') {
    return rng.pick(offer).id
  }
  const compatible = eligible.filter((mark) => mark.school === schoolAffinity)
  if (
    compatible.length > 0 &&
    !offer.some((mark) => mark.school === schoolAffinity)
  ) {
    offer[0] = rng.pick(compatible)
  }
  let best = offer[0]
  if (best === undefined) throw new Error('沒有可供選擇的印記')
  let bestScore = draftScore(best, schoolAffinity, selected, rng)
  for (const candidate of offer.slice(1)) {
    const score = draftScore(candidate, schoolAffinity, selected, rng)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best.id
}

// ---------------------------------------------------------------------------
// 戰鬥模擬
// ---------------------------------------------------------------------------

type EnemyInstance = {
  hp: number
  armorMultiplier: number
  nextAttackIn: number
  isBoss: boolean
  bossMaxHp: number
  staticDamage: number
  staticIntervalS: number
  staticDodgeModifier: number
}

function activeBossPhase(instance: EnemyInstance): BossPhase {
  const fraction = instance.hp / instance.bossMaxHp
  const qualifying = boss.phases.filter((phase) => fraction <= phase.hp_threshold)
  return qualifying[qualifying.length - 1] ?? boss.phases[0]!
}

function currentStats(instance: EnemyInstance): {
  damage: number
  intervalS: number
  dodgeModifier: number
} {
  if (!instance.isBoss) {
    return {
      damage: instance.staticDamage,
      intervalS: instance.staticIntervalS,
      dodgeModifier: instance.staticDodgeModifier,
    }
  }
  const phase = activeBossPhase(instance)
  return {
    damage: phase.damage,
    intervalS: phase.attack_interval_cycles * CYCLE_SECONDS,
    dodgeModifier: phase.dodge_difficulty_modifier,
  }
}

function buildEncounterEnemies(
  rng: Rng,
  refs: readonly ZoneEncounterEnemyRef[],
): EnemyInstance[] {
  const instances: EnemyInstance[] = []
  for (const ref of refs) {
    const def = getEnemy(ref.enemy_id)
    for (let i = 0; i < ref.count; i += 1) {
      const intervalS = def.attack_interval_cycles * CYCLE_SECONDS
      instances.push({
        hp: def.hp,
        armorMultiplier: def.armor_multiplier,
        nextAttackIn: intervalS * (0.5 + rng.next() * 0.5),
        isBoss: false,
        bossMaxHp: def.hp,
        staticDamage: def.damage,
        staticIntervalS: intervalS,
        staticDodgeModifier: def.dodge_difficulty_modifier,
      })
    }
  }
  return instances
}

function buildBossEnemy(rng: Rng): EnemyInstance {
  const firstPhase = boss.phases[0]!
  const intervalS = firstPhase.attack_interval_cycles * CYCLE_SECONDS
  return {
    hp: boss.hp,
    armorMultiplier: boss.armor_multiplier,
    nextAttackIn: intervalS * (0.5 + rng.next() * 0.5),
    isBoss: true,
    bossMaxHp: boss.hp,
    staticDamage: firstPhase.damage,
    staticIntervalS: intervalS,
    staticDodgeModifier: firstPhase.dodge_difficulty_modifier,
  }
}

function lowestHpLiving(instances: readonly EnemyInstance[]): EnemyInstance | undefined {
  let best: EnemyInstance | undefined
  for (const instance of instances) {
    if (instance.hp <= 0) continue
    if (best === undefined || instance.hp < best.hp) best = instance
  }
  return best
}

function secondLowestHpLiving(
  instances: readonly EnemyInstance[],
  exclude: EnemyInstance,
): EnemyInstance | undefined {
  let best: EnemyInstance | undefined
  for (const instance of instances) {
    if (instance.hp <= 0 || instance === exclude) continue
    if (best === undefined || instance.hp < best.hp) best = instance
  }
  return best
}

function zeroMarkTriggers(): Record<MarkId, number> {
  return Object.fromEntries(markIds.map((id) => [id, 0])) as Record<MarkId, number>
}

type FightResult = {
  won: boolean
  cycles: number
  timeSeconds: number
  damageDealt: number
  damageTaken: number
  precisionDodges: number
  normalDodges: number
  hitsTaken: number
  blockedHits: number
  markTriggers: Record<MarkId, number>
  endHp: number
}

function resolveEncounter(
  rng: Rng,
  livingEnemies: EnemyInstance[],
  startHp: number,
  selected: readonly MarkId[],
  playerSkill: number,
): FightResult {
  let playerHp = startHp
  let cycles = 0
  let damageDealt = 0
  let damageTaken = 0
  let precisionDodges = 0
  let normalDodges = 0
  let hitsTaken = 0
  let blockedHits = 0
  const markTriggers = zeroMarkTriggers()

  let qCooldownRemaining = 0
  let eCooldownRemaining = 0
  const coreArmTimers: number[] = []
  let guardStacks = 0
  let guardOverflowBonus = false
  let shadowStacks = 0
  let pursuitWindowCyclesLeft = 0
  let phantomBonusPending = false
  let pendingAttackBonusPct = 0
  let pendingAttackBonusCyclesLeft = 0

  const anyAlive = () => livingEnemies.some((instance) => instance.hp > 0)

  while (playerHp > 0 && anyAlive() && cycles < SAFETY_CAP_CYCLES) {
    cycles += 1
    const telegraphing = livingEnemies.filter((instance) => instance.hp > 0 && instance.nextAttackIn <= 0)

    if (telegraphing.length > 0) {
      const statsList = telegraphing.map((instance) => currentStats(instance))
      const totalIncomingDamage = statsList.reduce((sum, s) => sum + s.damage, 0)
      const worstDodgeModifier = Math.min(...statsList.map((s) => s.dodgeModifier))
      const concurrencyPenalty = CONCURRENCY_PENALTY_PER_EXTRA * (telegraphing.length - 1)
      let successChance = clamp(
        playerSkill + worstDodgeModifier - concurrencyPenalty,
        0.05,
        0.97,
      )
      if (phantomBonusPending) {
        successChance = clamp(successChance + PHANTOM_RESET_SUCCESS_BONUS, 0.05, 0.97)
        phantomBonusPending = false
        markTriggers['phantom-reset'] += 1
      }
      const precisionChance = clamp(successChance - PRECISION_WINDOW_OFFSET, 0, successChance)
      const roll = rng.next()

      if (roll < precisionChance || roll < successChance) {
        const isPrecision = roll < precisionChance
        if (isPrecision) {
          precisionDodges += 1
          if (has(selected, 'precision-afterimage')) {
            shadowStacks = Math.min(MAX_SHADOW_STACKS, shadowStacks + 1)
          }
          if (has(selected, 'pursuit-strike')) {
            pursuitWindowCyclesLeft = 1
          }
          if (has(selected, 'phantom-reset')) {
            phantomBonusPending = true
          }
        } else {
          normalDodges += 1
        }
        if (has(selected, 'charged-retaliation')) {
          guardStacks = Math.min(MAX_GUARD_STACKS, guardStacks + 1)
        }
        if (has(selected, 'ember-core') && coreArmTimers.some((timer) => timer <= 0)) {
          const armedIndex = coreArmTimers.findIndex((timer) => timer <= 0)
          coreArmTimers.splice(armedIndex, 1)
          const primary = lowestHpLiving(livingEnemies)
          if (primary !== undefined) {
            primary.hp = Math.max(0, primary.hp - EMBER_CORE_DETONATE_DAMAGE)
            damageDealt += EMBER_CORE_DETONATE_DAMAGE
          }
          markTriggers['ember-core'] += 1
          pendingAttackBonusPct = EMBER_CORE_BUFF_PCT
          pendingAttackBonusCyclesLeft = EMBER_CORE_BUFF_DURATION_CYCLES
          if (has(selected, 'twin-core-resonance') && coreArmTimers.some((timer) => timer <= 0)) {
            if (rng.next() < TWIN_CORE_CHAIN_CHANCE) {
              const secondIndex = coreArmTimers.findIndex((timer) => timer <= 0)
              coreArmTimers.splice(secondIndex, 1)
              const secondary = lowestHpLiving(livingEnemies)
              if (secondary !== undefined) {
                secondary.hp = Math.max(0, secondary.hp - TWIN_CORE_SECOND_DAMAGE)
                damageDealt += TWIN_CORE_SECOND_DAMAGE
              }
              markTriggers['twin-core-resonance'] += 1
              pendingAttackBonusCyclesLeft = TWIN_CORE_BUFF_DURATION_CYCLES
            }
          }
        }
      } else {
        if (has(selected, 'aftershock-shield') && guardStacks >= AFTERSHOCK_SHIELD_REQUIRED_STACKS) {
          // 餘波護盾（還原原始設計，見 content/marks.json 的 design_rationale）：滿層時
          // 必定完全格擋。此印記在本原型的簡化自動施放 AI 下觸發率偏低（AI 只要層數 >0
          // 就會自動花掉，無法模擬真人「屏住層數換保底」的策略），已登記為已知限制
          // （見 sim/report.ts 的 KNOWN_PROTOTYPE_AI_LIMITATIONS），不是靠重新設計去湊門檻。
          blockedHits += 1
          guardOverflowBonus = true
          markTriggers['aftershock-shield'] += 1
        } else if (has(selected, 'charged-retaliation') && rng.next() < CHARGED_RETALIATION_PARRY_CHANCE) {
          // 任務 B：閃避尾段格擋判定（dodge_trailing_parry_s）。沒有滿層觸發餘波護盾的
          // 保底必格擋時，蓄能反震自己仍有一個窄機率把這次「本來會命中」的攻擊改判為
          // 格擋——不損失蓄能層數、不計入 hitsTaken。charged-retaliation 的 changes_actions
          // 同時涵蓋閃避與 E，因此這裡與 E 觸發共用同一個 markTriggers 計數。
          blockedHits += 1
          markTriggers['charged-retaliation'] += 1
        } else {
          playerHp = Math.max(0, playerHp - totalIncomingDamage)
          damageTaken += totalIncomingDamage
          hitsTaken += 1
          if (has(selected, 'charged-retaliation')) {
            guardStacks = Math.max(0, guardStacks - 1)
          }
        }
      }

      for (const instance of telegraphing) {
        const stats = currentStats(instance)
        instance.nextAttackIn = stats.intervalS
      }
    } else {
      const whiff = rng.next() < WHIFF_CHANCE
      if (!whiff) {
        let efficiency = 0.5 + rng.next() * 0.6
        const primary = lowestHpLiving(livingEnemies)
        if (primary !== undefined) {
          if (
            has(selected, 'bulwark-chain') &&
            guardStacks >= BULWARK_CHAIN_MIN_STACKS &&
            rng.next() < BULWARK_CHAIN_NO_RESET_CHANCE
          ) {
            // 「連段不重置」是操作節奏的改變：這次攻擊視為接住了完整連段效率
            // （efficiency 固定取滾動範圍的上限 1.1＝0.5+0.6），而不是額外加一筆
            // 固定傷害——修正一處內容正本與程式碼互相矛盾的實作缺陷，見
            // content/marks.json bulwark-chain 的 design_rationale。
            efficiency = 1.1
            markTriggers['bulwark-chain'] += 1
          }
          let dmg = PLAYER_COMBO_BASE_DAMAGE * efficiency * primary.armorMultiplier
          if (has(selected, 'cracking-flame-combo')) {
            dmg += CRACKING_FLAME_FINISHER_BONUS * primary.armorMultiplier
            markTriggers['cracking-flame-combo'] += 1
            const secondary = secondLowestHpLiving(livingEnemies, primary)
            if (secondary !== undefined) {
              const splash = CRACKING_FLAME_SPLASH_DAMAGE * secondary.armorMultiplier
              secondary.hp = Math.max(0, secondary.hp - splash)
              damageDealt += splash
            }
          }
          if (pursuitWindowCyclesLeft > 0) {
            dmg += PURSUIT_STRIKE_BONUS * primary.armorMultiplier
            markTriggers['pursuit-strike'] += 1
            pursuitWindowCyclesLeft = 0
          }
          if (has(selected, 'bulwark-chain') && guardStacks >= BULWARK_CHAIN_MIN_STACKS) {
            // range_bonus_pct（第一段判定範圍 +30%）近似為命中第二目標的濺射傷害。
            const secondary = secondLowestHpLiving(livingEnemies, primary)
            if (secondary !== undefined) {
              const splash = BULWARK_CHAIN_SPLASH_DAMAGE * secondary.armorMultiplier
              secondary.hp = Math.max(0, secondary.hp - splash)
              damageDealt += splash
              markTriggers['bulwark-chain'] += 1
            }
          }
          if (pendingAttackBonusCyclesLeft > 0 && pendingAttackBonusPct > 0) {
            dmg *= 1 + pendingAttackBonusPct / 100
            pendingAttackBonusPct = 0
            pendingAttackBonusCyclesLeft = 0
          }
          primary.hp = Math.max(0, primary.hp - dmg)
          damageDealt += dmg
        }
      }
      if (pursuitWindowCyclesLeft > 0) pursuitWindowCyclesLeft -= 1
      if (pendingAttackBonusCyclesLeft > 0) pendingAttackBonusCyclesLeft -= 1

      for (const instance of livingEnemies) {
        if (instance.hp <= 0) continue
        instance.nextAttackIn -= CYCLE_SECONDS
      }
    }

    for (let i = 0; i < coreArmTimers.length; i += 1) {
      coreArmTimers[i] = (coreArmTimers[i] ?? 0) - CYCLE_SECONDS
    }

    // --- Q/E 自動施放（每循環結算一次，獨立於閃避／攻擊分支） ---
    if (playerHp > 0 && anyAlive()) {
      qCooldownRemaining -= CYCLE_SECONDS
      if (qCooldownRemaining <= 0) {
        if (has(selected, 'ember-core')) {
          const hasTwinCore = has(selected, 'twin-core-resonance')
          const maxCores = hasTwinCore ? 2 : 1
          if (coreArmTimers.length < maxCores) {
            coreArmTimers.push(EMBER_CORE_ARM_DELAY_S)
          }
          // 冷卻一律重置，即使核心槽已滿而沒有真的放置新核心：
          // 修正一個既有 bug——原本冷卻只在成功放置核心時重置，槽滿時冷卻卡在 <=0，
          // 導致核心一旦被引爆，下一輪（約 1.1 秒後）就立刻補位，
          // 完全繞過 content/marks.json 記載的 q_cooldown_s=5 秒節奏。
          // 任務 C：雙核共振選取後改用自己專屬、大幅縮短的 Q 冷卻（見 TWIN_CORE_Q_COOLDOWN_S），
          // 讓兩枚核心的武裝時間差縮小，提高「引爆時另一核也已就緒」的機率。
          qCooldownRemaining = hasTwinCore ? TWIN_CORE_Q_COOLDOWN_S : EMBER_CORE_Q_COOLDOWN_S
        } else if (has(selected, 'mirror-plating')) {
          const target = lowestHpLiving(livingEnemies)
          if (target !== undefined) {
            const dmg = MIRROR_PLATING_REFLECT_DAMAGE * target.armorMultiplier
            target.hp = Math.max(0, target.hp - dmg)
            damageDealt += dmg
            guardStacks = Math.min(MAX_GUARD_STACKS, guardStacks + MIRROR_PLATING_GRANTS_STACK)
            markTriggers['mirror-plating'] += 1
          }
          qCooldownRemaining = MIRROR_PLATING_Q_COOLDOWN_S
        } else if (has(selected, 'shadow-harvest')) {
          if (shadowStacks > 0) {
            const target = lowestHpLiving(livingEnemies)
            if (target !== undefined) {
              const dmg = SHADOW_Q_DAMAGE_PER_STACK * shadowStacks * target.armorMultiplier
              target.hp = Math.max(0, target.hp - dmg)
              damageDealt += dmg
              markTriggers['shadow-harvest'] += 1
            }
            qCooldownRemaining = SHADOW_Q_COOLDOWN_S
          }
        } else {
          const target = lowestHpLiving(livingEnemies)
          if (target !== undefined) {
            const dmg = BASE_Q_DAMAGE * target.armorMultiplier
            target.hp = Math.max(0, target.hp - dmg)
            damageDealt += dmg
          }
          qCooldownRemaining = BASE_Q_COOLDOWN_S
        }
      }

      eCooldownRemaining -= CYCLE_SECONDS
      if (eCooldownRemaining <= 0) {
        if (has(selected, 'ember-sacrifice')) {
          const armedCount = coreArmTimers.filter((timer) => timer <= 0).length
          if (armedCount > 0) {
            const totalDmg = EMBER_CORE_DETONATE_DAMAGE * armedCount
            for (const instance of livingEnemies) {
              if (instance.hp <= 0) continue
              instance.hp = Math.max(0, instance.hp - totalDmg)
              damageDealt += totalDmg
            }
            coreArmTimers.length = 0
            markTriggers['ember-sacrifice'] += 1
            eCooldownRemaining = EMBER_SACRIFICE_E_COOLDOWN_S
          }
        } else if (has(selected, 'precision-afterimage')) {
          if (shadowStacks > 0) {
            shadowStacks -= 1
            const target = lowestHpLiving(livingEnemies)
            if (target !== undefined) {
              const dmg = SHADOW_E_DAMAGE * target.armorMultiplier
              target.hp = Math.max(0, target.hp - dmg)
              damageDealt += dmg
              markTriggers['precision-afterimage'] += 1
            }
            eCooldownRemaining = SHADOW_E_COOLDOWN_S
          }
        } else if (has(selected, 'charged-retaliation')) {
          if (guardStacks > 0) {
            const multiplier = guardOverflowBonus ? 1 + GUARD_OVERFLOW_BONUS_PCT / 100 : 1
            const perTargetDmg = GUARD_E_DAMAGE_PER_STACK * guardStacks * multiplier
            for (const instance of livingEnemies) {
              if (instance.hp <= 0) continue
              const dmg = perTargetDmg * instance.armorMultiplier
              instance.hp = Math.max(0, instance.hp - dmg)
              damageDealt += dmg
            }
            guardStacks = 0
            guardOverflowBonus = false
            markTriggers['charged-retaliation'] += 1
            eCooldownRemaining = GUARD_E_COOLDOWN_S
          }
        } else {
          const primary = lowestHpLiving(livingEnemies)
          if (primary !== undefined) {
            const dmg = BASE_E_DAMAGE * primary.armorMultiplier
            primary.hp = Math.max(0, primary.hp - dmg)
            damageDealt += dmg
            const secondary = secondLowestHpLiving(livingEnemies, primary)
            if (secondary !== undefined) {
              const secondDmg = BASE_E_SECOND_TARGET_DAMAGE * secondary.armorMultiplier
              secondary.hp = Math.max(0, secondary.hp - secondDmg)
              damageDealt += secondDmg
            }
          }
          eCooldownRemaining = BASE_E_COOLDOWN_S
        }
      }
    }
  }

  return {
    won: playerHp > 0 && !anyAlive(),
    cycles,
    timeSeconds: cycles * CYCLE_SECONDS,
    damageDealt,
    damageTaken,
    precisionDodges,
    normalDodges,
    hitsTaken,
    blockedHits,
    markTriggers,
    endHp: playerHp,
  }
}

// ---------------------------------------------------------------------------
// 整局模擬
// ---------------------------------------------------------------------------

function addMarkTriggers(
  target: Record<MarkId, number>,
  source: Record<MarkId, number>,
): void {
  for (const id of markIds) target[id] += source[id]
}

function buildSignatureFrom(selected: readonly MarkId[], schoolAffinity: SchoolId): string {
  return `${schoolAffinity}:${[...selected].sort().join('+')}`
}

export type PrototypeResult = {
  won: boolean
  schoolAffinity: SchoolId
  playerSkill: number
  encountersCleared: number
  totalEncounters: number
  totalCycles: number
  totalTimeMs: number
  damageDealt: number
  damageTaken: number
  precisionDodges: number
  normalDodges: number
  hitsTaken: number
  blockedHits: number
  selected: MarkId[]
  buildSignature: string
  markTriggers: Record<MarkId, number>
}

export type PrototypeSummary = {
  seed: string
  runs: number
  winRate: number
  encountersClearedStats: NumericStats
  timeStats: NumericStats
  winningTimeStats: NumericStats
  schoolFrequency: Record<string, number>
  schoolWinRate: Record<SchoolId, number>
  winningSchoolShare: Record<SchoolId, number>
  winningMarkInclusionRate: Record<MarkId, number>
  markTriggerCount: Record<MarkId, number>
  winningBuildFrequency: Record<string, number>
  topFiveBuildShare: number
  legalContentViolations: string[]
  determinismDigest: string
}

const TOTAL_ENCOUNTERS = zones.reduce((sum, zone) => sum + zone.encounters.length, 0) + 1

function runWithRng(
  rng: Rng,
  forcedSchool?: SchoolId,
  forcedPlayerSkill?: number,
  draftMode: DraftMode = 'affinity',
): PrototypeResult {
  const schoolAffinity = forcedSchool ?? rng.pick(schoolIds)
  // playerSkill 近似「閃避操作水準」：spec.md 記載的原始隨機區間是 0.735–0.875，
  // forcedPlayerSkill 讓 Balance Engineer 能固定這個值做敏感度掃描（例如 0.5–0.95），
  // 不傳入時行為與原本完全相同。
  const playerSkill = forcedPlayerSkill ?? 0.735 + rng.next() * 0.14
  let playerHp = PLAYER_MAX_HP
  const selected: MarkId[] = []
  const markTriggers = zeroMarkTriggers()
  let encountersCleared = 0
  let totalCycles = 0
  let damageDealt = 0
  let damageTaken = 0
  let precisionDodges = 0
  let normalDodges = 0
  let hitsTaken = 0
  let blockedHits = 0
  let won = false
  let draftsTaken = 0

  outer: for (const zone of zones) {
    for (const encounter of zone.encounters) {
      const instances = buildEncounterEnemies(
        rng.fork(`enemies-${encounter.id}`),
        encounter.enemies,
      )
      const result = resolveEncounter(
        rng.fork(`fight-${encounter.id}`),
        instances,
        playerHp,
        selected,
        playerSkill,
      )
      totalCycles += result.cycles
      damageDealt += result.damageDealt
      damageTaken += result.damageTaken
      precisionDodges += result.precisionDodges
      normalDodges += result.normalDodges
      hitsTaken += result.hitsTaken
      blockedHits += result.blockedHits
      addMarkTriggers(markTriggers, result.markTriggers)
      playerHp = result.endHp
      if (!result.won) break outer
      encountersCleared += 1
      const drafted = draftMark(
        rng.fork(`draft-${encounter.id}`),
        schoolAffinity,
        selected,
        draftMode,
      )
      if (drafted !== null) {
        selected.push(drafted)
        draftsTaken += 1
      }
    }
    playerHp = Math.min(PLAYER_MAX_HP, playerHp + zone.zone_clear_heal_hp)
  }

  if (encountersCleared === TOTAL_ENCOUNTERS - 1) {
    const bossInstance = buildBossEnemy(rng.fork('enemies-boss'))
    const bossResult = resolveEncounter(
      rng.fork('fight-boss'),
      [bossInstance],
      playerHp,
      selected,
      playerSkill,
    )
    totalCycles += bossResult.cycles
    damageDealt += bossResult.damageDealt
    damageTaken += bossResult.damageTaken
    precisionDodges += bossResult.precisionDodges
    normalDodges += bossResult.normalDodges
    hitsTaken += bossResult.hitsTaken
    blockedHits += bossResult.blockedHits
    addMarkTriggers(markTriggers, bossResult.markTriggers)
    playerHp = bossResult.endHp
    if (bossResult.won) {
      encountersCleared += 1
      won = true
    }
  }

  const combatSeconds = totalCycles * CYCLE_SECONDS
  const nonBossEncountersCleared = Math.min(encountersCleared, TOTAL_ENCOUNTERS - 1)
  const totalTimeMs =
    (tutorialOverheadS +
      combatSeconds +
      draftOverheadS * draftsTaken +
      ENCOUNTER_TRANSITION_S * nonBossEncountersCleared +
      bossIntroOutroS) *
    1000

  return {
    won,
    schoolAffinity,
    playerSkill,
    encountersCleared,
    totalEncounters: TOTAL_ENCOUNTERS,
    totalCycles,
    totalTimeMs,
    damageDealt,
    damageTaken,
    precisionDodges,
    normalDodges,
    hitsTaken,
    blockedHits,
    selected,
    buildSignature: buildSignatureFrom(selected, schoolAffinity),
    markTriggers,
  }
}

export function runSeedWithSchool(
  seed: string,
  school: SchoolId,
  forcedPlayerSkill?: number,
): PrototypeResult {
  return runWithRng(createRng(seed), school, forcedPlayerSkill)
}

export function runOnce(
  rng: Rng,
  forcedPlayerSkill?: number,
  draftMode?: DraftMode,
): PrototypeResult {
  return runWithRng(rng, undefined, forcedPlayerSkill, draftMode)
}

export type RunPrototypeOptions = {
  /** 固定閃避成功率基準值（略過 spec.md 原本的 0.735–0.875 隨機區間），供敏感度掃描使用。 */
  forcedPlayerSkill?: number
  /** 'random' 讓三選一畫面完全隨機挑選、不偏好流派親和力，供 build 集中度的理論基準比較使用。 */
  draftMode?: DraftMode
}

export function runPrototype(
  runs: number,
  seed = 'embers-duel-gate-2-v1',
  options?: RunPrototypeOptions,
): PrototypeSummary {
  const report = simulate(
    (rng) => runOnce(rng, options?.forcedPlayerSkill, options?.draftMode),
    { seed, runs },
  )
  const wins = report.results.filter((result) => result.won)

  const schoolFrequency = frequency(report.results.map((result) => result.schoolAffinity))
  const schoolWinRate = Object.fromEntries(
    schoolIds.map((school) => [
      school,
      rate(
        report.results
          .filter((result) => result.schoolAffinity === school)
          .map((result) => result.won),
      ),
    ]),
  ) as Record<SchoolId, number>
  const winningSchoolShare = Object.fromEntries(
    schoolIds.map((school) => [
      school,
      wins.length === 0
        ? 0
        : wins.filter((result) => result.schoolAffinity === school).length / wins.length,
    ]),
  ) as Record<SchoolId, number>
  const winningMarkInclusionRate = Object.fromEntries(
    markIds.map((id) => [
      id,
      wins.length === 0
        ? 0
        : wins.filter((result) => result.selected.includes(id)).length / wins.length,
    ]),
  ) as Record<MarkId, number>
  const markTriggerCount = Object.fromEntries(
    markIds.map((id) => [
      id,
      report.results.reduce((sum, result) => sum + result.markTriggers[id], 0),
    ]),
  ) as Record<MarkId, number>
  // frequency() 對空陣列會丟例外；閃避成功率敏感度掃描在極端低技巧值時勝率會是 0%，
  // 此時沒有任何勝利 build 可統計，回傳空物件而非讓整批模擬崩潰。
  const winningBuildFrequency =
    wins.length === 0 ? {} : frequency(wins.map((result) => result.buildSignature))
  const topFiveWins = Object.values(winningBuildFrequency)
    .sort((left, right) => right - left)
    .slice(0, 5)
    .reduce((sum, value) => sum + value, 0)

  const digestSource = report.results
    .slice(0, 32)
    .map(
      (result) =>
        `${result.schoolAffinity}:${result.won}:${result.encountersCleared}:${[...result.selected].sort().join(',')}`,
    )
    .join('|')

  return {
    seed,
    runs,
    winRate: rate(report.results.map((result) => result.won)),
    encountersClearedStats: numericStats(
      report.results.map((result) => result.encountersCleared),
    ),
    timeStats: numericStats(report.results.map((result) => result.totalTimeMs)),
    // 同上：0% 勝率時沒有勝利局可統計時長，回傳全 0 佔位而非讓 numericStats() 丟例外。
    winningTimeStats:
      wins.length === 0
        ? { count: 0, min: 0, max: 0, mean: 0, median: 0, p10: 0, p90: 0 }
        : numericStats(wins.map((result) => result.totalTimeMs)),
    schoolFrequency,
    schoolWinRate,
    winningSchoolShare,
    winningMarkInclusionRate,
    markTriggerCount,
    winningBuildFrequency,
    topFiveBuildShare: wins.length === 0 ? 0 : topFiveWins,
    legalContentViolations: validateContent(),
    determinismDigest: digestSource,
  }
}
