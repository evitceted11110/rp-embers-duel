/**
 * `src/core/` 公開介面。渲染層（`src/render/`）只應該從這個檔案 import，
 * 不要直接深入 import 內部模組——見 `src/core/README.md` 給渲染層的完整說明。
 */
export { createRun, tick } from './run.js'
export { createRecorder, replay, replayHistory, type CrashDump, type Recorder } from './crash-dump.js'
export { neutralInput } from './types.js'
export { TICK_SECONDS } from './constants.js'

export type {
  AfterimageObject,
  ComboPhase,
  ComboState,
  DodgeState,
  EmberCoreObject,
  EnemyAttackState,
  EnemyKind,
  EnemyState,
  GameEvent,
  GameState,
  MarkId,
  PlayerState,
  RunPhase,
  TickInput,
} from './types.js'

export type { Vector2 } from './vector.js'
