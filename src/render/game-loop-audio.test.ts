import { describe, expect, it, vi } from 'vitest'
import { neutralInput, TICK_SECONDS } from '../core/index.js'
import { createGameLoop } from './game-loop.js'

describe('createGameLoop 音訊掛點', () => {
  it('每個 logical tick 傳出前後狀態，不因單幀多 tick 漏掉離散事件', () => {
    const onStateAdvanced = vi.fn()
    const loop = createGameLoop({
      seed: 'audio-hook',
      buildInput: neutralInput,
      onStateAdvanced,
    })

    loop.advanceBy(TICK_SECONDS * 3 + Number.EPSILON)

    expect(onStateAdvanced).toHaveBeenCalledTimes(3)
    expect(onStateAdvanced.mock.calls.map(([, next]) => next.tick)).toEqual([1, 2, 3])
  })
})
