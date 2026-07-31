import { NEUTRAL_COLORS } from './color.js'

// background 採用 design/visual-proposals.md §7.2 決策紀錄的黑曜岩底色；
// foreground（HUD 文字色）不在本次視覺方向決策範圍內，維持既有佔位值。
export const theme = {
  background: NEUTRAL_COLORS.obsidianFloor,
  foreground: '#f3f4f6',
} as const
