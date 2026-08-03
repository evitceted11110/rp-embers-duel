/**
 * `src/core/` 公開介面。渲染層（`src/render/`）只應該從這個檔案 import，
 * 不要直接深入 import 內部模組——見 `src/core/README.md` 給渲染層的完整說明。
 */
export { createRun, tick } from './run.js'
export { createRecorder, replay, replayHistory, type CrashDump, type Recorder } from './crash-dump.js'
export { neutralInput } from './types.js'
export { ARENA_BOUNDS, clampToArena, isInsideArena } from './arena.js'
export {
  ATTACK_HALF_ANGLES_RAD,
  ATTACK_ACTIVE_TIMES_S,
  ATTACK_RECOVERY_S,
  ATTACK_RANGES_UNITS,
  ATTACK_STROKE_HALF_WIDTH_UNITS,
  ATTACK_STARTUP_TIMES_S,
  COMBO_LINK_WINDOWS_S,
  ATTACK_RANGE_UNITS,
  BASE_E_HALF_ANGLE_RAD,
  BASE_E_RANGE_UNITS,
  BASE_Q_HALF_ANGLE_RAD,
  BASE_Q_TARGET_RANGE_UNITS,
  BOSS_CHARGE_HALF_WIDTH_UNITS,
  BOSS_CHARGE_LENGTH_UNITS,
  BOSS_SMASH_RADIUS_UNITS,
  BOSS_SUMMON_RADIUS_UNITS,
  BULWARK_CONE_HALF_ANGLE_RAD,
  BULWARK_CONE_RADIUS_UNITS,
  GUARD_E_RADIUS_UNITS,
  Q_LUNGE_DISTANCE_UNITS,
  SKIRMISHER_LANE_HALF_WIDTH_UNITS,
  SKIRMISHER_LANE_LENGTH_UNITS,
  THRALL_CONE_HALF_ANGLE_RAD,
  THRALL_CONE_RADIUS_UNITS,
  TICK_SECONDS,
} from './constants.js'
export { EMBER_CORE, PRECISION_AFTERIMAGE } from './content.js'
export { createEnemyAttackGeometry, enemyGeometryContains } from './enemy-geometry.js'
export { DEFAULT_FORGE, FORGE_CARDS, applyForgeCard, forgeChoices } from './forge.js'
export { MAX_SIMULTANEOUS_ENEMIES, WAVE_TELEGRAPH_TICKS } from './encounter-director.js'
export {
  circleIntersectsSector,
  createPlayerAttackGeometry,
  enemyHurtboxRadius,
  playerAttackHitsCircle,
} from './player-attack-geometry.js'
export type { PlayerAttackGeometry, PlayerAttackVariant } from './player-attack-geometry.js'

export type {
  AfterimageObject,
  ComboPhase,
  ComboState,
  DodgeState,
  EmberCoreObject,
  EnemyAttackState,
  EnemyAttackGeometry,
  EnemyKind,
  EnemyLocomotion,
  EnemyState,
  ForgeLoadout,
  ForgeSlotId,
  EncounterDirectorState,
  GameEvent,
  GameState,
  MarkId,
  PlayerState,
  RunPhase,
  TickInput,
  SpawnTelegraph,
} from './types.js'

export type { Vector2 } from './vector.js'
