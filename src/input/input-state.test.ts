import { describe, expect, it } from 'vitest'
import { neutralInput } from '../core/index.js'
import { BINDINGS_CONFIG, defaultBindingsState } from './bindings.js'
import { assembleTickInput, computeActionStates, computeMoveAxis } from './input-state.js'

const config = BINDINGS_CONFIG
const bindings = defaultBindingsState(config)

describe('computeActionStates', () => {
  it('對應鍵按住時該動作為 true，其餘為 false', () => {
    const held = new Set(['KeyW', 'Mouse0'])
    const states = computeActionStates(held, bindings, config)
    expect(states.moveUp).toBe(true)
    expect(states.attack).toBe(true)
    expect(states.moveDown).toBe(false)
    expect(states.skillQ).toBe(false)
  })

  it('方向鍵固定備援即使沒重綁也會生效', () => {
    const held = new Set(['ArrowUp'])
    const states = computeActionStates(held, bindings, config)
    expect(states.moveUp).toBe(true)
  })

  it('重綁後改用新鍵判定，舊的預設鍵不再生效', () => {
    const rebound = { ...bindings, skillQ: 'KeyF' }
    const held = new Set(['KeyQ'])
    const states = computeActionStates(held, rebound, config)
    expect(states.skillQ).toBe(false)
  })
})

describe('computeMoveAxis', () => {
  it('單一方向為 ±1', () => {
    const held = new Set(['KeyD'])
    const states = computeActionStates(held, bindings, config)
    expect(computeMoveAxis(states)).toEqual({ moveX: 1, moveY: 0 })
  })

  it('同時按左右應為 0（自然抵銷，不是特例判斷）', () => {
    const held = new Set(['KeyA', 'KeyD'])
    const states = computeActionStates(held, bindings, config)
    expect(computeMoveAxis(states).moveX).toBe(0)
  })

  it('W 對應 moveY = -1（上），S 對應 moveY = +1（下）', () => {
    const upStates = computeActionStates(new Set(['KeyW']), bindings, config)
    expect(computeMoveAxis(upStates).moveY).toBe(-1)
    const downStates = computeActionStates(new Set(['KeyS']), bindings, config)
    expect(computeMoveAxis(downStates).moveY).toBe(1)
  })
})

describe('assembleTickInput', () => {
  it('輸出的形狀與 core 的 TickInput 完全一致（欄位齊備、類型正確）', () => {
    const held = new Set(['KeyW', 'Mouse0', 'Space'])
    const states = computeActionStates(held, bindings, config)
    const result = assembleTickInput(states, 'encounter1', null, false, { x: 9, y: -4 })
    expect(Object.keys(result).sort()).toEqual(Object.keys(neutralInput()).sort())
    expect(result).toMatchObject({ moveX: 0, moveY: -1, aimX: 9, aimY: -4, attack: true, dodge: true, skillQ: false, skillE: false })
  })

  it('draftChoice 只在 phase === draft 時透出', () => {
    const states = computeActionStates(new Set(), bindings, config)
    const duringDraft = assembleTickInput(states, 'draft', 'ember-core', false)
    expect(duringDraft.draftChoice).toBe('ember-core')

    const outsideDraft = assembleTickInput(states, 'encounter1', 'ember-core', false)
    expect(outsideDraft.draftChoice).toBeNull()
  })

  it('restart 直接透出目前的按住狀態（core 內部做邊緣觸發判斷）', () => {
    const states = computeActionStates(new Set(), bindings, config)
    expect(assembleTickInput(states, 'encounter1', null, true).restart).toBe(true)
    expect(assembleTickInput(states, 'encounter1', null, false).restart).toBe(false)
  })
})
