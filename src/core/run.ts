/**
 * 頂層執行狀態機：`createRun(seed)` 建立初始狀態，`tick(state, input)` 是唯一的
 * 邏輯推進入口——固定步長、純函式、輸入是資料不是事件（硬規定 2、4）。
 *
 * 階段：encounter1 → draft → encounter2 → victory | defeat。
 * 任一階段收到 `input.restart` 都會立刻跳回全新的 encounter1（見 types.ts 對
 * `TickInput.restart` 的說明：這是 Vertical Slice 專用的快速重開，不是正式功能）。
 *
 * ⚠️ 誠實揭露（Studio Head 2026-07-31 指示需記錄）：遭遇 2（焰奴×2＋影刺客×1）
 * 本來就比遭遇 1（焰奴×1）難。玩家在遭遇 2 的體感強度變化，一部分來自敵人數量
 * 與種類增加，不是全部歸功於三選一選到的印記——這不是乾淨的 A/B 對照組，Gate 3
 * 試玩回饋時請留意這一點，不要把「感覺變強了」直接等同於「印記改寫證明有效」。
 */
import { createRng } from '@rogue-paradise/rng'
import { resolvePlayerTick } from './combat.js'
import { PLAYER_MAX_HP } from './constants.js'
import { ZONE_1_CLEAR_HEAL_HP } from './content.js'
import { advanceEnemies, spawnEncounter } from './enemy.js'
import {
  neutralInput,
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
  }
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
    selectedMark: null,
    player: initialPlayer(),
    enemies: spawnEncounter('z1-e1', rng.fork('encounter1')),
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
    const rng = createRng(state.seed)
    return {
      ...state,
      tick: state.tick + 1,
      phase: 'encounter2',
      selectedMark: input.draftChoice,
      enemies: spawnEncounter('z1-e2', rng.fork('encounter2')),
      previousInput: input,
      events: [{ type: 'markSelected', markId: input.draftChoice }],
    }
  }

  // phase === 'encounter1' | 'encounter2'：先解算玩家主動行動，再解算敵人時序，
  // 確保「這一 tick 剛觸發的閃避無敵幀」在同一 tick 內就能保護玩家（見 combat.ts
  // 與 enemy.ts 模組頂端註解的處理順序說明）。
  const playerResult = resolvePlayerTick(
    state.player,
    state.enemies,
    input,
    state.previousInput,
    state.selectedMark,
  )
  const enemyResult = advanceEnemies(
    playerResult.enemies,
    playerResult.player,
    state.selectedMark === 'charged-retaliation',
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
    if (state.phase === 'encounter1') {
      return {
        ...state,
        tick: state.tick + 1,
        phase: 'draft',
        player: enemyResult.player,
        enemies: enemyResult.enemies,
        previousInput: input,
        events: [...events, { type: 'encounterCleared', encounter: 'z1-e1' }, { type: 'draftOffered' }],
      }
    }
    // 遭遇 2（本切片範圍內戰區一的最後一場）清空 = 戰區清空，套用
    // content/zones.json 的 zone_clear_heal_hp。
    const healedHp = Math.min(PLAYER_MAX_HP, enemyResult.player.hp + ZONE_1_CLEAR_HEAL_HP)
    return {
      ...state,
      tick: state.tick + 1,
      phase: 'victory',
      player: { ...enemyResult.player, hp: healedHp },
      enemies: enemyResult.enemies,
      previousInput: input,
      events: [...events, { type: 'encounterCleared', encounter: 'z1-e2' }, { type: 'victory' }],
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
