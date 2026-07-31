import { describe, expect, it } from 'vitest'
import { createRun } from './index.js'

describe('createRun', () => {
  it('建立可重播的初始狀態', () => {
    const state = createRun('demo')
    expect(state.seed).toBe('demo')
    expect(state.tick).toBe(0)
    expect(state.phase).toBe('encounter1')
    expect(state.selectedMark).toBeNull()
    expect(state.player.hp).toBe(220)
  })

  it('空字串 seed 會丟例外', () => {
    expect(() => createRun('')).toThrow()
  })
})
