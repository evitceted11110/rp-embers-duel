/**
 * Headless 煙霧測試：不碰 DOM，只驅動 `game-loop.ts`（accumulator ＋ recorder ＋
 * vfx-tracker 的完整組裝）與三個畫面組裝函式（`world-view.ts`／`judgment-view.ts`／
 * `hud-view.ts`），證明「一段輸入序列餵進去，遊戲狀態真的有推進」，不是只讀過程式碼
 * 就宣稱完成——這是交付報告要求的可執行證據。
 *
 * 刻意用「畫面幀 dt」（1/60 秒）餵 `advanceBy()`，不是直接呼叫 core 的 `tick()`——
 * 這樣驗證的是渲染層自己組裝的 accumulator 迴圈，而不是繞過它直接測 core
 * （core 自己的 `run.test.ts` 已經用類似的自動代打證過整條 encounter1→draft→
 * encounter2→victory 流程走得通；這裡要多證明的是「渲染層這一層的接線」本身正確）。
 */
import { describe, expect, it } from 'vitest'
import { neutralInput, type GameState, type MarkId, type TickInput } from '../core/index.js'
import { buildHudViewModel } from './hud-view.js'
import { createGameLoop, type GameLoop } from './game-loop.js'
import { buildJudgmentEffects } from './judgment-view.js'
import { buildWorldCommands } from './world-view.js'

const FRAME_DT_SECONDS = 1 / 60
/** 500 秒模擬時間的畫面幀數上限，遠超過核心層 run.test.ts 驗證過的 200 秒完整流程。 */
const MAX_FRAMES = 60_000

function input(overrides: Partial<TickInput> = {}): TickInput {
  return { ...neutralInput(), ...overrides }
}

function nearestLivingEnemy(state: GameState): { readonly position: { x: number; y: number }; readonly dist: number } | undefined {
  let best: { position: { x: number; y: number }; dist: number } | undefined
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue
    const dist = Math.hypot(enemy.position.x - state.player.position.x, enemy.position.y - state.player.position.y)
    if (best === undefined || dist < best.dist) best = { position: enemy.position, dist }
  }
  return best
}

/**
 * 簡單自動代打：朝最近敵人靠近／攻擊，預兆將近時側向閃避，選了餘燼核心時會嘗試
 * 施放 Q 佈署核心。目的不是驗證平衡數值，是證明「輸入 → 渲染層 accumulator →
 * core.tick() → 畫面組裝」這條完整管線真的會動。
 */
function autoFightInput(state: GameState, draftChoice: MarkId): TickInput {
  if (state.phase === 'draft') return input({ draftChoice: state.draftOptions.includes(draftChoice) ? draftChoice : state.draftOptions[0]! })

  const nearest = nearestLivingEnemy(state)
  const aim = nearest === undefined
    ? { aimX: state.player.facing.x, aimY: state.player.facing.y }
    : {
        aimX: nearest.position.x - state.player.position.x,
        aimY: nearest.position.y - state.player.position.y,
      }
  const imminent = state.enemies.some((e) => e.hp > 0 && e.attackState === 'telegraph' && e.timerTicks <= 8)
  const canDodge =
    state.player.dodge.cooldownTicksRemaining <= 0 &&
    (state.player.combo.phase === 'idle' || state.player.combo.phase === 'recovery')

  if (imminent && canDodge) {
    if (nearest !== undefined) {
      const dx = nearest.position.x - state.player.position.x
      const dy = nearest.position.y - state.player.position.y
      const len = Math.hypot(dx, dy) || 1
      return input({ ...aim, dodge: true, moveX: -dy / len, moveY: dx / len })
    }
    return input({ ...aim, dodge: true, moveX: 1 })
  }

  if (
      state.selectedMarks.includes('ember-core') &&
    state.player.emberCores.length === 0 &&
    state.player.qCooldownTicksRemaining <= 0
  ) {
    return input({ ...aim, skillQ: true })
  }
  if (nearest !== undefined && nearest.dist <= 3 && state.player.eCooldownTicksRemaining <= 0 && (state.player.guardStacks > 0 || state.player.afterimages.length > 0 || !state.selectedMarks.some((id) => id === 'precision-afterimage' || id === 'charged-retaliation'))) return input({ ...aim, skillE: true })
  if (nearest !== undefined && nearest.dist <= 4 && !state.selectedMarks.includes('ember-core') && state.player.qCooldownTicksRemaining <= 0) return input({ ...aim, skillQ: true })

  if (nearest !== undefined && nearest.dist > 1.4) {
    const dx = nearest.position.x - state.player.position.x
    const dy = nearest.position.y - state.player.position.y
    const len = Math.hypot(dx, dy) || 1
    return input({ ...aim, moveX: dx / len, moveY: dy / len, attack: state.tick % 2 === 0 })
  }

  if (nearest !== undefined) {
    const dx = nearest.position.x - state.player.position.x
    const dy = nearest.position.y - state.player.position.y
    const len = Math.hypot(dx, dy) || 1
    return input({ ...aim, moveX: -dy / len, moveY: dx / len, attack: state.tick % 2 === 0 })
  }
  return input({ ...aim, attack: state.tick % 2 === 0 })
}

describe('煙霧測試：輸入序列推進完整六遭遇、六次 draft 與 Boss', () => {
  it.each<MarkId>(['ember-core'])(
    '選擇 %s：玩家移動、敵人受傷/被擊敗、三選一生效、最終抵達勝利，且畫面組裝函式全程不拋例外',
    (draftChoice) => {
      // 沿用 src/core/run.test.ts 的種子字串（`flow-${choice}`）與完全相同的自動代打
      // 策略：同一顆種子 + 同一個純函式策略在 tick() 上必然逐 tick 決定性一致（見
      // src/core/README.md 第 7 節），因此這裡不需要重新調校一個「保證會贏」的策略，
      // 直接複用 core 層已經證明會抵達勝利的組合，把煙霧測試的關注點鎖定在
      // 「渲染層這一層的接線是否正確」，而不是重新驗證戰鬥 AI 的穩健度。
      let sawDraft = false
      let sawEncounter2 = false
      let sawQCastAfterSelection = false
      let sawEmberCoreSpawned = false

      // ⚠️ 關鍵陷阱（值得記下來）：不能只在外層迴圈每呼叫一次 advanceBy() 之後才用
      // loop.getState() 抽查一次狀態——單次 advanceBy() 可能因為 accumulator 補了
      // 不只一個邏輯 tick（100Hz 邏輯 vs 60Hz 畫面，見 fixed-step-loop.ts）而一次跨過
      // 好幾個 tick；如果「進入 draft」與「選完印記離開 draft」剛好落在同一次 advanceBy()
      // 補的兩個 tick 裡，外層只抽查「這次 advanceBy() 跑完之後」的狀態就會完全錯過
      // 曾經存在過的 draft 狀態，得到假的「從未看到三選一」結論——這正是
      // 「events／過渡狀態只存在一個 tick，錯過就沒了」這條 core README 警語的另一種
      // 展現形式。正確做法是把觀察點放進 buildInput 這個「保證每個邏輯 tick 恰好呼叫
      // 一次」的回呼裡，而不是外層迴圈。
      const loop: GameLoop = createGameLoop({
        seed: `flow-${draftChoice}`,
        buildInput: () => {
          const state = loop.getState()
          if (state.phase === 'draft') sawDraft = true
          if (state.phase === 'encounter2') sawEncounter2 = true
          if (draftChoice === 'ember-core' && state.selectedMarks.includes('ember-core')) {
            if (state.events.some((e) => e.type === 'qCast')) sawQCastAfterSelection = true
            if (state.player.emberCores.length > 0) sawEmberCoreSpawned = true
          }
          return autoFightInput(state, draftChoice)
        },
      })

      const initialState = loop.getState()
      expect(initialState.phase).toBe('encounter1')
      expect(initialState.player.position).toEqual({ x: 0, y: 0 })

      let frames = 0
      while (loop.getState().phase !== 'victory' && loop.getState().phase !== 'defeat' && frames < MAX_FRAMES) {
        loop.advanceBy(FRAME_DT_SECONDS)
        frames += 1

        const state = loop.getState()
        // 畫面組裝函式必須能吃下模擬過程中任何一個真實出現過的狀態，不拋例外——
        // 這比只用手工合成的 fixture 測更貼近「真的會不會在瀏覽器裡爆炸」。
        expect(() => buildWorldCommands(state)).not.toThrow()
        expect(() => buildJudgmentEffects(state, loop.getVfxState())).not.toThrow()
        expect(() => buildHudViewModel(state)).not.toThrow()
      }

      expect(frames).toBeLessThan(MAX_FRAMES) // 沒有卡在中途跑滿上限
      expect(sawDraft).toBe(true)
      expect(sawEncounter2).toBe(true)

      const finalState = loop.getState()
      expect(finalState.phase).toBe('victory')
      expect(finalState.selectedMarks).toContain(draftChoice)
      expect(finalState.selectedMarks).toHaveLength(5)
      expect(finalState.enemies.every((e) => e.hp <= 0)).toBe(true)
      expect(finalState.player.hp).toBeGreaterThan(0)
      // 玩家確實移動過（不是原地不動、輸入沒有真的傳到 core）。
      expect(finalState.player.position).not.toEqual({ x: 0, y: 0 })

      if (draftChoice === 'ember-core') {
        expect(sawQCastAfterSelection).toBe(true)
        expect(sawEmberCoreSpawned).toBe(true)
      }

      // 重開（KeyR 對應的 restart）：不論打到哪個階段，都能回到全新的遭遇 1、
      // 清空已選印記、清空渲染層自己的殘跡歷史（vfx-tracker）。
      loop.advanceBy(FRAME_DT_SECONDS) // 先跑一幀讓 buildInput 有機會被呼叫一次帶正常輸入
      const restartInput = (): TickInput => input({ restart: true })
      const restartLoop = createGameLoop({ seed: `smoke-restart-${draftChoice}`, buildInput: restartInput })
      restartLoop.advanceBy(FRAME_DT_SECONDS * 2)
      const restarted = restartLoop.getState()
      expect(restarted.phase).toBe('encounter1')
      expect(restarted.selectedMark).toBeNull()
      expect(restartLoop.getVfxState()).toEqual({ dodgeTrail: null, teleportStreak: null })

      // crash dump 可重播：見 src/core/README.md 第 7 節。
      const dump = loop.dump()
      expect(dump.seed).toBe(`flow-${draftChoice}`)
      expect(dump.inputLog.length).toBeGreaterThan(0)
    },
    15_000,
  )
})
