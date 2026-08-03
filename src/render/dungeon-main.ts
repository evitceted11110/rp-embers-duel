import { connect } from '@rogue-paradise/platform-sdk'
import { createAudioDirector, createWebAudioBackend, mountAudioControls } from '../audio/index.js'
import { BINDINGS_CONFIG, createInputController, loadBindings, mountRebindPanel, type RebindPanelHandle } from '../input/index.js'
import {
  DUNGEON_HEIGHT,
  DUNGEON_WIDTH,
  PIXEL_PALETTE,
  WORLD_PIXELS_PER_UNIT,
  worldToDungeon,
} from '../visual/dungeon-art.js'
import { mountDungeonHud } from './dungeon-hud.js'
import { paintDungeon } from './dungeon-view.js'
import { createGameLoop, type GameLoop } from './game-loop.js'
import { buildHudViewModel } from './hud-view.js'
import { persistRuntimeCrash } from './runtime-safety.js'
import { impactVfxTier } from './vfx-tracker.js'

const root = document.querySelector<HTMLElement>('#app')
if (root === null) throw new Error('找不到 #app')

document.documentElement.style.background = PIXEL_PALETTE.void
document.documentElement.style.overflow = 'hidden'
document.body.style.margin = '0'
document.body.style.overflow = 'hidden'
document.body.style.background = PIXEL_PALETTE.void
root.style.width = '100vw'
root.style.height = '100vh'
root.style.display = 'grid'
root.style.placeItems = 'center'

const stage = document.createElement('div')
stage.style.position = 'relative'
stage.style.width = 'min(100vw, calc(100vh * 16 / 9))'
stage.style.aspectRatio = '16 / 9'
stage.style.maxHeight = '100vh'
stage.style.overflow = 'hidden'
stage.style.background = PIXEL_PALETTE.void
stage.style.boxShadow = '0 0 60px #08070b'
root.appendChild(stage)

const canvas = document.createElement('canvas')
canvas.width = DUNGEON_WIDTH
canvas.height = DUNGEON_HEIGHT
canvas.style.position = 'absolute'
canvas.style.inset = '0'
canvas.style.width = '100%'
canvas.style.height = '100%'
canvas.style.imageRendering = 'pixelated'
stage.appendChild(canvas)

function requireContext2d(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext('2d')
  if (context === null) throw new Error('canvas 無法取得 2D context')
  return context
}
const ctx = requireContext2d(canvas)
ctx.imageSmoothingEnabled = false

const sdk = await connect({ gameSlug: 'embers-duel' })
const bindings = await loadBindings(sdk, BINDINGS_CONFIG)
const loopHolder: { current: GameLoop | null } = { current: null }
const inputController = createInputController({
  bindings,
  contextMenuTarget: stage,
  getFallbackAim: () => loopHolder.current?.getState().player.facing ?? { x: 1, y: 0 },
  resolvePointerAim: (clientX, clientY) => {
    const bounds = canvas.getBoundingClientRect()
    const cursorX = (clientX - bounds.left) * DUNGEON_WIDTH / bounds.width
    const cursorY = (clientY - bounds.top) * DUNGEON_HEIGHT / bounds.height
    const player = worldToDungeon(loopHolder.current?.getState().player.position ?? { x: 0, y: 0 })
    return {
      x: (cursorX - player.x) / WORLD_PIXELS_PER_UNIT,
      y: (cursorY - player.y) / WORLD_PIXELS_PER_UNIT,
    }
  },
})
const audioDirector = createAudioDirector(createWebAudioBackend)
const hud = mountDungeonHud(stage, (mark) => inputController.submitDraftChoice(mark))

const settingsButton = document.createElement('button')
settingsButton.type = 'button'
settingsButton.textContent = '⚙ 設定／音量'
Object.assign(settingsButton.style, {
  position: 'absolute', top: '3%', left: '50%', transform: 'translateX(-50%)', zIndex: '10',
  pointerEvents: 'auto', color: '#e6dcc4', background: 'rgba(33,31,42,.9)', border: '2px solid #746765',
  padding: '6px 11px', fontFamily: 'system-ui,sans-serif', cursor: 'pointer',
})
stage.appendChild(settingsButton)

const settingsPanel = document.createElement('div')
Object.assign(settingsPanel.style, {
  position: 'absolute', top: '11%', left: '50%', transform: 'translateX(-50%)', zIndex: '20',
  display: 'none', pointerEvents: 'auto', minWidth: '300px', maxHeight: '78%', overflow: 'auto',
  color: '#e6dcc4', background: 'rgba(16,15,22,.96)', border: '3px solid #746765', padding: '14px',
  fontFamily: 'system-ui,sans-serif', boxShadow: '0 8px 0 #08070b',
})
stage.appendChild(settingsPanel)
mountAudioControls(settingsPanel, audioDirector)

let rebindPanel: RebindPanelHandle | null = null
settingsButton.addEventListener('click', () => {
  if (rebindPanel === null) {
    settingsPanel.style.display = 'block'
    rebindPanel = mountRebindPanel(settingsPanel, inputController, sdk)
  } else {
    rebindPanel.dispose()
    rebindPanel = null
    settingsPanel.style.display = 'none'
  }
})

const unlockAudio = (): void => {
  window.removeEventListener('pointerdown', unlockAudio)
  window.removeEventListener('keydown', unlockAudio)
  void audioDirector.unlock().catch((error: unknown) => console.error('音訊啟動失敗', error))
}
window.addEventListener('pointerdown', unlockAudio)
window.addEventListener('keydown', unlockAudio)

const loop: GameLoop = createGameLoop({
  seed: 'vertical-slice-rework-0.1.0',
  buildInput: () => inputController.buildTickInput(loop.getState().phase),
  onStateAdvanced: (previous, next) => audioDirector.handleState(previous, next),
})
loopHolder.current = loop

let previousTimestampMs: number | null = null
let terminalPhaseStartedMs: number | null = null
let previousPhase = loop.getState().phase
let runtimeFailed = false
let lastHitStopSpawnTick = -1
let visualFreezeFrames = 0

function reportRuntimeCrash(error: unknown): void {
  if (runtimeFailed) return
  runtimeFailed = true
  console.error(error)
  void persistRuntimeCrash(sdk, loop.dump(), error)
}

function frame(nowMs: number): void {
  try {
    if (previousTimestampMs !== null) loop.advanceBy((nowMs - previousTimestampMs) / 1000)
    previousTimestampMs = nowMs
    const state = loop.getState()
    const vfx = loop.getVfxState()
    if (state.phase !== previousPhase) {
      terminalPhaseStartedMs = state.phase === 'victory' || state.phase === 'defeat' ? nowMs : null
      previousPhase = state.phase
    }
    const newHitStop = vfx.attack?.hit === true && vfx.attack.spawnTick !== lastHitStopSpawnTick
    if (newHitStop) {
      lastHitStopSpawnTick = vfx.attack!.spawnTick
      visualFreezeFrames = impactVfxTier(vfx.attack!.hitIndex).hitStopFrames
    }
    const visuallyFrozen = !newHitStop && visualFreezeFrames > 0
    if (visuallyFrozen) visualFreezeFrames -= 1
    const shaking = (vfx.shakeUntilTick ?? -1) >= state.tick
    const shakePixels = vfx.shakePixels ?? 1
    canvas.style.transform = shaking ? `translate(${state.tick % 2 === 0 ? shakePixels : -shakePixels}px, ${state.tick % 3 === 0 ? shakePixels : -shakePixels}px)` : ''
    if (!visuallyFrozen) {
      ctx.clearRect(0, 0, DUNGEON_WIDTH, DUNGEON_HEIGHT)
      paintDungeon(ctx, state, vfx)
    }
    const endingVisible = terminalPhaseStartedMs === null || nowMs - terminalPhaseStartedMs >= (state.phase === 'victory' ? 2200 : 900)
    hud.update(buildHudViewModel(state, inputController.getBindings()), endingVisible)
    requestAnimationFrame(frame)
  } catch (error) {
    reportRuntimeCrash(error)
  }
}

requestAnimationFrame(frame)
window.addEventListener('error', (event) => reportRuntimeCrash(event.error ?? event.message))
window.addEventListener('unhandledrejection', (event) => reportRuntimeCrash(event.reason))
window.addEventListener('beforeunload', () => {
  rebindPanel?.dispose()
  inputController.dispose()
  audioDirector.dispose()
  sdk.disconnect()
})
