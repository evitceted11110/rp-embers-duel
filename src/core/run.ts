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
import { advanceEnemies } from './enemy.js'
import { DEFAULT_FORGE, applyForgeCard, forgeChoices } from './forge.js'
import { classCard, classDraftOptions, resonanceFor, type ClassId } from './class-expansion.js'
import { advanceWaveTelegraph, announceNextWave, createEncounterDirector, hasRemainingWaves, isBossRoom, spawnOpeningWave } from './encounter-director.js'
import {
  neutralInput,
  type EncounterPhase,
  type GameEvent,
  type GameState,
  type PlayerState,
  type EnemyState,
  type TickInput,
} from './types.js'
import { distance, sub, ZERO_VECTOR } from './vector.js'

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
    classObjects: { forgeNail: null, shadowLine: null },
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
export function createRun(seed: string, classId: ClassId | null = null): GameState {
  if (seed.length === 0) throw new Error('seed 不得為空字串')
  const director = createEncounterDirector(0)
  const opening = spawnOpeningWave(director, seed, ZERO_VECTOR)
  return {
    seed,
    tick: 0,
    phase: 'draft',
    encounterIndex: -1,
    selectedMark: null,
    selectedMarks: [],
    forge: DEFAULT_FORGE,
    draftOptions: classId === null ? ['ember-core', 'precision-afterimage', 'charged-retaliation'] : [],
    forgeOptions: classId === null ? forgeChoices(DEFAULT_FORGE).map((card) => card.id) : classDraftOptions(seed, classId, 0, []),
    classId,
    selectedClassCards: [],
    resonanceLog: [],
    player: initialPlayer(),
    enemies: opening.enemies,
    encounterDirector: opening.director,
    previousInput: neutralInput(),
    events: [],
  }
}

function allDefeated(enemies: readonly EnemyState[]): boolean {
  return enemies.length > 0 && enemies.every((enemy) => enemy.hp <= 0)
}

/** 將三槽鍛造映射到既有、已驗證的動作幾何；舊印記不再由 draft 直接授予。 */
function forgeMarks(forge: GameState['forge']): readonly import('./types.js').MarkId[] {
  const marks: import('./types.js').MarkId[] = []
  if (forge.attack.core === 'spinning-ember') marks.push('cracking-flame-combo')
  if (forge.attack.extensions.includes('double-reversal')) marks.push('bulwark-chain')
  if (forge.q.core === 'ember-core-forge') marks.push('ember-core')
  if (forge.q.extensions.includes('dual-core')) marks.push('twin-core-resonance')
  if (forge.q.extensions.includes('resonance')) marks.push('ember-sacrifice')
  if (forge.e.core === 'mirror-stance') marks.push('mirror-plating', 'charged-retaliation')
  if (forge.e.extensions.includes('stored-shock')) marks.push('aftershock-shield')
  return marks
}

/**
 * 唯一的邏輯推進入口。`state` 與回傳值都是完全序列化友善的純資料——沒有任何
 * mutable 的 Rng 或 closure 藏在裡面，因此可以直接拿兩次獨立呼叫的結果做
 * `toEqual` 逐欄位比較（見 determinism.test.ts）。
 */
export function tick(state: GameState, input: TickInput): GameState {
  if (input.restart) {
    return createRun(state.seed, state.classId)
  }

  if (state.phase === 'victory' || state.phase === 'defeat') {
    // 終局狀態：只有 restart 能離開，其餘輸入不再推進戰鬥邏輯。
    return { ...state, tick: state.tick + 1, previousInput: input, events: [] }
  }

  if (state.phase === 'draft') {
    if (state.classId !== null && input.forgeChoice !== null && state.forgeOptions.includes(input.forgeChoice)) {
      const card = classCard(input.forgeChoice)
      if (card === undefined || card.classId !== state.classId || state.selectedClassCards.includes(card.id)) return { ...state, tick: state.tick + 1, previousInput: input, events: [] }
      const selectedClassCards = [...state.selectedClassCards, card.id]
      const resonances = resonanceFor(state.classId, selectedClassCards)
      const newlyAvailable = resonances.filter((name) => !state.resonanceLog.includes(name))
      const nextIndex = state.encounterIndex + 1
      const director = createEncounterDirector(nextIndex)
      const opening = spawnOpeningWave(director, state.seed, state.player.position)
      return { ...state, tick: state.tick + 1, phase: isBossRoom(nextIndex) ? 'boss' : ENCOUNTER_PHASES[nextIndex]!, encounterIndex: nextIndex, selectedClassCards, resonanceLog: [...state.resonanceLog, ...newlyAvailable], forgeOptions: [], draftOptions: [], enemies: opening.enemies, encounterDirector: opening.director, previousInput: input, events: [{ type: 'classCardSelected', cardId: card.id, classId: state.classId }, ...newlyAvailable.map((resonance) => ({ type: 'resonanceAvailable' as const, classId: state.classId!, resonance }))] }
    }
    if (input.forgeChoice !== null && state.forgeOptions.includes(input.forgeChoice)) {
      const forge = applyForgeCard(state.forge, input.forgeChoice)
      const nextIndex = state.encounterIndex + 1
      const director = createEncounterDirector(nextIndex)
      const opening = spawnOpeningWave(director, state.seed, state.player.position)
      return { ...state, tick: state.tick + 1, phase: isBossRoom(nextIndex) ? 'boss' : ENCOUNTER_PHASES[nextIndex]!, encounterIndex: nextIndex, forge, forgeOptions: [], draftOptions: [], enemies: opening.enemies, encounterDirector: opening.director, previousInput: input, events: [] }
    }
    if (input.draftChoice === null) {
      return { ...state, tick: state.tick + 1, previousInput: input, events: [] }
    }
    if (!state.draftOptions.includes(input.draftChoice)) return { ...state, tick: state.tick + 1, previousInput: input, events: [] }
    const selectedMarks = [...state.selectedMarks, input.draftChoice]
    const nextIndex = state.encounterIndex + 1
    const enteringBoss = isBossRoom(nextIndex)
    const director = createEncounterDirector(nextIndex)
    const opening = spawnOpeningWave(director, state.seed, state.player.position)
    return {
      ...state,
      tick: state.tick + 1,
      phase: enteringBoss ? 'boss' : ENCOUNTER_PHASES[nextIndex]!,
      encounterIndex: nextIndex,
      selectedMark: input.draftChoice,
      selectedMarks,
      draftOptions: [],
      forgeOptions: [],
      enemies: opening.enemies,
      encounterDirector: opening.director,
      previousInput: input,
      events: [{ type: 'markSelected', markId: input.draftChoice }],
    }
  }

  // 波次只在前一波完全清除後才進場；預告期內不推進敵方 AI，避免「瞬間包圍」。
  if (state.enemies.length === 0 && state.encounterDirector.telegraphs.length > 0) {
    const advanced = advanceWaveTelegraph(state.encounterDirector, state.seed)
    if (advanced === null) throw new Error('波次預告狀態不一致')
    return { ...state, tick: state.tick + 1, encounterDirector: advanced.director, enemies: advanced.enemies, previousInput: input, events: advanced.events }
  }

  // 一般遭遇或 Boss：先解算玩家主動行動，再解算敵人時序，
  // 確保「這一 tick 剛觸發的閃避無敵幀」在同一 tick 內就能保護玩家（見 combat.ts
  // 與 enemy.ts 模組頂端註解的處理順序說明）。
  const forgeIsDefault = state.forge.attack.core === 'mercenary-blade' && state.forge.q.core === 'cinder-dash' && state.forge.e.core === 'breakline-shock' && state.forge.attack.extensions.length === 0 && state.forge.q.extensions.length === 0 && state.forge.e.extensions.length === 0
  const activeMarks = forgeIsDefault ? (state.selectedMarks.length > 0 ? state.selectedMarks : state.selectedMark === null ? [] : [state.selectedMark]) : forgeMarks(state.forge)
  const playerResult = resolvePlayerTick(
    state.player,
    state.enemies,
    input,
    state.previousInput,
    activeMarks,
    state.classId,
    state.selectedClassCards,
  )
  const enemyResult = advanceEnemies(
    playerResult.enemies,
    playerResult.player,
    activeMarks,
  )
  let resolvedPlayer = enemyResult.player
  let resolvedEnemies = enemyResult.enemies
  const resonanceEvents: GameEvent[] = []

  // 熔衛的第一條完整因果：第三段把敵人壓進爐釘，E 架勢真的擋到攻擊，
  // 才由釘周圍向外反震。這裡刻意不以隱藏傷害倍率替代位置與格擋條件。
  // 反震不是遠端遙控：施放時必須站在防區、朝向爐釘，且真的格擋過攻擊。
  const nail = resolvedPlayer.classObjects.forgeNail
  const sealNail = resolvedPlayer.classObjects.sealNail
  // 鐵幕回收是與反壓爐鳴可併存的 E 管線。實際位移放在封口資格判定之後，
  // 避免它先把熔鏈外敵人拉進鏈內而把「熔鏈外」錯誤變成成功。
  const ironCurtainArmed =
    state.classId === 'forgeguard' &&
    state.selectedClassCards.includes('iron-curtain-recall') &&
    playerResult.events.some((event) => event.type === 'eCast')
  const forgeguardResonanceArmed =
    state.classId === 'forgeguard' &&
    state.selectedClassCards.includes('bulwark-hammer') &&
    state.selectedClassCards.includes('pressure-furnace-roar') &&
    playerResult.events.some((event) => event.type === 'eCast')
  const didBlock = enemyResult.events.some((event) => event.type === 'playerBlocked')
  // 記住格擋命中瞬間的受壓位置。鐵幕的中點收束是同 tick 的先行管線，
  // 不能反過來改寫反壓反震應以何處為中心向外推出的終態。
  const pressuredOrigins = nail === null
    ? []
    : nail.pressuredEnemyIds.map((id) => {
      const enemy = resolvedEnemies.find((candidate) => candidate.id === id)
      return enemy === undefined ? null : { id, position: enemy.position }
    }).filter((entry): entry is { readonly id: string; readonly position: { readonly x: number; readonly y: number } } => entry !== null)

  // 鐵幕先收束、反壓後反震：兩張 E 卡在同一次有效格擋都要各自留下結果，
  // 但最後位置仍由反壓反震決定，避免後續回收覆寫它的終態。若封口已建立，
  // 則交給封口回收獨占中點位置，不能把合法熔鏈結果又拉向玩家。
  if (ironCurtainArmed && nail !== null && sealNail === undefined && didBlock) {
    const targetIds = nail.pressuredEnemyIds.filter((id) => resolvedEnemies.some((enemy) => enemy.id === id && enemy.hp > 0))
    if (targetIds.length > 0) {
      const midpoint = { x: (nail.position.x + resolvedPlayer.position.x) / 2, y: (nail.position.y + resolvedPlayer.position.y) / 2 }
      resolvedEnemies = resolvedEnemies.map((enemy) => targetIds.includes(enemy.id)
        ? { ...enemy, position: midpoint, velocity: { x: 0, y: 0 }, locomotion: 'recover' }
        : enemy)
      resonanceEvents.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'iron-curtain-recall', effect: '鐵幕收束', targetIds })
    }
  }
  if (forgeguardResonanceArmed && nail !== null) {
    const offsetToNail = sub(nail.position, resolvedPlayer.position)
    const inDefenseZone = distance(resolvedPlayer.position, nail.position) <= 2.4
    const facingNail = offsetToNail.x * resolvedPlayer.facing.x + offsetToNail.y * resolvedPlayer.facing.y >= 0.6
    const targetIds = nail.pressuredEnemyIds.filter((id) => resolvedEnemies.some((enemy) => enemy.id === id && enemy.hp > 0))
    if (!inDefenseZone) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '防區反震', reason: '防區外' })
    } else if (!facingNail) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '防區反震', reason: '未面向爐釘' })
    } else if (targetIds.length === 0) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '防區反震', reason: '未受壓' })
    } else if (!didBlock) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '防區反震', reason: '未成功格擋' })
    } else {
      resolvedEnemies = resolvedEnemies.map((enemy) => {
        if (!targetIds.includes(enemy.id)) return enemy
        const origin = pressuredOrigins.find((entry) => entry.id === enemy.id)?.position ?? enemy.position
        const dx = origin.x - nail.position.x
        const dy = origin.y - nail.position.y
        const magnitude = Math.hypot(dx, dy) || 1
        return { ...enemy, position: { x: nail.position.x + dx / magnitude * 3.1, y: nail.position.y + dy / magnitude * 3.1 }, velocity: { x: 0, y: 0 }, locomotion: 'recover' }
      })
      resolvedPlayer = { ...resolvedPlayer, classObjects: { ...resolvedPlayer.classObjects, forgeNail: { ...nail, pressuredEnemyIds: [] } } }
      resonanceEvents.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'pressure-furnace-roar', effect: '反壓反震', targetIds })
      resonanceEvents.push({ type: 'resonanceResolved', classId: 'forgeguard', resonance: '防區反震', targetIds })
    }
  }

  // 第二條熔衛因果：第二枚釘封住可見熔鏈，成功格擋才把「已受壓且仍在鏈內」的敵人
  // 拉回兩釘中點。沒有雙釘、錯站位、沒有受壓或空格擋均留下可重播的原因。
  const sealArmed =
    state.classId === 'forgeguard' &&
    state.selectedClassCards.includes('double-nail-seal') &&
    state.selectedClassCards.includes('iron-curtain-recall') &&
    input.skillE && !state.previousInput.skillE
  if (sealArmed) {
    if (nail === null || sealNail === undefined) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '封口回收', reason: '缺少雙釘' })
    } else {
      const chain = sub(sealNail.position, nail.position)
      const chainLengthSquared = chain.x * chain.x + chain.y * chain.y
      const targetIds = nail.pressuredEnemyIds.filter((id) => {
        const enemy = resolvedEnemies.find((candidate) => candidate.id === id && candidate.hp > 0)
        if (enemy === undefined || chainLengthSquared <= 0.0001) return false
        const offset = sub(enemy.position, nail.position)
        const t = Math.max(0, Math.min(1, (offset.x * chain.x + offset.y * chain.y) / chainLengthSquared))
        const closest = { x: nail.position.x + chain.x * t, y: nail.position.y + chain.y * t }
        return distance(enemy.position, closest) <= 0.7
      })
      const didBlock = enemyResult.events.some((event) => event.type === 'playerBlocked')
      if (targetIds.length === 0) {
        const hasPressure = nail.pressuredEnemyIds.some((id) => resolvedEnemies.some((enemy) => enemy.id === id && enemy.hp > 0))
        resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '封口回收', reason: hasPressure ? '熔鏈外' : '未受壓' })
      } else if (!didBlock) {
        resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '封口回收', reason: '未成功格擋' })
      } else {
        const midpoint = { x: (nail.position.x + sealNail.position.x) / 2, y: (nail.position.y + sealNail.position.y) / 2 }
        resolvedEnemies = resolvedEnemies.map((enemy) => targetIds.includes(enemy.id)
          ? { ...enemy, position: midpoint, velocity: { x: 0, y: 0 }, locomotion: 'recover' }
          : enemy)
        resolvedPlayer = { ...resolvedPlayer, classObjects: { ...resolvedPlayer.classObjects, forgeNail: { ...nail, pressuredEnemyIds: [] } } }
        resonanceEvents.push({ type: 'resonanceResolved', classId: 'forgeguard', resonance: '封口回收', targetIds })
      }
    }
  }

  // 第三條熔衛因果：楔擊先在地上留下不可轉身承諾的裂盾點，成功格擋後才可用
  // 玩家當下方向繞釘轉掃。沒有楔點或空格擋一律保留具體原因，絕不補隱藏傷害。
  const pivotArmed =
    state.classId === 'forgeguard' &&
    state.selectedClassCards.includes('shield-wedge') &&
    state.selectedClassCards.includes('corner-pivot') &&
    input.skillE && !state.previousInput.skillE
  const cornerPivotCast =
    state.classId === 'forgeguard' &&
    state.selectedClassCards.includes('corner-pivot') &&
    playerResult.events.some((event) => event.type === 'eCast')
  // 守角轉軸不是裂盾楔擊的隱藏附屬品。單獨取得時，成功格擋仍繞玩家留下
  // 可觀察轉掃；若周遭沒有可掃的敵人，明確記錄拒絕原因。與楔擊同持則交由
  // 下方楔點因果接管，避免同一張卡在一個 E tick 重複結算。
  if (cornerPivotCast && !state.selectedClassCards.includes('shield-wedge') && didBlock) {
    const targetIds = resolvedEnemies
      .filter((enemy) => enemy.hp > 0 && distance(enemy.position, resolvedPlayer.position) <= 1.7)
      .map((enemy) => enemy.id)
    if (targetIds.length === 0) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '楔點轉掃', reason: '轉掃無目標' })
    } else {
      const sweepDirection = resolvedPlayer.facing
      resolvedEnemies = resolvedEnemies.map((enemy) => targetIds.includes(enemy.id)
        ? { ...enemy, position: { x: resolvedPlayer.position.x + sweepDirection.x * 2, y: resolvedPlayer.position.y + sweepDirection.y * 2 }, velocity: { x: 0, y: 0 }, locomotion: 'recover' }
        : enemy)
      resolvedPlayer = { ...resolvedPlayer, classObjects: { ...resolvedPlayer.classObjects, pivotSweep: { position: resolvedPlayer.position, direction: sweepDirection, ticksRemaining: 16 } } }
      resonanceEvents.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'corner-pivot', effect: '守角轉掃', targetIds })
    }
  }
  if (pivotArmed) {
    const breach = resolvedPlayer.classObjects.breachPoint
    if (breach === undefined) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '楔點轉掃', reason: '缺少裂盾點' })
    } else if (!didBlock) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '楔點轉掃', reason: '未成功格擋' })
    } else {
      const targetIds = resolvedEnemies
        .filter((enemy) => enemy.hp > 0 && distance(enemy.position, breach.position) <= 1.45)
        .map((enemy) => enemy.id)
      if (targetIds.length === 0) {
        resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '楔點轉掃', reason: '轉掃無目標' })
      } else {
        // 移動／瞄準決定掃向：同一楔點可轉向不同側，代價是格擋完成前沒有即時正面震波。
        const sweepDirection = resolvedPlayer.facing
        resolvedEnemies = resolvedEnemies.map((enemy) => targetIds.includes(enemy.id)
          ? { ...enemy, position: { x: breach.position.x + sweepDirection.x * 2.2, y: breach.position.y + sweepDirection.y * 2.2 }, velocity: { x: 0, y: 0 }, locomotion: 'recover' }
          : enemy)
        resolvedPlayer = { ...resolvedPlayer, classObjects: { ...resolvedPlayer.classObjects, breachPoint: undefined, pivotSweep: { position: breach.position, direction: sweepDirection, ticksRemaining: 16 } } }
        resonanceEvents.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'corner-pivot', effect: '守角轉掃', targetIds })
        resonanceEvents.push({ type: 'resonanceResolved', classId: 'forgeguard', resonance: '楔點轉掃', targetIds })
      }
    }
  }

  // 第四條熔衛因果：定錨回擊先在場上留下火索，之後真的讀到一記格擋才可用
  // 熔鎖退讓沿索回到爐釘，同時鎖住撤離線上的敵人。沒有火索就只是 E 格擋，
  // 不把「回防」藏成免費瞬移。
  const moltenCast =
    state.classId === 'forgeguard' &&
    state.selectedClassCards.includes('molten-lock-retreat') &&
    playerResult.events.some((event) => event.type === 'eCast')
  if (moltenCast && nail !== null && didBlock) {
    const retreatStart = resolvedPlayer.position
    const retreatEnd = nail.position
    const segment = sub(retreatEnd, retreatStart)
    const lengthSquared = segment.x * segment.x + segment.y * segment.y
    const targetIds = resolvedEnemies.filter((enemy) => {
      if (enemy.hp <= 0) return false
      const offset = sub(enemy.position, retreatStart)
      const t = lengthSquared <= 0.0001 ? 0 : Math.max(0, Math.min(1, (offset.x * segment.x + offset.y * segment.y) / lengthSquared))
      const closest = { x: retreatStart.x + segment.x * t, y: retreatStart.y + segment.y * t }
      return distance(enemy.position, closest) <= 0.62
    }).map((enemy) => enemy.id)
    resolvedEnemies = resolvedEnemies.map((enemy) => targetIds.includes(enemy.id)
      ? { ...enemy, velocity: { x: 0, y: 0 }, locomotion: 'recover' }
      : enemy)
    resolvedPlayer = { ...resolvedPlayer, position: retreatEnd, classObjects: { ...resolvedPlayer.classObjects, moltenLock: { start: retreatStart, end: retreatEnd, ticksRemaining: 18 } } }
    resonanceEvents.push({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'molten-lock-retreat', effect: '熔鎖退讓', targetIds })
  }
  const tetherRetreatArmed =
    state.classId === 'forgeguard' &&
    state.selectedClassCards.includes('anchored-riposte') &&
    state.selectedClassCards.includes('molten-lock-retreat') &&
    input.skillE && !state.previousInput.skillE
  if (tetherRetreatArmed) {
    const tether = resolvedPlayer.classObjects.forgeTether
    if (tether === undefined) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '錨索退讓', reason: '缺少火索' })
    } else if (nail === null) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '錨索退讓', reason: '缺少爐釘' })
    } else if (!didBlock) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'forgeguard', resonance: '錨索退讓', reason: '未成功格擋' })
    } else {
      const targetIds = resolvedEnemies.filter((enemy) => enemy.hp > 0 && distance(enemy.position, tether.start) <= distance(tether.start, tether.end) + 0.7).map((enemy) => enemy.id)
      resonanceEvents.push({ type: 'resonanceResolved', classId: 'forgeguard', resonance: '錨索退讓', targetIds })
    }
  }

  // 第二條影線因果：必須自己先維持兩條短命線，再用回身割裂抵達第一條終點；
  // 只有標定目標位於折返線可及處時，才會發生可見的折返處刑。
  const returnArmed =
    state.classId === 'shadowline-hunter' &&
    state.selectedClassCards.includes('double-line-return') &&
    state.selectedClassCards.includes('returning-rend') &&
    input.skillE && !state.previousInput.skillE
  if (returnArmed) {
    const mainLine = resolvedPlayer.classObjects.shadowLine
    const returnLine = resolvedPlayer.classObjects.returnLine
    const cast = playerResult.events.some((event) => event.type === 'eCast')
    if (returnLine === undefined) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'shadowline-hunter', resonance: '折返處刑', reason: '缺少折返線' })
    } else if (!cast || mainLine === null || distance(resolvedPlayer.position, mainLine.end) > 0.15) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'shadowline-hunter', resonance: '折返處刑', reason: '錯誤落點' })
    } else {
      const targetIds = [...new Set([...mainLine.markedEnemyIds, ...returnLine.markedEnemyIds])]
        .filter((id) => resolvedEnemies.some((enemy) => enemy.id === id && enemy.hp > 0))
      if (targetIds.length === 0) {
        resonanceEvents.push({ type: 'resonanceRejected', classId: 'shadowline-hunter', resonance: '折返處刑', reason: '無標定目標' })
      } else {
        resolvedEnemies = resolvedEnemies.map((enemy) => targetIds.includes(enemy.id)
          ? { ...enemy, position: returnLine.end, velocity: { x: 0, y: 0 }, locomotion: 'recover' }
          : enemy)
        resonanceEvents.push({ type: 'resonanceResolved', classId: 'shadowline-hunter', resonance: '折返處刑', targetIds })
      }
    }
  }

  // 第三條影線因果：先以逆標吊點把「正在預兆」的敵人變成危險線端，再用斷端落刃
  // 落到它身上並留下回走線。吊點不是免費傳送：沒有預兆、未落於吊點都會失敗。
  const anchorEscapeArmed =
    state.classId === 'shadowline-hunter' &&
    state.selectedClassCards.includes('reverse-mark-anchor') &&
    state.selectedClassCards.includes('terminal-drop') &&
    input.skillE && !state.previousInput.skillE
  if (anchorEscapeArmed) {
    const line = state.player.classObjects.shadowLine
    const anchorId = line?.anchorEnemyId
    const anchorBeforeEnemyStep = anchorId === undefined ? undefined : state.enemies.find((enemy) => enemy.id === anchorId && enemy.hp > 0)
    const cast = playerResult.events.some((event) => event.type === 'eCast')
    if (line === null || anchorId === undefined || anchorBeforeEnemyStep === undefined) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'shadowline-hunter', resonance: '吊點脫身', reason: '缺少危險吊點' })
    } else if (anchorBeforeEnemyStep.attackState !== 'telegraph') {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'shadowline-hunter', resonance: '吊點脫身', reason: '吊點未預兆' })
    } else if (!cast || distance(resolvedPlayer.position, anchorBeforeEnemyStep.position) > 0.15) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'shadowline-hunter', resonance: '吊點脫身', reason: '未落於吊點' })
    } else {
      resonanceEvents.push({ type: 'resonanceResolved', classId: 'shadowline-hunter', resonance: '吊點脫身', targetIds: [anchorId] })
    }
  }

  // 第四條影線因果：釘身換位把「自己剛穿過誰」留在主線上；只有第二條線尚在，
  // 跨線借位才可把這次交換接成穿群逃離。這是位置交換＋預先布線，不是隱藏傷害。
  const bodySwapBorrowArmed =
    state.classId === 'shadowline-hunter' &&
    state.selectedClassCards.includes('pinned-body-swap') &&
    state.selectedClassCards.includes('cross-line-borrow') &&
    input.skillE && !state.previousInput.skillE
  if (bodySwapBorrowArmed) {
    const line = resolvedPlayer.classObjects.shadowLine
    const secondLine = resolvedPlayer.classObjects.returnLine
    const didBorrow = playerResult.events.some((event) => event.type === 'classEffectResolved' && event.cardId === 'cross-line-borrow')
    if (line === null || line.swappedEnemyId === undefined) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'shadowline-hunter', resonance: '交線換身', reason: '缺少換位殘切' })
    } else if (secondLine?.kind !== 'double-line') {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'shadowline-hunter', resonance: '交線換身', reason: '缺少第二線' })
    } else if (!didBorrow) {
      resonanceEvents.push({ type: 'resonanceRejected', classId: 'shadowline-hunter', resonance: '交線換身', reason: '借位失敗' })
    } else {
      resonanceEvents.push({ type: 'resonanceResolved', classId: 'shadowline-hunter', resonance: '交線換身', targetIds: [line.swappedEnemyId] })
    }
  }
  const events: GameEvent[] = [...playerResult.events, ...enemyResult.events, ...resonanceEvents]

  if (enemyResult.player.hp <= 0) {
    return {
      ...state,
      tick: state.tick + 1,
      phase: 'defeat',
      player: resolvedPlayer,
      enemies: resolvedEnemies,
      previousInput: input,
      events: [...events, { type: 'defeat' }],
    }
  }

  if (allDefeated(resolvedEnemies)) {
    if (hasRemainingWaves(state.encounterDirector)) {
      const announced = announceNextWave(state.encounterDirector, state.seed, resolvedPlayer.position)
      return { ...state, tick: state.tick + 1, player: resolvedPlayer, enemies: [], encounterDirector: announced.director, previousInput: input, events: [...events, ...announced.events] }
    }
    if (state.phase === 'boss') {
      if (state.encounterIndex === 5) {
        return { ...state, tick: state.tick + 1, phase: 'victory', player: resolvedPlayer, enemies: resolvedEnemies, previousInput: input, events: [...events, { type: 'bossCleared', room: 6 }, { type: 'victory' }] }
      }
      return {
        ...state, tick: state.tick + 1, phase: 'draft', player: resolvedPlayer, enemies: resolvedEnemies,
        draftOptions: state.classId === null ? draftOptions(state.seed, state.encounterIndex, state.selectedMarks) : [], previousInput: input,
        forgeOptions: state.classId === null ? forgeChoices(state.forge).map((card) => card.id) : classDraftOptions(state.seed, state.classId, state.encounterIndex + 1, state.selectedClassCards),
        events: [...events, { type: 'bossCleared', room: 3 }, { type: 'draftOffered' }],
      }
    }
    const encounter = ENCOUNTERS[state.encounterIndex]
    if (encounter === undefined) throw new Error(`不存在的遭遇索引 ${state.encounterIndex}`)
    const zoneEnd = state.encounterIndex % 2 === 1
    const zoneHeal = zoneEnd ? (ZONE_CLEAR_HEALS[Math.floor(state.encounterIndex / 2)] ?? 0) : 0
    const healedHp = Math.min(PLAYER_MAX_HP, resolvedPlayer.hp + zoneHeal)
    return {
      ...state,
      tick: state.tick + 1,
      phase: 'draft',
      player: { ...resolvedPlayer, hp: healedHp },
      enemies: resolvedEnemies,
      draftOptions: state.classId === null ? draftOptions(state.seed, state.encounterIndex, state.selectedMarks) : [],
      forgeOptions: state.classId === null ? forgeChoices(state.forge).map((card) => card.id) : classDraftOptions(state.seed, state.classId, state.encounterIndex + 1, state.selectedClassCards),
      previousInput: input,
      events: [...events, { type: 'encounterCleared', encounter: encounter.id }, { type: 'draftOffered' }],
    }
  }

  return {
    ...state,
    tick: state.tick + 1,
    player: resolvedPlayer,
    enemies: resolvedEnemies,
    previousInput: input,
    events,
  }
}
