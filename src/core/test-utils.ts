/**
 * 測試專用建構器：讓每個測試只需要覆寫關心的欄位，其餘用合理預設值填滿。
 * 不是公開 API，`index.ts` 不會 re-export 這個檔案。
 */
import { createRun } from './run.js'
import { neutralInput } from './types.js'
import type { EnemyState, GameState, TickInput } from './types.js'

export function input(overrides: Partial<TickInput> = {}): TickInput {
  return { ...neutralInput(), ...overrides }
}

export function buildState(overrides: Partial<GameState> = {}, seed = 'test-seed'): GameState {
  const base = createRun(seed)
  return { ...base, ...overrides }
}

export function makeEnemy(
  overrides: Partial<EnemyState> & Pick<EnemyState, 'id' | 'kind'>,
): EnemyState {
  return {
    position: { x: 5, y: 0 },
    hp: 200,
    maxHp: 200,
    attackState: 'approach',
    velocity: { x: 0, y: 0 },
    locomotion: 'idle',
    attackRecoveryTicksRemaining: 0,
    telegraphGeometry: null,
    timerTicks: 0,
    attacksPerformed: 0,
    bossPhase: 0,
    bossAttack: null,
    ...overrides,
  }
}
