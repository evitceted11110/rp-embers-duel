/**
 * 渲染層唯一需要的「跨 tick 記憶」：`GameState` 本身沒有留存的兩段短暫視覺歷史。
 *
 * 刻意保持最小——其餘所有 keystone 視覺（殘影本體、蓄能護環、格擋尾段光環）都能
 * 純粹從「當下這一 tick 的 GameState + content 常數」算出來，不需要額外記住歷史
 * （見 `judgment-view.ts` 開頭的說明）。只有以下兩件事，`GameState` 一旦離開該 tick
 * 就不再留痕跡，渲染層必須自己記住：
 *
 * 1. 餘燼核心的閃避彎曲弧線「殘跡」：`player.dodge.startPosition/endPosition/bendTarget`
 *    只在閃避仍 `active` 時有意義，閃避結束後這些欄位依舊留著舊值，但 `active` 已經是
 *    false——渲染層想在閃避剛結束後讓弧線殘跡再多留一下（讀性），必須自己記錄「這是
 *    第幾個 tick 觸發的」，不能只看 `dodge.active`。
 * 2. 精準殘影 keystone 的 E 瞬移拖尾：`eCast` 事件只告訴我們「這一 tick 瞬移了」，
 *    起點（瞬移前的位置）在事件當下已經不存在於 `nextGameState` 裡——只有比對
 *    「這一 tick 之前」與「這一 tick 之後」的玩家座標才能重建起訖點。
 */
import type { GameState, Vector2 } from '../core/index.js'

export type DodgeTrailSnapshot = {
  readonly startPosition: Vector2
  readonly endPosition: Vector2
  readonly bendTarget: Vector2 | null
  readonly spawnTick: number
}

export type TeleportStreakSnapshot = {
  readonly from: Vector2
  readonly to: Vector2
  readonly spawnTick: number
}

export type VfxState = {
  readonly dodgeTrail: DodgeTrailSnapshot | null
  readonly teleportStreak: TeleportStreakSnapshot | null
}

export const INITIAL_VFX_STATE: VfxState = { dodgeTrail: null, teleportStreak: null }

/** 弧線殘跡在觸發後可見的 tick 數（0.4 秒：涵蓋 0.28 秒無敵幀本身，再留一點淡出餘裕）。 */
export const DODGE_TRAIL_VISIBLE_TICKS = 40

/** 瞬移拖尾在觸發後可見的 tick 數（0.2 秒，短暫的一道殘影閃現）。 */
export const TELEPORT_STREAK_VISIBLE_TICKS = 20

/**
 * 在 fixed-step-loop 的 `onTick` 裡每 tick 呼叫一次——必須拿到「這一 tick 之前」與
 * 「這一 tick 之後」兩份狀態，且不能跳過任何一次 `tick()` 呼叫（同一畫面幀可能推進
 * 不只一個邏輯 tick，見 `fixed-step-loop.ts`），否則會錯過只存在單一 tick 的事件。
 */
export function updateVfxState(previous: VfxState, prevGameState: GameState, nextGameState: GameState): VfxState {
  // tick===0 只會發生在全新的一局（createRun 或 restart 之後的第一個狀態）：
  // 之前記住的殘跡／拖尾屬於上一局，直接丟棄，不要讓舊局的視覺殘留到新局。
  if (nextGameState.tick === 0) return INITIAL_VFX_STATE

  let dodgeTrail = previous.dodgeTrail
  let teleportStreak = previous.teleportStreak

  for (const event of nextGameState.events) {
    if (event.type === 'dodgeStart') {
      dodgeTrail = {
        startPosition: nextGameState.player.dodge.startPosition,
        endPosition: nextGameState.player.dodge.endPosition,
        bendTarget: nextGameState.player.dodge.bendTarget,
        spawnTick: nextGameState.tick,
      }
    } else if (event.type === 'eCast' && nextGameState.selectedMark === 'precision-afterimage') {
      teleportStreak = {
        from: prevGameState.player.position,
        to: nextGameState.player.position,
        spawnTick: nextGameState.tick,
      }
    }
  }

  return { dodgeTrail, teleportStreak }
}
