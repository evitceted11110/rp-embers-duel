/**
 * 判定層畫面組裝：把 `GameState`（＋渲染層自己的少量歷史，見 `vfx-tracker.ts`）
 * 轉成一份 `JudgmentEffect[]`，交給 `src/visual/judgment-layer.ts` 的 `paintJudgmentLayer()` 畫。
 *
 * 這是三枚 keystone「改寫動作幾何」主張的驗收現場——除了兩段短暫歷史（弧線殘跡、
 * 瞬移拖尾，見 `vfx-tracker.ts` 開頭說明）以外，其餘全部（殘影本體、蓄能護環、格擋
 * 尾段光環、敵人預兆）都是純函式：只從「當下這一 tick 的 GameState + content 常數」
 * 算出來，不需要任何額外記憶。
 */
import {
  TICK_SECONDS,
  type EnemyState,
  type GameState,
} from '../core/index.js'
import { ENEMY_TELEGRAPH_COLORS, SCHOOL_COLORS } from '../visual/color.js'
import {
  enemyTelegraph,
  schoolEffect,
  type JudgmentEffect,
} from '../visual/judgment-layer.js'
import { afterimageGeometry } from '../visual/shapes/afterimage.js'
import { dodgeArcTrail } from '../visual/shapes/arc-trail.js'
import { parryHaloGeometry } from '../visual/shapes/parry-halo.js'
import { toScreenPoint, type ScreenPoint } from '../visual/screen-point.js'
import { worldToScreen } from './camera.js'
import { telegraphSeconds } from './enemy-content.js'
import { AFTERIMAGE_DURATION_S, GUARD_MAX_STACKS, PARRY_TAIL_DURATION_S } from './mark-content.js'
import { DODGE_TRAIL_VISIBLE_TICKS, TELEPORT_STREAK_VISIBLE_TICKS, type VfxState } from './vfx-tracker.js'

// ---------------------------------------------------------------------------
// 判定層形狀的螢幕像素尺寸：工程假設（非設計核定值），只是讓形狀在 1280×720
// 螢幕上有肉眼可辨的大小，比照世界層 1 unit = CELLS_PER_UNIT(4) × WORLD_SCALE(8)
// = 32 螢幕像素的尺度抓的概略值。
// ---------------------------------------------------------------------------
const AFTERIMAGE_SILHOUETTE_RADIUS_PX = 14
const GUARD_RING_BASE_RADIUS_PX = 18
const GUARD_RING_SPACING_PX = 7
const EMBER_THRALL_HALO_BASE_RADIUS_PX = 18
const SKIRMISHER_TELEGRAPH_RADIUS_PX = 12

/** parry-halo 三段式（亮起→撐開→收回）中，「撐開」段結束的歸一化時刻（見 `shapes/parry-halo.ts`）。 */
const HALO_EXPAND_END_RATIO = 2 / 3

function silhouetteAround(center: ScreenPoint, radiusPx: number): readonly ScreenPoint[] {
  return [
    toScreenPoint(center.x, center.y - radiusPx),
    toScreenPoint(center.x + radiusPx, center.y),
    toScreenPoint(center.x, center.y + radiusPx),
    toScreenPoint(center.x - radiusPx, center.y),
  ]
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

// ---------------------------------------------------------------------------
// 餘燼核心：閃避彎曲弧線殘跡（唯一需要 vfx-tracker 記住的兩段歷史之一）。
// ---------------------------------------------------------------------------
function emberCoreEffects(state: GameState, vfx: VfxState): JudgmentEffect[] {
  const trail = vfx.dodgeTrail
  if (trail === null) return []
  const age = state.tick - trail.spawnTick
  if (age < 0 || age > DODGE_TRAIL_VISIBLE_TICKS) return []

  const geometry = dodgeArcTrail(
    worldToScreen(trail.startPosition),
    worldToScreen(trail.endPosition),
    trail.bendTarget === null ? null : worldToScreen(trail.bendTarget),
  )
  return [schoolEffect(geometry, SCHOOL_COLORS.ember)]
}

// ---------------------------------------------------------------------------
// 精準殘影：殘影本體（純函式，`ticksRemaining` 本身就足夠算出 opacity）
// ＋ E 瞬移拖尾（vfx-tracker 記住的另一段歷史）。
// ---------------------------------------------------------------------------
function precisionAfterimageEffects(state: GameState, vfx: VfxState): JudgmentEffect[] {
  const effects: JudgmentEffect[] = []

  for (const afterimage of state.player.afterimages) {
    const elapsedS = AFTERIMAGE_DURATION_S - afterimage.ticksRemaining * TICK_SECONDS
    const geometry = afterimageGeometry(
      silhouetteAround(worldToScreen(afterimage.position), AFTERIMAGE_SILHOUETTE_RADIUS_PX),
      elapsedS,
      AFTERIMAGE_DURATION_S,
    )
    effects.push(schoolEffect(geometry, SCHOOL_COLORS.shadow))
  }

  const streak = vfx.teleportStreak
  if (streak !== null) {
    const age = state.tick - streak.spawnTick
    if (age >= 0 && age <= TELEPORT_STREAK_VISIBLE_TICKS) {
      const geometry = dodgeArcTrail(worldToScreen(streak.from), worldToScreen(streak.to), null)
      effects.push(schoolEffect(geometry, SCHOOL_COLORS.shadow))
    }
  }

  return effects
}

// ---------------------------------------------------------------------------
// 蓄能反震：蓄能護環（0–3 圈，純函式）＋格擋尾段光環（純函式，`parryTailTicksRemaining`
// 本身就足夠算出 elapsedS）。
// ---------------------------------------------------------------------------
function chargedRetaliationEffects(state: GameState): JudgmentEffect[] {
  const effects: JudgmentEffect[] = []
  const center = worldToScreen(state.player.position)

  // 平常（沒有格擋尾段事件發生）的護環：取 parry-halo 曲線「收回階段結尾」的靜止外觀
  // （elapsedS===durationS ⟹ radiusScale=1、brightness=基準值），一圈代表一層蓄能。
  for (let stack = 1; stack <= state.player.guardStacks; stack += 1) {
    const baseRadius = GUARD_RING_BASE_RADIUS_PX + (stack - 1) * GUARD_RING_SPACING_PX
    const geometry = parryHaloGeometry(center, baseRadius, PARRY_TAIL_DURATION_S, PARRY_TAIL_DURATION_S)
    effects.push(schoolEffect(geometry, SCHOOL_COLORS.guard))
  }

  // 滿層描邊（金）：純粹作為「已達上限」的資訊提示，不代表 aftershock-shield（非
  // keystone、本切片未實作）的格擋保底效果——只是同一個色彩 token 的既有語意重用。
  if (state.player.guardStacks >= GUARD_MAX_STACKS) {
    const rimRadius = GUARD_RING_BASE_RADIUS_PX + GUARD_MAX_STACKS * GUARD_RING_SPACING_PX
    const geometry = parryHaloGeometry(center, rimRadius, PARRY_TAIL_DURATION_S, PARRY_TAIL_DURATION_S)
    effects.push(schoolEffect(geometry, SCHOOL_COLORS.guardFullStackRim))
  }

  // 格擋尾段：0.15 秒真實判定窗內，護環「亮起→撐開→收回」——elapsedS 直接從
  // `parryTailTicksRemaining` 反推，不需要額外記住尾段何時開始。
  if (state.player.dodge.parryTailActive) {
    const elapsedS = PARRY_TAIL_DURATION_S - state.player.dodge.parryTailTicksRemaining * TICK_SECONDS
    const geometry = parryHaloGeometry(center, GUARD_RING_BASE_RADIUS_PX, elapsedS, PARRY_TAIL_DURATION_S)
    effects.push(schoolEffect(geometry, SCHOOL_COLORS.guard))
  }

  return effects
}

// ---------------------------------------------------------------------------
// 敵人預兆：讓玩家看得出「什麼時候該閃避」——沒有這個，遊戲本身就不可玩，
// 不是三枚 keystone 之一，但是本切片能不能真的被人類玩起來的前提。
// ---------------------------------------------------------------------------
function enemyTelegraphEffect(enemy: EnemyState): JudgmentEffect {
  const telegraphS = telegraphSeconds(enemy.kind)
  // progress：0（剛進入預兆）→ 1（判定生效的那一刻）。
  const progress = clamp01(1 - (enemy.timerTicks * TICK_SECONDS) / telegraphS)
  const center = worldToScreen(enemy.position)

  if (enemy.kind === 'ember-thrall') {
    // 「頭頂浮現擴散的紅色蓄力光暈」：借用 parry-halo 的亮起＋撐開曲線，讓光暈
    // 隨判定逼近而越來越大越亮，在判定生效瞬間（progress=1）達到最大最亮——
    // 視覺上把「還剩多少時間」轉成「光暈還有多大／多亮」，同一色只對應同一招式。
    const elapsedS = progress * HALO_EXPAND_END_RATIO
    const geometry = parryHaloGeometry(center, EMBER_THRALL_HALO_BASE_RADIUS_PX, elapsedS, 1)
    return enemyTelegraph(geometry, ENEMY_TELEGRAPH_COLORS.warningRed)
  }

  // shade-skirmisher：「下蹲蓄勢並拖出一道短暫的暗色殘影軌跡，殘影收束的瞬間突進突刺」——
  // 用殘影不透明度隨 progress 遞減，在判定生效瞬間（progress=1）完全收束消失（opacity=0），
  // 恰好對應「殘影收束的瞬間」就是突進突刺發生的時刻。
  const geometry = afterimageGeometry(
    silhouetteAround(center, SKIRMISHER_TELEGRAPH_RADIUS_PX),
    progress,
    1,
  )
  return enemyTelegraph(geometry, ENEMY_TELEGRAPH_COLORS.assassinDark)
}

/** 組出這一 tick 判定層要畫的完整特效列表。 */
export function buildJudgmentEffects(state: GameState, vfx: VfxState): JudgmentEffect[] {
  const effects: JudgmentEffect[] = []

  if (state.selectedMark === 'ember-core') {
    effects.push(...emberCoreEffects(state, vfx))
  } else if (state.selectedMark === 'precision-afterimage') {
    effects.push(...precisionAfterimageEffects(state, vfx))
  } else if (state.selectedMark === 'charged-retaliation') {
    effects.push(...chargedRetaliationEffects(state))
  }

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue
    if (enemy.attackState !== 'telegraph') continue
    effects.push(enemyTelegraphEffect(enemy))
  }

  return effects
}
