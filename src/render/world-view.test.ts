import { describe, expect, it } from 'vitest'
import { createRun, type GameState } from '../core/index.js'
import { NEUTRAL_COLORS, SCHOOL_COLORS } from '../visual/color.js'
import { worldToCell } from './camera.js'
import { buildWorldCommands } from './world-view.js'

function state(overrides: Partial<GameState> = {}): GameState {
  const base = createRun('world-view-test')
  return { ...base, ...overrides, enemies: overrides.enemies ?? base.enemies }
}

describe('玩家世界層剪影：未選印記＝暗石色，選了 keystone 後染成對應流派色', () => {
  it('encounter1（selectedMark=null）玩家是暗石色', () => {
    const commands = buildWorldCommands(state({ selectedMark: null }))
    expect(commands.some((c) => c.color === NEUTRAL_COLORS.duskStone && c.widthCells === 3)).toBe(true)
  })

  it.each([
    ['ember-core', SCHOOL_COLORS.ember],
    ['precision-afterimage', SCHOOL_COLORS.shadow],
    ['charged-retaliation', SCHOOL_COLORS.guard],
  ] as const)('selectedMark=%s 時玩家主體染成對應流派色', (mark, color) => {
    const commands = buildWorldCommands(state({ selectedMark: mark }))
    const playerBody = commands.find((c) => c.widthCells === 3 && c.heightCells === 4)
    expect(playerBody?.color).toBe(color)
  })
})

describe('敵人剪影：矮胖（焰奴）vs 瘦長（影刺客），靠尺寸而非色相區分', () => {
  it('焰奴輸出寬>高的色塊，影刺客輸出高>寬的色塊，且都不會用到敵人預兆色', () => {
    const base = createRun('world-view-enemies')
    const commands = buildWorldCommands({
      ...base,
      enemies: [
        { id: 'thrall', kind: 'ember-thrall', position: { x: 1, y: 0 }, hp: 200, maxHp: 200, attackState: 'approach', timerTicks: 0 },
        { id: 'skirmisher', kind: 'shade-skirmisher', position: { x: -1, y: 0 }, hp: 145, maxHp: 145, attackState: 'approach', timerTicks: 0 },
      ],
    })

    const thrallCmd = commands.find((c) => c.widthCells === 5 && c.heightCells === 3)
    const skirmisherCmd = commands.find((c) => c.widthCells === 3 && c.heightCells === 5)
    expect(thrallCmd).toBeDefined()
    expect(skirmisherCmd).toBeDefined()
    expect(thrallCmd?.color).toBe(NEUTRAL_COLORS.duskStone)
    expect(skirmisherCmd?.color).toBe(NEUTRAL_COLORS.duskStone)
  })

  it('已死亡（hp<=0）的敵人不畫', () => {
    const base = createRun('world-view-dead')
    const commands = buildWorldCommands({
      ...base,
      enemies: [{ id: 'dead', kind: 'ember-thrall', position: { x: 1, y: 0 }, hp: 0, maxHp: 200, attackState: 'approach', timerTicks: 0 }],
    })
    expect(commands.some((c) => c.widthCells === 5 && c.heightCells === 3)).toBe(false)
  })
})

describe('餘燼核心圖示：未武裝＝暗石色小標記，武裝後＝實心橘光主體＋四方外環', () => {
  // 核心與玩家本體在 selectedMark='ember-core' 時都可能用到 ember 色，因此以下兩個
  // 測試鎖定「核心座標本身」的格子，而不是整份指令列表裡任意 ember 色出現的次數，
  // 避免跟玩家自己的剪影／面向指示器（同樣是 ember 色）混淆。
  it('armTicksRemaining>0（未武裝）在核心座標畫的是暗石色，不是 ember 色', () => {
    const corePosition = { x: 2, y: 0 }
    const base = state({ selectedMark: 'ember-core' })
    const s: GameState = {
      ...base,
      player: { ...base.player, emberCores: [{ position: corePosition, armTicksRemaining: 50 }] },
    }
    const coreCell = worldToCell(corePosition)
    const atCore = buildWorldCommands(s).find((c) => c.cell.x === coreCell.x && c.cell.y === coreCell.y)
    expect(atCore?.color).toBe(NEUTRAL_COLORS.duskStone)
  })

  it('armTicksRemaining<=0（已武裝）在核心座標畫出 2x2 ember 主體，且四個方向各偏移 2 格處各有一個 ember 外環點', () => {
    const corePosition = { x: 2, y: 0 }
    const base = state({ selectedMark: 'ember-core' })
    const s: GameState = {
      ...base,
      player: { ...base.player, emberCores: [{ position: corePosition, armTicksRemaining: 0 }] },
    }
    const coreCell = worldToCell(corePosition)
    const commands = buildWorldCommands(s)

    const body = commands.find(
      (c) => c.color === SCHOOL_COLORS.ember && c.widthCells === 2 && c.heightCells === 2 && c.cell.x === coreCell.x - 1 && c.cell.y === coreCell.y - 1,
    )
    expect(body).toBeDefined()

    const ringOffsets = [
      { x: coreCell.x - 2, y: coreCell.y },
      { x: coreCell.x + 2, y: coreCell.y },
      { x: coreCell.x, y: coreCell.y - 2 },
      { x: coreCell.x, y: coreCell.y + 2 },
    ]
    for (const offset of ringOffsets) {
      const ringCell = commands.find(
        (c) => c.color === SCHOOL_COLORS.ember && c.widthCells === 1 && c.heightCells === 1 && c.cell.x === offset.x && c.cell.y === offset.y,
      )
      expect(ringCell).toBeDefined()
    }
  })

  it('selectedMark 不是 ember-core 時不畫核心圖示（就算 emberCores 陣列非空）', () => {
    const base = state({ selectedMark: 'charged-retaliation' })
    const s: GameState = {
      ...base,
      player: { ...base.player, emberCores: [{ position: { x: 2, y: 0 }, armTicksRemaining: 0 }] },
    }
    expect(buildWorldCommands(s).some((c) => c.color === SCHOOL_COLORS.ember)).toBe(false)
  })
})

describe('攻擊力加成提示：只在 attackBonusTicksRemaining>0 時多畫一格', () => {
  it('有加成時角色頭頂多一個 ember 色 1x1 提示', () => {
    const base = state({ selectedMark: 'ember-core' })
    const s: GameState = { ...base, player: { ...base.player, attackBonusTicksRemaining: 50 } }
    const withBonus = buildWorldCommands(s).filter((c) => c.color === SCHOOL_COLORS.ember)
    const without = buildWorldCommands(state({ selectedMark: 'ember-core' })).filter((c) => c.color === SCHOOL_COLORS.ember)
    expect(withBonus.length).toBe(without.length + 1)
  })
})

describe('場地邊界裝飾：靜態一圈暗石色標記永遠存在，給玩家空間錨點', () => {
  it('任何狀態下輸出都包含一圈 24 個暗石色 1x1 標記', () => {
    const commands = buildWorldCommands(state())
    const ringPoints = commands.filter((c) => c.color === NEUTRAL_COLORS.duskStone && c.widthCells === 1 && c.heightCells === 1)
    expect(ringPoints.length).toBeGreaterThanOrEqual(24)
  })
})
