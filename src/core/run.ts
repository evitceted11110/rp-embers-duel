/**
 * 頂層執行狀態機：`createRun(seed)` 建立初始狀態，`tick(state, input)` 是唯一的
 * 邏輯推進入口——固定步長、純函式、輸入是資料不是事件（硬規定 2、4）。
 *
 * 階段：六次（encounterN → draft）→ boss → victory | defeat。
 * 任一階段收到 `input.restart` 都會立刻跳回全新的 encounter1。
 *
 * ⚠️ 誠實揭露（Studio Head 2026-07-31 指示需記錄）：遭遇 2（焰奴×2＋影刺客×1）
 * 本來就比遭遇 1（焰奴×1）難。玩家在遭遇 2 的體感強度變化，一部分來自敵人數量
 * 與種類增加，不是全部歸功於三選一選到的印記——這不是乾淨的 A/B 對照組，Gate 3
 * 試玩回饋時請留意這一點，不要把「感覺變強了」直接等同於「印記改寫證明有效」。
 */
import { createRng } from '@rogue-paradise/rng'
import { resolvePlayerTick } from './combat.js'
import { PLAYER_MAX_HP } from './constants.js'
import { ENCOUNTERS, MARKS, ZONE_CLEAR_HEALS, markDef } from './content.js'
import { advanceEnemies, spawnBoss, spawnEncounter } from './enemy.js'
import {
  neutralInput,
  type EncounterPhase,
  type GameEvent,
  type GameState,
  type PlayerState,
  type EnemyState,
  type TickInput,
} from './types.js'
import { ZERO_VECTOR } from './vector.js'

function initialPlayer(): PlayerState {
  return {
    position: ZERO_VECTOR,
    facing: { x: 1, y: 0 },
    hp: PLAYER_MAX_HP,
    combo: { hitIndex: 0, phase: 'idle', phaseTicksRemaining: 0 },
    dodge: {
      active: false,
      invincibilityTicksRemaining: 0,
      parryTailActive: false,
      parryTailTicksRemaining: 0,
      cooldownTicksRemaining: 0,
      startPosition: ZERO_VECTOR,
      endPosition: ZERO_VECTOR,
      bendTarget: null,
      wasPrecision: false,
      detonatedThisDodge: false,
    },
    qCooldownTicksRemaining: 0,
    eCooldownTicksRemaining: 0,
    attackBonusPct: 0,
    attackBonusTicksRemaining: 0,
    emberCores: [],
    afterimages: [],
    guardStacks: 0,
    pursuitTicksRemaining: 0,
    aftershockBonusReady: false,
    mirrorStanceTicksRemaining: 0,
  }
}

const ENCOUNTER_PHASES: readonly EncounterPhase[] = ['encounter1', 'encounter2', 'encounter3', 'encounter4', 'encounter5', 'encounter6']

function draftOptions(seed: string, draftIndex: number, selected: readonly import('./types.js').MarkId[]): readonly import('./types.js').MarkId[] {
  if (draftIndex === 0) return ['ember-core', 'precision-afterimage', 'charged-retaliation']
  const occupiedSlots = new Set(selected.map((id) => markDef(id).slot).filter((slot) => slot !== null))
  const eligible = MARKS.filter((mark) => !selected.includes(mark.id) && (mark.requires === null || selected.includes(mark.requires)) && (mark.slot === null || !occupiedSlots.has(mark.slot)))
  return createRng(seed).fork(`draft-${draftIndex}`).shuffle(eligible.map((mark) => mark.id)).slice(0, 3)
}

/**
 * 建立一局的初始狀態：seed 決定一切（含遭遇戰內敵人的攻擊時機抖動，見 enemy.ts 的
 * `spawnEncounter()`——那是全局唯一使用 RNG 的地方，且只在建立當下用一次，結果立刻
 * 烘焙成普通數字，`tick()` 本身完全不消耗任何隨機性）。同一個 seed 呼叫 `createRun`
 * 永遠得到逐欄位相同的初始狀態。
 */
export function createRun(seed: string): GameState {
  if (seed.length === 0) throw new Error('seed 不得為空字串')
  const rng = createRng(seed)
  return {
    seed,
    tick: 0,
    phase: 'encounter1',
    encounterIndex: 0,
    selectedMark: null,
    selectedMarks: [],
    draftOptions: [],
    player: initialPlayer(),
    enemies: spawnEncounter(0, rng.fork('encounter-0')),
    previousInput: neutralInput(),
    events: [],
  }
}

function allDefeated(enemies: readonly EnemyState[]): boolean {
  return enemies.length > 0 && enemies.every((enemy) => enemy.hp <= 0)
}

/**
 * 唯一的邏輯推進入口。`state` 與回傳值都是完全序列化友善的純資料——沒有任何
 * mutable 的 Rng 或 closure 藏在裡面，因此可以直接拿兩次獨立呼叫的結果做
 * `toEqual` 逐欄位比較（見 determinism.test.ts）。
 */
export function tick(state: GameState, input: TickInput): GameState {
  if (input.restart) {
    return createRun(state.seed)
  }

  if (state.phase === 'victory' || state.phase === 'defeat') {
    // 終局狀態：只有 restart 能離開，其餘輸入不再推進戰鬥邏輯。
    return { ...state, tick: state.tick + 1, previousInput: input, events: [] }
  }

  if (state.phase === 'draft') {
    if (input.draftChoice === null) {
      return { ...state, tick: state.tick + 1, previousInput: input, events: [] }
    }
    if (!state.draftOptions.includes(input.draftChoice)) return { ...state, tick: state.tick + 1, previousInput: input, events: [] }
    const rng = createRng(state.seed)
    const selectedMarks = [...state.selectedMarks, input.draftChoice]
    const nextIndex = state.encounterIndex + 1
    const enteringBoss = nextIndex >= ENCOUNTERS.length
    return {
      ...state,
      tick: state.tick + 1,
      phase: enteringBoss ? 'boss' : ENCOUNTER_PHASES[nextIndex]!,
      encounterIndex: nextIndex,
      selectedMark: input.draftChoice,
      selectedMarks,
      draftOptions: [],
      enemies: enteringBoss ? spawnBoss(rng.fork('boss')) : spawnEncounter(nextIndex, rng.fork(`encounter-${nextIndex}`)),
      previousInput: input,
      events: [{ type: 'markSelected', markId: input.draftChoice }],
    }
  }

  // 一般遭遇或 Boss：先解算玩家主動行動，再解算敵人時序，
  // 確保「這一 tick 剛觸發的閃避無敵幀」在同一 tick 內就能保護玩家（見 combat.ts
  // 與 enemy.ts 模組頂端註解的處理順序說明）。
  const playerResult = resolvePlayerTick(
    state.player,
    state.enemies,
    input,
    state.previousInput,
    state.selectedMarks.length > 0 ? state.selectedMarks : state.selectedMark === null ? [] : [state.selectedMark],
  )
  const enemyResult = advanceEnemies(
    playerResult.enemies,
    playerResult.player,
    state.selectedMarks.length > 0 ? state.selectedMarks : state.selectedMark === null ? [] : [state.selectedMark],
  )
  const events: GameEvent[] = [...playerResult.events, ...enemyResult.events]

  if (enemyResult.player.hp <= 0) {
    return {
      ...state,
      tick: state.tick + 1,
      phase: 'defeat',
      player: enemyResult.player,
      enemies: enemyResult.enemies,
      previousInput: input,
      events: [...events, { type: 'defeat' }],
    }
  }

  if (allDefeated(enemyResult.enemies)) {
    if (state.phase === 'boss') {
      return { ...state, tick: state.tick + 1, phase: 'victory', player: enemyResult.player, enemies: enemyResult.enemies, previousInput: input, events: [...events, { type: 'victory' }] }
    }
    const encounter = ENCOUNTERS[state.encounterIndex]
    if (encounter === undefined) throw new Error(`不存在的遭遇索引 ${state.encounterIndex}`)
    const zoneEnd = state.encounterIndex % 2 === 1
    const zoneHeal = zoneEnd ? (ZONE_CLEAR_HEALS[Math.floor(state.encounterIndex / 2)] ?? 0) : 0
    const healedHp = Math.min(PLAYER_MAX_HP, enemyResult.player.hp + zoneHeal)
    return {
      ...state,
      tick: state.tick + 1,
      phase: 'draft',
      player: { ...enemyResult.player, hp: healedHp },
      enemies: enemyResult.enemies,
      draftOptions: draftOptions(state.seed, state.encounterIndex, state.selectedMarks),
      previousInput: input,
      events: [...events, { type: 'encounterCleared', encounter: encounter.id }, { type: 'draftOffered' }],
    }
  }

  return {
    ...state,
    tick: state.tick + 1,
    player: enemyResult.player,
    enemies: enemyResult.enemies,
    previousInput: input,
    events,
  }
}
