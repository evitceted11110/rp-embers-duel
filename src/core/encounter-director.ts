/** 決定性波次導演：只產生可序列化資料，絕不把 RNG 或計時器 closure 藏進 GameState。 */
import { createRng } from '@rogue-paradise/rng'
import { ARENA_BOUNDS, clampToArena } from './arena.js'
import { ENCOUNTERS, type EnemyTypeDef } from './content.js'
import { ENEMY_CYCLE_REFERENCE_S, secondsToTicks } from './constants.js'
import { enemyTypeDef } from './enemy.js'
import type { EncounterDirectorState, EnemyKind, EnemyState, GameEvent, SpawnTelegraph } from './types.js'
import type { Vector2 } from './vector.js'

export const MAX_SIMULTANEOUS_ENEMIES = 6
export const WAVE_TELEGRAPH_TICKS = secondsToTicks(1.15)
const SPAWN_DISTANCE = 4.7

function expand(roomIndex: number): EnemyKind[] {
  const encounter = ENCOUNTERS[roomIndex]
  if (encounter === undefined) throw new Error(`不存在的遭遇索引 ${roomIndex}`)
  return encounter.enemies.flatMap((ref) => Array.from({ length: ref.count }, () => ref.kind))
}

/** 普通房永遠拆為 2–3 波；單波上限 8，避免以同屏壓力取代可讀性。 */
function splitWaves(kinds: readonly EnemyKind[]): readonly (readonly EnemyKind[])[] {
  // 第 1 關 12、第五關 18；超額由後續 wave 排隊，絕不以 slice 丟棄。
  const target = kinds.some((kind) => kind === 'bulwark-sentinel') ? 18 : 12
  const swarm = Array.from({ length: target }, (_, index) => kinds[index % kinds.length]!)
  const count = 3
  const waves: EnemyKind[][] = Array.from({ length: count }, () => [])
  for (let i = 0; i < swarm.length; i += 1) waves[i % count]!.push(swarm[i]!)
  return waves.filter((wave) => wave.length > 0).map((wave) => wave.slice(0, MAX_SIMULTANEOUS_ENEMIES))
}

export function isBossRoom(roomIndex: number): boolean {
  return roomIndex === 2 || roomIndex === 5
}

export function createEncounterDirector(roomIndex: number): EncounterDirectorState {
  const boss = isBossRoom(roomIndex)
  return {
    roomIndex,
    boss,
    activeWaveIndex: -1,
    waves: boss ? [['ashen-warlord']] : splitWaves(expand(roomIndex)),
    telegraphTicksRemaining: 0,
    telegraphs: [],
  }
}

function retreatDirection(player: Vector2): Vector2 {
  // 玩家靠近邊界時，優先把怪放在場地內側的反方向，保留一條可撤退通道。
  const xPressure = player.x > ARENA_BOUNDS.right - 3 ? -1 : player.x < ARENA_BOUNDS.left + 3 ? 1 : 0
  const yPressure = player.y > ARENA_BOUNDS.bottom - 2 ? -1 : player.y < ARENA_BOUNDS.top + 2 ? 1 : 0
  return xPressure === 0 && yPressure === 0 ? { x: 1, y: 0 } : { x: xPressure, y: yPressure }
}

function telegraphsFor(seed: string, director: EncounterDirectorState, waveIndex: number, player: Vector2): readonly SpawnTelegraph[] {
  const kinds = director.waves[waveIndex] ?? []
  const rng = createRng(seed).fork(`room-${director.roomIndex}-wave-${waveIndex}`)
  const retreat = retreatDirection(player)
  // 邊界附近若外側沒有足夠空間，寧可從場內側生成；先保住安全環，不能讓 clamp
  // 把出生點壓到角色臉上。中央則仍以預設右側扇區進場。
  const base = Math.atan2(retreat.y, retreat.x)
  return kinds.map((kind, index) => {
    const spread = kinds.length === 1 ? 0 : ((index / (kinds.length - 1)) - 0.5) * 1.6
    const jitter = (rng.fork(`spawn-${index}`).next() - 0.5) * 0.22
    const angle = base + spread + jitter
    return { kind, position: clampToArena({ x: player.x + Math.cos(angle) * SPAWN_DISTANCE, y: player.y + Math.sin(angle) * SPAWN_DISTANCE }) }
  })
}

export function announceNextWave(director: EncounterDirectorState, seed: string, player: Vector2): { director: EncounterDirectorState; events: readonly GameEvent[] } {
  const waveIndex = director.activeWaveIndex + 1
  const telegraphs = telegraphsFor(seed, director, waveIndex, player)
  return {
    director: { ...director, telegraphTicksRemaining: WAVE_TELEGRAPH_TICKS, telegraphs },
    events: [{ type: 'waveTelegraphed', wave: waveIndex + 1, totalWaves: director.waves.length, count: telegraphs.length }],
  }
}

function enemyFromTelegraph(seed: string, director: EncounterDirectorState, waveIndex: number, telegraph: SpawnTelegraph, index: number): EnemyState {
  const def: EnemyTypeDef = enemyTypeDef(telegraph.kind)
  const intervalTicks = secondsToTicks(def.attackIntervalCycles * ENEMY_CYCLE_REFERENCE_S)
  const jitter = createRng(seed).fork(`room-${director.roomIndex}-wave-${waveIndex}-${telegraph.kind}-${index}`).next()
  return {
    id: `r${director.roomIndex}-w${waveIndex}-${telegraph.kind}-${index}`,
    kind: telegraph.kind,
    position: telegraph.position,
    // 波次雜兵的耐久刻意低於 content 的單體基準：數量創造壓力，清群創造回饋。
    hp: telegraph.kind === 'ember-thrall' ? 20 : telegraph.kind === 'shade-skirmisher' ? 38 : telegraph.kind === 'bulwark-sentinel' ? 70 : Math.max(1, Math.round(def.hp * 0.62)),
    maxHp: telegraph.kind === 'ember-thrall' ? 20 : telegraph.kind === 'shade-skirmisher' ? 38 : telegraph.kind === 'bulwark-sentinel' ? 70 : Math.max(1, Math.round(def.hp * 0.62)),
    attackState: 'approach', velocity: { x: 0, y: 0 }, locomotion: 'advance', attackRecoveryTicksRemaining: 0,
    telegraphGeometry: null, timerTicks: Math.max(1, Math.round(intervalTicks * (0.5 + jitter * 0.5))),
    attacksPerformed: 0, bossPhase: telegraph.kind === 'ashen-warlord' ? 1 : 0, bossAttack: telegraph.kind === 'ashen-warlord' ? 'smash' : null,
  }
}

export function advanceWaveTelegraph(director: EncounterDirectorState, seed: string): { director: EncounterDirectorState; enemies: readonly EnemyState[]; events: readonly GameEvent[] } | null {
  if (director.telegraphs.length === 0) return null
  if (director.telegraphTicksRemaining > 1) return { director: { ...director, telegraphTicksRemaining: director.telegraphTicksRemaining - 1 }, enemies: [], events: [] }
  const waveIndex = director.activeWaveIndex + 1
  const enemies = director.telegraphs.map((telegraph, index) => enemyFromTelegraph(seed, director, waveIndex, telegraph, index))
  return {
    director: { ...director, activeWaveIndex: waveIndex, telegraphTicksRemaining: 0, telegraphs: [] },
    enemies,
    events: [{ type: 'waveSpawned', wave: waveIndex + 1, totalWaves: director.waves.length, count: enemies.length }],
  }
}

/** 房間開場第一波直接可戰；之後每一波才以 1.15 秒預告進場，維持既有載入與測試節奏。 */
export function spawnOpeningWave(director: EncounterDirectorState, seed: string, player: Vector2): { director: EncounterDirectorState; enemies: readonly EnemyState[]; events: readonly GameEvent[] } {
  const announced = announceNextWave(director, seed, player)
  const spawned = advanceWaveTelegraph({ ...announced.director, telegraphTicksRemaining: 1 }, seed)
  if (spawned === null) throw new Error('開場波次排程失敗')
  return spawned
}

export function hasRemainingWaves(director: EncounterDirectorState): boolean {
  return director.activeWaveIndex + 1 < director.waves.length
}
