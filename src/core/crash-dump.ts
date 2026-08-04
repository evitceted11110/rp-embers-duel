/**
 * Crash dump：把「seed ＋ 到目前為止的完整輸入序列」錄下來，讓任何 bug 都能一鍵重現
 * （硬規定 5）。因為 `tick()` 是純函式且不消耗任何隨機性（見 run.ts、enemy.ts 的說明），
 * `replay()` 從同一個 seed 重跑同一段輸入序列，保證逐 tick 產生完全相同的狀態。
 */
import { createRun, tick } from './run.js'
import type { GameState, TickInput } from './types.js'
import type { ClassId } from './class-expansion.js'

export type CrashDump = {
  readonly seed: string
  readonly classId?: ClassId | null
  readonly inputLog: readonly TickInput[]
}

export type Recorder = {
  /** 等同呼叫 `tick()`，但同時把這次輸入記錄下來。渲染層應一律透過這個入口推進遊戲。 */
  tick(input: TickInput): GameState
  getState(): GameState
  /** 目前為止的完整可重現素材：JSON 可序列化，能直接寫進錯誤回報。 */
  dump(): CrashDump
}

export function createRecorder(seed: string, classId: ClassId | null = null): Recorder {
  let state = createRun(seed, classId)
  const inputLog: TickInput[] = []
  return {
    tick(input: TickInput): GameState {
      inputLog.push(input)
      state = tick(state, input)
      return state
    },
    getState(): GameState {
      return state
    },
    dump(): CrashDump {
      return { seed, classId, inputLog: [...inputLog] }
    },
  }
}

/** 從 crash dump 重播出最終狀態。 */
export function replay(dump: CrashDump): GameState {
  let state = createRun(dump.seed, dump.classId ?? null)
  for (const input of dump.inputLog) {
    state = tick(state, input)
  }
  return state
}

/** 重播並回傳每一 tick 的完整狀態序列，供「決定性重播逐 tick 相同」測試比對使用。 */
export function replayHistory(dump: CrashDump): GameState[] {
  let state = createRun(dump.seed, dump.classId ?? null)
  const history: GameState[] = [state]
  for (const input of dump.inputLog) {
    state = tick(state, input)
    history.push(state)
  }
  return history
}
