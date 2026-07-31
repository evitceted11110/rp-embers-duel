/**
 * 渲染層入口：接上 accumulator + core 的 `tick()` + 畫面插值（見 `src/core/README.md`）
 * 的完整遊戲迴圈，把《餘燼決鬥場》Vertical Slice 接成一個人類打開瀏覽器就能玩的頁面。
 *
 * 架構（照 `design/visual-proposals.md` §7.2 定案，不重新設計）：
 * - 世界層：160×90 內部解析度，CSS 整數放大 8× 至 1280×720，nearest-neighbor，
 *   不旋轉、不做非整數縮放（見下方 world canvas 的樣式設定）。
 * - 判定層：獨立疊在世界層之上的 1280×720 原生解析度 canvas，允許反鋸齒與次像素。
 * - HUD：純 DOM，蓋在兩層 canvas 最上面。
 *
 * 遊戲迴圈本身（accumulator、crash-dump recorder、vfx 記憶）在 `game-loop.ts`；
 * 這個檔案只負責「把它接上真正的瀏覽器」：canvas、DOM、sdk、輸入控制器、rAF。
 */
import { connect } from '@rogue-paradise/platform-sdk'
import {
  BINDINGS_CONFIG,
  createInputController,
  loadBindings,
  mountRebindPanel,
  type RebindPanelHandle,
} from '../input/index.js'
import { paintJudgmentLayer } from '../visual/judgment-layer.js'
import { theme } from '../visual/theme.js'
import { clearWorldLayer, paintWorldLayer } from '../visual/world-layer.js'
import { SCREEN_HEIGHT, SCREEN_WIDTH, WORLD_GRID_HEIGHT, WORLD_GRID_WIDTH } from '../visual/world-grid.js'
import { toJudgmentPaintTarget, toWorldPaintTarget } from './canvas-adapter.js'
import { createGameLoop, type GameLoop } from './game-loop.js'
import { mountHud } from './hud-dom.js'
import { buildHudViewModel } from './hud-view.js'
import { buildJudgmentEffects } from './judgment-view.js'
import { shouldRenderTick } from './render-schedule.js'
import { persistRuntimeCrash } from './runtime-safety.js'
import { buildWorldCommands } from './world-view.js'

/** Vertical Slice 固定種子——切片測試便利機制（KeyR 快速重開）見 `src/core/README.md`。 */
const SEED = 'vertical-slice'

const root = document.querySelector<HTMLElement>('#app')
if (root === null) throw new Error('找不到 #app')

document.body.style.margin = '0'
document.body.style.background = theme.background
document.body.style.display = 'flex'
document.body.style.justifyContent = 'center'
document.body.style.alignItems = 'center'
document.body.style.minHeight = '100vh'

const stage = document.createElement('div')
stage.style.position = 'relative'
stage.style.width = `${SCREEN_WIDTH}px`
stage.style.height = `${SCREEN_HEIGHT}px`
stage.style.background = theme.background
root.appendChild(stage)

// 世界層：160×90 內部解析度，CSS 放大到 1280×720。nearest-neighbor、不旋轉、
// 不做非整數縮放——`image-rendering: pixelated` 與 `imageSmoothingEnabled = false`
// 是這條規則目前唯一的檢查點（見 design/style-guide.md「解析度與縮放」表）。
const worldCanvas = document.createElement('canvas')
worldCanvas.width = WORLD_GRID_WIDTH
worldCanvas.height = WORLD_GRID_HEIGHT
worldCanvas.style.position = 'absolute'
worldCanvas.style.inset = '0'
worldCanvas.style.width = `${SCREEN_WIDTH}px`
worldCanvas.style.height = `${SCREEN_HEIGHT}px`
worldCanvas.style.imageRendering = 'pixelated'
stage.appendChild(worldCanvas)

// 用一個回傳「非 null 型別」的函式取代單純的 if-throw：TypeScript 的流程分析
// 不會把「這裡檢查過 null」的窄化結果帶進之後才定義、稍後才被 rAF 呼叫的 render()
// 函式閉包裡（closure 內對外部 const 的型別分析看的是宣告型別，不是窄化後型別），
// 用回傳型別本身保證非 null，而不是依賴流程窄化，才能讓 render() 內部使用時
// 不必再處理一次 null 分支。
function requireContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas 無法取得 2D context')
  return ctx
}

const worldCtx = requireContext2d(worldCanvas)
worldCtx.imageSmoothingEnabled = false
const worldPaintTarget = toWorldPaintTarget(worldCtx)

// 判定層：原生 1280×720，允許反鋸齒與次像素——不對這層做任何量化或最近鄰設定。
const judgmentCanvas = document.createElement('canvas')
judgmentCanvas.width = SCREEN_WIDTH
judgmentCanvas.height = SCREEN_HEIGHT
judgmentCanvas.style.position = 'absolute'
judgmentCanvas.style.inset = '0'
judgmentCanvas.style.width = `${SCREEN_WIDTH}px`
judgmentCanvas.style.height = `${SCREEN_HEIGHT}px`
judgmentCanvas.style.pointerEvents = 'none'
stage.appendChild(judgmentCanvas)

const judgmentCtx = requireContext2d(judgmentCanvas)
const judgmentPaintTarget = toJudgmentPaintTarget(judgmentCtx)

const sdk = await connect({ gameSlug: 'embers-duel' })
const bindings = await loadBindings(sdk, BINDINGS_CONFIG)
const inputController = createInputController({ bindings, contextMenuTarget: stage })

const hud = mountHud(stage, (markId) => inputController.submitDraftChoice(markId))

// 設定（重綁鍵位）：最小化的切換按鈕，不是本切片的驗收重點，但重綁面板已經是
// 現成、有測試的功能（src/input/rebind-panel.ts），花很小的接線成本就能讓 Gate 3
// 試玩者在鍵位不合手時自己重綁，不需要另外準備一支操作說明。
const settingsButton = document.createElement('button')
settingsButton.textContent = '⚙ 設定'
settingsButton.style.position = 'absolute'
settingsButton.style.top = '8px'
settingsButton.style.right = '50%'
settingsButton.style.transform = 'translateX(50%)'
settingsButton.style.fontFamily = 'monospace'
settingsButton.style.fontSize = '12px'
settingsButton.style.cursor = 'pointer'
stage.appendChild(settingsButton)

const settingsContainer = document.createElement('div')
settingsContainer.style.position = 'absolute'
settingsContainer.style.top = '32px'
settingsContainer.style.right = '50%'
settingsContainer.style.transform = 'translateX(50%)'
settingsContainer.style.background = 'rgba(0, 0, 0, 0.75)'
settingsContainer.style.color = theme.foreground
settingsContainer.style.fontFamily = 'monospace'
settingsContainer.style.fontSize = '12px'
settingsContainer.style.padding = '8px'
settingsContainer.style.borderRadius = '4px'
settingsContainer.style.display = 'none'
stage.appendChild(settingsContainer)

let rebindPanel: RebindPanelHandle | null = null
settingsButton.addEventListener('click', () => {
  if (rebindPanel === null) {
    settingsContainer.style.display = 'block'
    rebindPanel = mountRebindPanel(settingsContainer, inputController, sdk)
  } else {
    rebindPanel.dispose()
    rebindPanel = null
    settingsContainer.style.display = 'none'
  }
})

const loop: GameLoop = createGameLoop({
  seed: SEED,
  buildInput: () => inputController.buildTickInput(loop.getState().phase),
})

let lastRenderedTick: number | null = null
function render(): void {
  const state = loop.getState()
  if (!shouldRenderTick(lastRenderedTick, state.tick)) return
  lastRenderedTick = state.tick

  clearWorldLayer(worldPaintTarget)
  paintWorldLayer(worldPaintTarget, buildWorldCommands(state))

  judgmentCtx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
  paintJudgmentLayer(judgmentPaintTarget, buildJudgmentEffects(state, loop.getVfxState()))

  hud.update(buildHudViewModel(state))
}

let previousTimestampMs: number | null = null
let runtimeFailed = false

function reportRuntimeCrash(error: unknown): void {
  if (runtimeFailed) return
  runtimeFailed = true
  void persistRuntimeCrash(sdk, loop.dump(), error)
}

function frame(nowMs: number): void {
  try {
    if (previousTimestampMs !== null) {
      const dtSeconds = (nowMs - previousTimestampMs) / 1000
      loop.advanceBy(dtSeconds)
    }
    previousTimestampMs = nowMs
    render()
    requestAnimationFrame(frame)
  } catch (error) {
    reportRuntimeCrash(error)
  }
}

try {
  render() // 首幀先畫一次，避免 rAF 觸發前畫面是空的。
  requestAnimationFrame(frame)
} catch (error) {
  reportRuntimeCrash(error)
}

window.addEventListener('error', (event) => reportRuntimeCrash(event.error ?? event.message))
window.addEventListener('unhandledrejection', (event) => reportRuntimeCrash(event.reason))

window.addEventListener('beforeunload', () => {
  rebindPanel?.dispose()
  inputController.dispose()
  sdk.disconnect()
})
