/**
 * 世界層畫面組裝：把 `GameState` 轉成一份 `WorldDrawCommand[]`，交給
 * `src/visual/world-layer.ts` 的 `paintWorldLayer()` 畫在 160×90 巨像素畫布上。
 *
 * 世界層的調色盤是封閉的（`WorldColor = NeutralColor | SchoolColor`，見
 * `src/visual/color.ts`／`world-layer.ts`）：只有 `NEUTRAL_COLORS.obsidianFloor`／
 * `.duskStone` 與 `SCHOOL_COLORS.ember`／`.shadow`／`.guard`／`.guardFullStackRim`
 * 六個值可用，敵人預兆色（`EnemyTelegraphColor`）不允許出現在這一層——這是
 * 型別系統本身的限制，不是這裡刻意省略。因此角色／敵人靠「形狀＋尺寸」而不是
 * 「色相」互相區分：焰奴矮胖、影刺客瘦長，玩家在選印記前是未染色的暗石色，
 * 選印記後（進入遭遇2）染成對應流派色——這件事本身就是「選擇讓角色看起來不一樣」
 * 的一個小小視覺回饋。
 */
import type { EnemyKind, GameState, MarkId, EmberCoreObject } from '../core/index.js'
import { NEUTRAL_COLORS, SCHOOL_COLORS } from '../visual/color.js'
import { toWorldCell, type WorldCell } from '../visual/world-grid.js'
import { worldRect, type WorldColor, type WorldDrawCommand } from '../visual/world-layer.js'
import { CAMERA_CENTER_CELL, worldToCell } from './camera.js'

const PLAYER_SIZE_CELLS = { width: 3, height: 4 }

/** 三種輪廓比例（提案一 §形狀語彙）：矮胖 vs 瘦長，靠尺寸而非色相區分。 */
const ENEMY_SIZE_CELLS: Record<EnemyKind, { readonly width: number; readonly height: number }> = {
  'ember-thrall': { width: 5, height: 3 },
  'shade-skirmisher': { width: 3, height: 5 },
}

/** 已武裝核心的外環：以主體為中心，四個方向各偏移 2 格的強調色像素代表外環。 */
const CORE_RING_OFFSET_CELLS = 2

/** 靜態場地邊界裝飾：一圈稀疏的暗石色標記，純粹給玩家一個空間感錨點。 */
const ARENA_RING_RADIUS_CELLS = 36
const ARENA_RING_POINT_COUNT = 24

const ARENA_RING_COMMANDS: readonly WorldDrawCommand[] = Array.from(
  { length: ARENA_RING_POINT_COUNT },
  (_, index): WorldDrawCommand => {
    const angle = (2 * Math.PI * index) / ARENA_RING_POINT_COUNT
    const cell = toWorldCell(
      CAMERA_CENTER_CELL.x + Math.cos(angle) * ARENA_RING_RADIUS_CELLS,
      CAMERA_CENTER_CELL.y + Math.sin(angle) * ARENA_RING_RADIUS_CELLS,
    )
    return worldRect(cell, NEUTRAL_COLORS.duskStone)
  },
)

function centeredRect(center: WorldCell, color: WorldColor, width: number, height: number): WorldDrawCommand {
  const topLeft = toWorldCell(center.x - Math.floor(width / 2), center.y - Math.floor(height / 2))
  return worldRect(topLeft, color, width, height)
}

/** 玩家未選印記時是未染色的暗石色；選了 keystone 後染成對應流派色。 */
function playerBodyColor(selectedMark: MarkId | null): WorldColor {
  if (selectedMark === 'ember-core') return SCHOOL_COLORS.ember
  if (selectedMark === 'precision-afterimage') return SCHOOL_COLORS.shadow
  if (selectedMark === 'charged-retaliation') return SCHOOL_COLORS.guard
  return NEUTRAL_COLORS.duskStone
}

/** 餘燼核心圖示：未武裝＝暗石色小標記；武裝後＝實心橘光主體＋四方外環。 */
function emberCoreCommands(core: EmberCoreObject): readonly WorldDrawCommand[] {
  const center = worldToCell(core.position)
  if (core.armTicksRemaining > 0) {
    return [centeredRect(center, NEUTRAL_COLORS.duskStone, 1, 1)]
  }
  return [
    centeredRect(center, SCHOOL_COLORS.ember, 2, 2),
    worldRect(toWorldCell(center.x - CORE_RING_OFFSET_CELLS, center.y), SCHOOL_COLORS.ember),
    worldRect(toWorldCell(center.x + CORE_RING_OFFSET_CELLS, center.y), SCHOOL_COLORS.ember),
    worldRect(toWorldCell(center.x, center.y - CORE_RING_OFFSET_CELLS), SCHOOL_COLORS.ember),
    worldRect(toWorldCell(center.x, center.y + CORE_RING_OFFSET_CELLS), SCHOOL_COLORS.ember),
  ]
}

/** 組出這一 tick 世界層要畫的完整繪圖指令列表（不含清空背景，那是呼叫端的職責）。 */
export function buildWorldCommands(state: GameState): WorldDrawCommand[] {
  const commands: WorldDrawCommand[] = [...ARENA_RING_COMMANDS]

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue
    const size = ENEMY_SIZE_CELLS[enemy.kind]
    commands.push(centeredRect(worldToCell(enemy.position), NEUTRAL_COLORS.duskStone, size.width, size.height))
  }

  if (state.selectedMark === 'ember-core') {
    for (const core of state.player.emberCores) commands.push(...emberCoreCommands(core))
  }

  const bodyColor = playerBodyColor(state.selectedMark)
  commands.push(
    centeredRect(worldToCell(state.player.position), bodyColor, PLAYER_SIZE_CELLS.width, PLAYER_SIZE_CELLS.height),
  )

  // 面向指示器：普攻 active 判定時延伸更遠，暗示揮擊方向與時機。
  const noseDistanceUnits = state.player.combo.phase === 'active' ? 0.6 : 0.3
  const nosePosition = {
    x: state.player.position.x + state.player.facing.x * noseDistanceUnits,
    y: state.player.position.y + state.player.facing.y * noseDistanceUnits,
  }
  commands.push(worldRect(worldToCell(nosePosition), bodyColor))

  // 餘燼核心引爆後的攻擊力加成：角色頭頂一格亮橘提示（可選的視覺提示，見
  // `src/core/README.md` 對 `attackBonusTicksRemaining` 的說明）。
  if (state.player.attackBonusTicksRemaining > 0) {
    const abovePosition = { x: state.player.position.x, y: state.player.position.y - 1 }
    commands.push(worldRect(worldToCell(abovePosition), SCHOOL_COLORS.ember))
  }

  return commands
}
