import { describe, expect, it } from 'vitest'
import { createRecorder, replay, replayHistory } from './crash-dump.js'
import { input } from './test-utils.js'
import type { TickInput } from './types.js'

function scriptedInputs(): TickInput[] {
  const inputs: TickInput[] = []
  for (let i = 0; i < 40; i += 1) {
    inputs.push(input({ moveX: 1, attack: i % 3 === 0 }))
  }
  inputs.push(input({ dodge: true, moveX: 0, moveY: 1 }))
  for (let i = 0; i < 30; i += 1) inputs.push(input())
  inputs.push(input({ skillQ: true }))
  for (let i = 0; i < 10; i += 1) inputs.push(input())
  inputs.push(input({ skillE: true }))
  return inputs
}

describe('crash dump：seed ＋ 輸入序列可以一鍵重現', () => {
  it('recorder 錄下的 dump 用 replay() 重播，得到與錄製當下完全相同的最終狀態', () => {
    const recorder = createRecorder('crash-dump-seed')
    for (const i of scriptedInputs()) recorder.tick(i)
    const recorded = recorder.getState()

    const dump = recorder.dump()
    expect(dump.seed).toBe('crash-dump-seed')
    expect(dump.inputLog).toHaveLength(scriptedInputs().length)

    const replayed = replay(dump)
    expect(replayed).toEqual(recorded)
  })

  it('dump 是純資料（可以 JSON 序列化/還原後照樣重播）', () => {
    const recorder = createRecorder('crash-dump-json-seed')
    for (const i of scriptedInputs()) recorder.tick(i)
    const dump = recorder.dump()

    const roundTripped = JSON.parse(JSON.stringify(dump))
    const replayed = replay(roundTripped)
    expect(replayed).toEqual(recorder.getState())
  })

  it('replayHistory 回傳的每一 tick 狀態，與逐次呼叫 tick() 累積的歷史逐項相同', () => {
    const inputs = scriptedInputs()
    const recorder = createRecorder('history-seed')
    const manualHistory = [recorder.getState()]
    for (const i of inputs) {
      recorder.tick(i)
      manualHistory.push(recorder.getState())
    }
    const dump = recorder.dump()
    const replayedHistory = replayHistory(dump)
    expect(replayedHistory).toEqual(manualHistory)
  })
})
