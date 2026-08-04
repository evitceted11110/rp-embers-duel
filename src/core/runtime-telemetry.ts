/**
 * Runtime telemetry 是 crash dump 的純衍生資料：同一份 seed + input log 一定產生
 * 同一份報表。因此它可以用真實遊玩輸入校正 BL-01，但絕不參與戰鬥判定或數值。
 */
import { CLASS_CARDS, type ClassId, type ClassSlot } from './class-expansion.js'
import { replayHistory, type CrashDump } from './crash-dump.js'
import { TICK_SECONDS } from './constants.js'
import type { GameEvent, GameState, TickInput } from './types.js'

export type CardRuntimeTelemetry = Readonly<{
  cardId: string
  slot: ClassSlot
  /** 玩家實際按下該槽位時，該已裝備卡所在槽位收到的輸入次數。 */
  inputAttempts: number
  /** 該槽位真正產生可觀察戰鬥輸出的次數；不是估算傷害。 */
  successfulExecutions: number
  /** 明確失敗（空揮第三段、Q 未施放、E failed）的次數。 */
  failedExecutions: number
  /** 僅在 GameEvent 明列 cardId 時才計入，保留每張卡的直接因果證據。 */
  directEffectResolutions: number
  directEffectTargetCount: number
}>

export type ResonanceRuntimeTelemetry = Readonly<{
  classId: ClassId
  resonance: string
  resolved: number
  rejected: number
  rejectedReasons: Readonly<Record<string, number>>
}>

export type RoomRuntimeTelemetry = Readonly<{
  roomIndex: number
  startedAtTick: number
  endedAtTick: number | null
  elapsedTicks: number
  elapsedSeconds: number
  damageTaken: number
  playerHitCount: number
  enemyDefeats: number
  outcome: 'cleared' | 'defeat' | 'in-progress'
}>

export type RuntimeTelemetry = Readonly<{
  seed: string
  classId: ClassId | null
  inputCount: number
  durationTicks: number
  durationSeconds: number
  outcome: 'victory' | 'defeat' | 'in-progress'
  build: readonly string[]
  availableResonances: readonly string[]
  damageTaken: number
  playerHitCount: number
  deathCount: number
  rooms: readonly RoomRuntimeTelemetry[]
  cards: readonly CardRuntimeTelemetry[]
  resonances: readonly ResonanceRuntimeTelemetry[]
}>

type MutableCard = {
  cardId: string
  slot: ClassSlot
  inputAttempts: number
  successfulExecutions: number
  failedExecutions: number
  directEffectResolutions: number
  directEffectTargetCount: number
}

type MutableResonance = {
  classId: ClassId
  resonance: string
  resolved: number
  rejected: number
  rejectedReasons: Record<string, number>
}

type MutableRoom = {
  roomIndex: number
  startedAtTick: number
  endedAtTick: number | null
  damageTaken: number
  playerHitCount: number
  enemyDefeats: number
  outcome: 'cleared' | 'defeat' | 'in-progress'
}

function actionEdge(input: TickInput, previous: TickInput, slot: ClassSlot): boolean {
  if (slot === 'primary') return input.attack && !previous.attack
  if (slot === 'q') return input.skillQ && !previous.skillQ
  return input.skillE && !previous.skillE
}

function slotExecution(events: readonly GameEvent[], slot: ClassSlot): { readonly success: number; readonly failure: number } {
  if (slot === 'primary') {
    return {
      success: events.filter((event) => event.type === 'comboHit' && event.hitIndex === 3).length,
      failure: events.filter((event) => event.type === 'comboWhiff' && event.geometry.hitIndex === 3).length,
    }
  }
  if (slot === 'q') return { success: events.filter((event) => event.type === 'qCast').length, failure: 0 }
  return {
    success: events.filter((event) => event.type === 'eCast').length,
    failure: events.filter((event) => event.type === 'eFailed').length,
  }
}

function cardTelemetry(cards: Map<string, MutableCard>, state: GameState, input: TickInput, events: readonly GameEvent[]): void {
  if (state.classId === null) return
  const equipped = CLASS_CARDS.filter((card) => card.classId === state.classId && state.selectedClassCards.includes(card.id))
  for (const card of equipped) {
    const metric = cards.get(card.id)
    if (metric === undefined) continue
    if (actionEdge(input, state.previousInput, card.slot)) metric.inputAttempts += 1
    const execution = slotExecution(events, card.slot)
    metric.successfulExecutions += execution.success
    metric.failedExecutions += execution.failure
  }
  for (const event of events) {
    if (event.type !== 'classEffectResolved') continue
    const metric = cards.get(event.cardId)
    if (metric === undefined) continue
    metric.directEffectResolutions += 1
    metric.directEffectTargetCount += event.targetIds.length
  }
}

function resonanceTelemetry(resonances: Map<string, MutableResonance>, events: readonly GameEvent[]): void {
  for (const event of events) {
    if (event.type !== 'resonanceResolved' && event.type !== 'resonanceRejected') continue
    const key = `${event.classId}:${event.resonance}`
    let metric = resonances.get(key)
    if (metric === undefined) {
      metric = { classId: event.classId, resonance: event.resonance, resolved: 0, rejected: 0, rejectedReasons: {} }
      resonances.set(key, metric)
    }
    if (event.type === 'resonanceResolved') metric.resolved += 1
    else {
      metric.rejected += 1
      metric.rejectedReasons[event.reason] = (metric.rejectedReasons[event.reason] ?? 0) + 1
    }
  }
}

function ensureRoom(rooms: Map<number, MutableRoom>, state: GameState): MutableRoom | undefined {
  if (state.encounterIndex < 0) return undefined
  let room = rooms.get(state.encounterIndex)
  if (room === undefined) {
    room = { roomIndex: state.encounterIndex, startedAtTick: state.tick, endedAtTick: null, damageTaken: 0, playerHitCount: 0, enemyDefeats: 0, outcome: 'in-progress' }
    rooms.set(room.roomIndex, room)
  }
  return room
}

/**
 * 從已錄好的真實輸入重播，產出可 JSON 序列化的資料。
 *
 * 同槽的多張卡會共同改寫一次操作；因此 `successfulExecutions` 是「槽位輸出」而
 * 非把傷害猜分給各卡。`directEffectResolutions` 才是事件明示的單卡因果。
 */
export function collectRuntimeTelemetry(dump: CrashDump): RuntimeTelemetry {
  const history = replayHistory(dump)
  const cards = new Map<string, MutableCard>()
  const resonances = new Map<string, MutableResonance>()
  const rooms = new Map<number, MutableRoom>()
  let damageTaken = 0
  let playerHitCount = 0
  let deathCount = 0

  for (let index = 1; index < history.length; index += 1) {
    const before = history[index - 1]!
    const after = history[index]!
    const room = ensureRoom(rooms, after.encounterIndex >= 0 ? after : before)
    if (room !== undefined) {
      for (const event of after.events) {
        if (event.type === 'playerHit') {
          room.damageTaken += event.damage
          room.playerHitCount += 1
          damageTaken += event.damage
          playerHitCount += 1
        }
        if (event.type === 'enemyDefeated') room.enemyDefeats += 1
        if (event.type === 'encounterCleared') {
          room.endedAtTick = after.tick
          room.outcome = 'cleared'
        }
        if (event.type === 'defeat') {
          room.endedAtTick = after.tick
          room.outcome = 'defeat'
          deathCount += 1
        }
      }
    }
    cardTelemetry(cards, before, dump.inputLog[index - 1]!, after.events)
    resonanceTelemetry(resonances, after.events)
    for (const event of after.events) {
      if (event.type !== 'classCardSelected') continue
      const card = CLASS_CARDS.find((candidate) => candidate.id === event.cardId)
      if (card !== undefined && !cards.has(card.id)) {
        cards.set(card.id, { cardId: card.id, slot: card.slot, inputAttempts: 0, successfulExecutions: 0, failedExecutions: 0, directEffectResolutions: 0, directEffectTargetCount: 0 })
      }
    }
  }

  const finalState = history.at(-1)!
  const finalTick = finalState.tick
  return {
    seed: dump.seed,
    classId: dump.classId ?? null,
    inputCount: dump.inputLog.length,
    durationTicks: finalTick,
    durationSeconds: finalTick * TICK_SECONDS,
    outcome: finalState.phase === 'victory' ? 'victory' : finalState.phase === 'defeat' ? 'defeat' : 'in-progress',
    build: [...finalState.selectedClassCards],
    availableResonances: [...finalState.resonanceLog],
    damageTaken,
    playerHitCount,
    deathCount,
    rooms: [...rooms.values()].sort((a, b) => a.roomIndex - b.roomIndex).map((room) => ({
      ...room,
      elapsedTicks: (room.endedAtTick ?? finalTick) - room.startedAtTick,
      elapsedSeconds: ((room.endedAtTick ?? finalTick) - room.startedAtTick) * TICK_SECONDS,
    })),
    cards: [...cards.values()].sort((a, b) => a.cardId.localeCompare(b.cardId)),
    resonances: [...resonances.values()].sort((a, b) => a.resonance.localeCompare(b.resonance)).map((metric) => ({ ...metric, rejectedReasons: { ...metric.rejectedReasons } })),
  }
}
