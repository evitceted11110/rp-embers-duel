import { describe, expect, it } from 'vitest'
import {
  ACTION_IDS,
  BINDINGS_CONFIG,
  defaultBindingsState,
  isBindable,
  isReservedSecondaryCode,
  proposeRebind,
  resolveConflict,
  type BindingsState,
} from './bindings.js'

describe('BINDINGS_CONFIG：讀取 content/bindings.json', () => {
  it('涵蓋全部八個動作，且 judgementProperty 是 code', () => {
    expect(BINDINGS_CONFIG.judgementProperty).toBe('code')
    expect(BINDINGS_CONFIG.actions.map((a) => a.id).sort()).toEqual([...ACTION_IDS].sort())
  })

  it('移動動作的預設鍵是 WASD，方向鍵是固定備援', () => {
    const moveUp = BINDINGS_CONFIG.actions.find((a) => a.id === 'moveUp')!
    expect(moveUp.defaultCode).toBe('KeyW')
    expect(moveUp.secondaryFixed).toBe('ArrowUp')
  })

  it('戰鬥動作沒有固定備援', () => {
    const attack = BINDINGS_CONFIG.actions.find((a) => a.id === 'attack')!
    expect(attack.defaultCode).toBe('Mouse0')
    expect(attack.secondaryFixed).toBeNull()
  })

  it('non_bindable_codes 涵蓋 Escape/Tab/F5 與修飾鍵', () => {
    for (const code of ['Escape', 'Tab', 'F5', 'ControlLeft', 'ShiftLeft', 'MetaLeft']) {
      expect(isBindable(code, BINDINGS_CONFIG)).toBe(false)
    }
    expect(isBindable('KeyQ', BINDINGS_CONFIG)).toBe(true)
  })
})

describe('defaultBindingsState', () => {
  it('每個動作的初始值等於 default_codes[0]', () => {
    const state = defaultBindingsState(BINDINGS_CONFIG)
    expect(state.attack).toBe('Mouse0')
    expect(state.dodge).toBe('Space')
    expect(state.skillQ).toBe('KeyQ')
    expect(state.skillE).toBe('KeyE')
    expect(state.moveUp).toBe('KeyW')
  })
})

describe('isReservedSecondaryCode', () => {
  it('方向鍵固定備援一律視為保留鍵', () => {
    expect(isReservedSecondaryCode('ArrowUp', BINDINGS_CONFIG)).toBe(true)
    expect(isReservedSecondaryCode('ArrowDown', BINDINGS_CONFIG)).toBe(true)
    expect(isReservedSecondaryCode('KeyQ', BINDINGS_CONFIG)).toBe(false)
  })
})

describe('proposeRebind：反向驗證——禁綁鍵必須被擋下', () => {
  it('Escape 不得通過綁定驗證', () => {
    const state = defaultBindingsState(BINDINGS_CONFIG)
    const outcome = proposeRebind(state, 'attack', 'Escape', BINDINGS_CONFIG)
    expect(outcome.status).toBe('rejected')
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'non-bindable' })
  })

  it('Tab、F5、修飾鍵同樣被擋下', () => {
    const state = defaultBindingsState(BINDINGS_CONFIG)
    for (const code of ['Tab', 'F5', 'ControlLeft', 'ShiftRight']) {
      const outcome = proposeRebind(state, 'skillQ', code, BINDINGS_CONFIG)
      expect(outcome.status).toBe('rejected')
    }
  })

  it('方向鍵固定備援不得被其他動作搶走（reserved-secondary）', () => {
    const state = defaultBindingsState(BINDINGS_CONFIG)
    const outcome = proposeRebind(state, 'skillQ', 'ArrowUp', BINDINGS_CONFIG)
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'reserved-secondary' })
  })
})

describe('proposeRebind：一般情況', () => {
  it('沒有衝突時直接套用', () => {
    const state = defaultBindingsState(BINDINGS_CONFIG)
    const outcome = proposeRebind(state, 'skillQ', 'KeyF', BINDINGS_CONFIG)
    expect(outcome).toMatchObject({ status: 'applied' })
    if (outcome.status === 'applied') {
      expect(outcome.bindings.skillQ).toBe('KeyF')
      expect(outcome.bindings.skillE).toBe('KeyE') // 其餘動作不受影響
    }
  })

  it('可以重綁到滑鼠鍵（Mouse2 等）', () => {
    const state = defaultBindingsState(BINDINGS_CONFIG)
    const outcome = proposeRebind(state, 'attack', 'Mouse2', BINDINGS_CONFIG)
    expect(outcome).toMatchObject({ status: 'applied' })
  })

  it('鍵位已被另一動作使用時回傳 conflict，不靜默套用', () => {
    const state = defaultBindingsState(BINDINGS_CONFIG)
    // skillE 預設是 KeyE；把 skillQ 也綁到 KeyE 應該衝突。
    const outcome = proposeRebind(state, 'skillQ', 'KeyE', BINDINGS_CONFIG)
    expect(outcome).toMatchObject({ status: 'conflict', conflictingActionIds: ['skillE'] })
    // 衝突時 bindings 本身完全沒變（純函式、無副作用）。
    expect(state.skillQ).toBe('KeyQ')
  })
})

describe('resolveConflict', () => {
  function conflictState(): BindingsState {
    return defaultBindingsState(BINDINGS_CONFIG)
  }

  it('cancel：完全不變動', () => {
    const state = conflictState()
    const result = resolveConflict(state, 'skillQ', 'KeyE', ['skillE'], 'cancel')
    expect(result).toEqual(state)
  })

  it('override：actionId 取得新鍵，原持有者變成未綁定', () => {
    const state = conflictState()
    const result = resolveConflict(state, 'skillQ', 'KeyE', ['skillE'], 'override')
    expect(result.skillQ).toBe('KeyE')
    expect(result.skillE).toBeNull()
  })

  it('swap：兩個動作互換原本的鍵', () => {
    const state = conflictState()
    const result = resolveConflict(state, 'skillQ', 'KeyE', ['skillE'], 'swap')
    expect(result.skillQ).toBe('KeyE')
    expect(result.skillE).toBe('KeyQ') // skillQ 原本的鍵
  })

  it('原始 bindings 物件不被修改（純函式）', () => {
    const state = conflictState()
    const before = { ...state }
    resolveConflict(state, 'skillQ', 'KeyE', ['skillE'], 'swap')
    expect(state).toEqual(before)
  })
})
