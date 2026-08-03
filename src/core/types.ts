import type { Vector2 } from './vector.js'
import type { PlayerAttackGeometry } from './player-attack-geometry.js'

// ---------------------------------------------------------------------------
// 輸入：純資料，不是事件（硬規定 4）。
// ---------------------------------------------------------------------------

/**
 * 這一 tick 的輸入狀態。全部欄位代表「這一刻是否按住」的held 狀態（類似真實鍵盤），
 * 不是「這一刻發生了一次按下事件」——邊緣觸發（rising edge）偵測是 core 內部
 * 的職責（見 `state.previousInput`），渲染層只需要每個 tick 誠實回報目前的鍵盤/
 * 滑鼠狀態，不需要自己做去抖動或事件轉換。
 */
export type TickInput = {
  /** -1..1，正規化前的原始移動輸入（例如同時按 A 與 D 應為 0）。 */
  readonly moveX: number
  readonly moveY: number
  /** 玩家到游標的 core 世界方向；(0, 0) 代表維持目前 facing。 */
  readonly aimX: number
  readonly aimY: number
  readonly attack: boolean
  readonly dodge: boolean
  readonly skillQ: boolean
  readonly skillE: boolean
  /**
   * 三選一畫面的選擇；非 draft 階段時應恆為 null。
   * 一旦非 null，本 tick 立即套用該印記並進入下一個階段——不需要邊緣觸發，
   * 因為階段會在同一 tick 內離開 'draft'，不會有重複觸發的疑慮。
   */
  readonly draftChoice: MarkId | null
  /**
  * 快速重開：回到遭遇一開頭、清空完整已選 build。
   */
  readonly restart: boolean
}

export function neutralInput(): TickInput {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    attack: false,
    dodge: false,
    skillQ: false,
    skillE: false,
    draftChoice: null,
    restart: false,
  }
}

// ---------------------------------------------------------------------------
// 印記
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 玩家狀態
// ---------------------------------------------------------------------------

export type ComboPhase = 'idle' | 'startup' | 'active' | 'recovery'

export type ComboState = {
  /** 0 = 尚未開始；1/2/3 = 目前在第幾段。 */
  readonly hitIndex: 0 | 1 | 2 | 3
  readonly phase: ComboPhase
  /** 目前 phase 的剩餘 tick 數。 */
  readonly phaseTicksRemaining: number
  /** startup／active 尾端或 connection window 收到的攻擊意圖，於窗口結束時兌現。 */
  readonly attackQueued?: boolean
  /** active window 的權威主斬幾何；命中當 tick 快照，避免位移／資源消耗後重算。 */
  readonly attackGeometry?: PlayerAttackGeometry
}

export type DodgeState = {
  readonly active: boolean
  /** 無敵幀剩餘 tick 數；>0 時代表仍在無敵幀內。 */
  readonly invincibilityTicksRemaining: number
  /** 蓄能反震 keystone 專屬：無敵幀結束後的格擋尾段。 */
  readonly parryTailActive: boolean
  readonly parryTailTicksRemaining: number
  readonly cooldownTicksRemaining: number
  readonly startPosition: Vector2
  readonly endPosition: Vector2
  /** 非 null 時代表本次閃避是彎曲弧線（餘燼核心 keystone），值為彎曲目標核心的座標快照。 */
  readonly bendTarget: Vector2 | null
  /** 本次閃避是否為精準閃避（判定生效前 0.12 秒內完成）。 */
  readonly wasPrecision: boolean
  /** 本次閃避已經引爆過核心（避免同一次閃避對同一顆核心重複引爆）。 */
  readonly detonatedThisDodge: boolean
}

export type EmberCoreObject = {
  readonly position: Vector2
  /** >0 尚未武裝；<=0 已武裝。 */
  readonly armTicksRemaining: number
}

export type AfterimageObject = {
  readonly position: Vector2
  readonly ticksRemaining: number
}

export type PlayerState = {
  readonly position: Vector2
  /** 正規化後的面向方向，移動輸入為零時維持上一次的方向。 */
  readonly facing: Vector2
  readonly hp: number
  readonly combo: ComboState
  readonly dodge: DodgeState
  readonly qCooldownTicksRemaining: number
  readonly eCooldownTicksRemaining: number
  /** 餘燼核心引爆後的普攻加成（百分比）與剩餘持續 tick 數。 */
  readonly attackBonusPct: number
  readonly attackBonusTicksRemaining: number
  /** 餘燼核心 keystone：本切片範圍內最多同時 1 顆（雙核共振不在範圍內）。 */
  readonly emberCores: readonly EmberCoreObject[]
  /** 精準殘影 keystone：現存殘影，同時也代表目前的 E 充能數（見 combat.ts 說明）。 */
  readonly afterimages: readonly AfterimageObject[]
  /** 蓄能反震 keystone：目前蓄能層數（上限 max_stacks）。 */
  readonly guardStacks: number
  /** 突進追擊：精準閃避後可兌現的第一段窗口。 */
  readonly pursuitTicksRemaining: number
  /** 餘波護盾格擋後，下一次反震衝擊的一次性加成。 */
  readonly aftershockBonusReady: boolean
  /** 鏡甲反傷 Q 的完全格擋姿態。 */
  readonly mirrorStanceTicksRemaining: number
}

// ---------------------------------------------------------------------------
// 敵人狀態
// ---------------------------------------------------------------------------

export type EnemyKind = 'ember-thrall' | 'shade-skirmisher' | 'bulwark-sentinel' | 'ashen-warlord'
export type EnemyAttackState = 'approach' | 'cooldown' | 'telegraph'
export type BossAttackPattern = 'smash' | 'charge' | 'summon'
export type EnemyLocomotion = 'idle' | 'advance' | 'strafe' | 'retreat' | 'dash' | 'brace' | 'recover'

export type EnemyAttackGeometry =
  | { readonly kind: 'cone'; readonly origin: Vector2; readonly direction: Vector2; readonly radius: number; readonly halfAngleRad: number }
  | { readonly kind: 'lane'; readonly origin: Vector2; readonly direction: Vector2; readonly length: number; readonly halfWidth: number }
  | { readonly kind: 'circle'; readonly center: Vector2; readonly radius: number }
  | { readonly kind: 'summon'; readonly circles: readonly { readonly center: Vector2; readonly radius: number }[] }

export type EnemyState = {
  readonly id: string
  readonly kind: EnemyKind
  readonly position: Vector2
  readonly hp: number
  readonly maxHp: number
  readonly attackState: EnemyAttackState
  /** 本 tick 的實際世界速度；render 直接以此選擇走路／側移／突進表演。 */
  readonly velocity: Vector2
  readonly locomotion: EnemyLocomotion
  readonly attackRecoveryTicksRemaining: number
  /** 進入 telegraph 當 tick 鎖定；判定與 render 必須共同使用這份幾何快照。 */
  readonly telegraphGeometry: EnemyAttackGeometry | null
  /** 依 attackState 意義不同：'cooldown' 時是距離下次預兆的 tick 數；'telegraph' 時是距離判定生效的 tick 數。 */
  readonly timerTicks: number
  readonly attacksPerformed?: number
  readonly bossPhase?: 0 | 1 | 2 | 3
  readonly bossAttack?: BossAttackPattern | null
}

/**
 * 遭遇導演的純資料快照。預告座標在波次被排入時就烘焙，重播時不需要重新擲亂數，
 * 渲染層可直接以此畫出邊緣裂隙／出生輪廓。
 */
export type SpawnTelegraph = {
  readonly kind: EnemyKind
  readonly position: Vector2
}

export type EncounterDirectorState = {
  readonly roomIndex: number
  readonly boss: boolean
  /** 已經實體化的波次；-1 代表開場預告尚未落地。 */
  readonly activeWaveIndex: number
  readonly waves: readonly (readonly EnemyKind[])[]
  /** 大於零時為出生預告倒數；零時由 run 在下一個 tick 實體化。 */
  readonly telegraphTicksRemaining: number
  readonly telegraphs: readonly SpawnTelegraph[]
}

// ---------------------------------------------------------------------------
// 事件：這一 tick 發生的、值得渲染層／音訊層反應的離散事實。
// 每 tick 重新產生、不累積，保持 GameState 的大小與決定性可預期。
// ---------------------------------------------------------------------------

export type GameEvent =
  | { readonly type: 'comboHit'; readonly hitIndex: 1 | 2 | 3; readonly damage: number; readonly targetId: string; readonly geometry: PlayerAttackGeometry }
  | { readonly type: 'comboWhiff'; readonly geometry: PlayerAttackGeometry }
  | { readonly type: 'dodgeStart'; readonly precision: boolean; readonly bent: boolean }
  | { readonly type: 'coreArmed'; readonly position: Vector2 }
  | { readonly type: 'coreDetonated'; readonly position: Vector2 }
  | { readonly type: 'afterimageSpawned'; readonly position: Vector2 }
  | { readonly type: 'qCast' }
  | { readonly type: 'eCast' }
  | { readonly type: 'eFailed' }
  | { readonly type: 'playerHit'; readonly damage: number }
  | { readonly type: 'playerBlocked' }
  | { readonly type: 'enemyDefeated'; readonly id: string }
  | { readonly type: 'encounterCleared'; readonly encounter: EncounterId }
  | { readonly type: 'draftOffered' }
  | { readonly type: 'markSelected'; readonly markId: MarkId }
  | { readonly type: 'victory' }
  | { readonly type: 'defeat' }
  | { readonly type: 'bossPhaseChanged'; readonly phase: 2 | 3 }
  | { readonly type: 'bossSummoned'; readonly count: number }
  | { readonly type: 'waveTelegraphed'; readonly wave: number; readonly totalWaves: number; readonly count: number }
  | { readonly type: 'waveSpawned'; readonly wave: number; readonly totalWaves: number; readonly count: number }
  | { readonly type: 'bossCleared'; readonly room: 3 | 6 }

// ---------------------------------------------------------------------------
// 頂層執行狀態
// ---------------------------------------------------------------------------

export type EncounterId = 'z1-e1' | 'z1-e2' | 'z2-e1' | 'z2-e2' | 'z3-e1' | 'z3-e2'
export type EncounterPhase = 'encounter1' | 'encounter2' | 'encounter3' | 'encounter4' | 'encounter5' | 'encounter6'
export type RunPhase = EncounterPhase | 'draft' | 'boss' | 'victory' | 'defeat'

export type GameState = {
  readonly seed: string
  readonly tick: number
  readonly phase: RunPhase
  /** 0..5 為六關索引；第 3、6 關是 Boss。 */
  readonly encounterIndex: number
  readonly selectedMark: MarkId | null
  readonly selectedMarks: readonly MarkId[]
  readonly draftOptions: readonly MarkId[]
  readonly player: PlayerState
  readonly enemies: readonly EnemyState[]
  readonly encounterDirector: EncounterDirectorState
  readonly previousInput: TickInput
  readonly events: readonly GameEvent[]
}
