/**
 * 決定性重播：同一組 seed + 輸入序列重播兩次，必須逐 tick 完全相同。
 *
 * 這是硬要求，不是加分項（見任務規格）。本測試檔的反向驗證紀錄（故意引入非決定性、
 * 確認測試真的會紅，再改回來）記錄在
 * `/Users/samuellin/RogueParadise/.superpowers/sdd/embers-duel-core-impl-report.md`。
 */
import { describe, expect, it } from 'vitest'
import { createRun, tick } from './run.js'
import { input, materializeOpeningWave } from './test-utils.js'
import type { GameState, TickInput } from './types.js'

/**
 * 涵蓋移動、攻擊、閃避、Q、E、三選一、重開的混合輸入序列，刻意跨越
 * encounter1 → draft → encounter2 → victory/defeat 的多個階段轉換點。
 */
function richScript(): TickInput[] {
  const script: TickInput[] = []
  for (let i = 0; i < 60; i += 1) {
    script.push(input({
      moveX: Math.sin(i / 7),
      moveY: Math.cos(i / 11),
      aimX: Math.cos(i / 8) * 17,
      aimY: Math.sin(i / 8) * 17,
      attack: i % 4 === 0,
    }))
  }
  script.push(input({ dodge: true, moveX: 1, moveY: 0 }))
  for (let i = 0; i < 40; i += 1) script.push(input({ attack: i % 3 === 0 }))
  script.push(input({ skillQ: true }))
  for (let i = 0; i < 50; i += 1) {
    script.push(input({ moveX: -1, attack: i % 5 === 0, dodge: i === 20 }))
  }
  script.push(input({ skillE: true }))
  script.push(input({ draftChoice: 'precision-afterimage' }))
  for (let i = 0; i < 80; i += 1) {
    script.push(
      input({
        moveX: Math.cos(i / 5),
        moveY: Math.sin(i / 9),
        attack: i % 3 === 0,
        dodge: i % 17 === 0,
        skillQ: i === 10,
        skillE: i === 40,
      }),
    )
  }
  return script
}

function runFullHistory(seed: string, script: readonly TickInput[]): GameState[] {
  let state = createRun(seed)
  const history: GameState[] = [state]
  for (const frame of script) {
    state = tick(state, frame)
    history.push(state)
  }
  return history
}

describe('決定性重播', () => {
  it('相同滑鼠 aim script 重播時，方向與命中結果逐 tick 一致', () => {
    const script = Array.from({ length: 90 }, (_, index) => input({
      aimX: Math.cos(index / 6) * 100,
      aimY: Math.sin(index / 6) * 100,
      attack: index % 20 === 0,
    }))
    expect(runFullHistory('aim-replay', script)).toEqual(runFullHistory('aim-replay', script))
  })

  it('同一組 seed + 輸入序列，兩次獨立重播的每一 tick 狀態逐欄位完全相同', () => {
    const script = richScript()
    const historyA = runFullHistory('determinism-seed-1', script)
    const historyB = runFullHistory('determinism-seed-1', script)

    expect(historyA).toHaveLength(historyB.length)
    for (let i = 0; i < historyA.length; i += 1) {
      expect(historyA[i], `tick ${i} 狀態不一致`).toEqual(historyB[i])
    }
  })

  it('不同 seed 會產生不同的初始敵人時序（證明測試本身有偵測力，不是恆真斷言）', () => {
    const historyA = materializeOpeningWave('seed-alpha')
    const historyB = materializeOpeningWave('seed-beta')
    // 兩者的敵人初始攻擊抖動來自不同 seed 的 fork，理應不同（若这条测试本身失败，
    // 代表 spawnEncounter 的 jitter 沒有真的吃到 seed，是另一種需要被抓到的錯誤）。
    expect(historyA.enemies).not.toEqual(historyB.enemies)
  })
})
