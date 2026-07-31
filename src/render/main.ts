import { connect } from '@rogue-paradise/platform-sdk'
import { createRun } from '../core/index.js'
import { theme } from '../visual/theme.js'

// 這是 render 層的暫時性佔位入口，等待下一位 Gameplay Engineer 依
// `src/core/README.md` 接上真正的渲染迴圈（accumulator + tick() + 畫面插值）。
// 本次任務範圍只交付 src/core/；此檔僅做最小更新以維持 pnpm verify 全綠。

const root = document.querySelector<HTMLElement>('#app')
if (root === null) throw new Error('找不到 #app')

const sdk = await connect({ gameSlug: 'embers-duel' })
const state = createRun('vertical-slice')

root.style.background = theme.background
root.style.color = theme.foreground
root.textContent = `餘燼決鬥場 — ${sdk.mode} — tick ${state.tick} — phase ${state.phase}`
