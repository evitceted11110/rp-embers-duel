import { describe, expect, it, vi } from 'vitest'
import { BINDINGS_CONFIG, defaultBindingsState } from './bindings.js'
import {
  createInputController,
  RESTART_CODE,
  type ContextMenuEvent,
  type InputDocumentLike,
  type InputWindowLike,
  type KeyCodeEvent,
  type MouseButtonEvent,
  type PointerMoveEvent,
} from './controller.js'

/**
 * 最小假瀏覽器環境：只實作 `InputWindowLike`/`InputDocumentLike` 用得到的部分，
 * 不需要 jsdom（本專案未安裝，也不打算為此新增相依套件——沿用 platform-sdk 的
 * `BrowserEnvironment` 假環境慣例）。`dispatch*` 方法讓測試可以直接觸發事件，
 * 不需要真的操作 DOM。
 */
class FakeWindow implements InputWindowLike {
  private readonly listeners = new Map<string, Set<(event: never) => void>>()

  addEventListener(type: 'keydown', listener: (event: KeyCodeEvent) => void): void
  addEventListener(type: 'keyup', listener: (event: KeyCodeEvent) => void): void
  addEventListener(type: 'mousedown', listener: (event: MouseButtonEvent) => void): void
  addEventListener(type: 'mouseup', listener: (event: MouseButtonEvent) => void): void
  addEventListener(type: 'pointermove', listener: (event: PointerMoveEvent) => void): void
  addEventListener(type: 'blur', listener: () => void): void
  addEventListener(type: 'pointercancel', listener: () => void): void
  addEventListener(type: 'contextmenu', listener: (event: ContextMenuEvent) => void): void
  addEventListener(type: string, listener: (event: never) => void): void {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: 'keydown', listener: (event: KeyCodeEvent) => void): void
  removeEventListener(type: 'keyup', listener: (event: KeyCodeEvent) => void): void
  removeEventListener(type: 'mousedown', listener: (event: MouseButtonEvent) => void): void
  removeEventListener(type: 'mouseup', listener: (event: MouseButtonEvent) => void): void
  removeEventListener(type: 'pointermove', listener: (event: PointerMoveEvent) => void): void
  removeEventListener(type: 'blur', listener: () => void): void
  removeEventListener(type: 'pointercancel', listener: () => void): void
  removeEventListener(type: 'contextmenu', listener: (event: ContextMenuEvent) => void): void
  removeEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      ;(listener as (e: unknown) => void)(event)
    }
  }

  dispatchKeyDown(event: KeyCodeEvent): void {
    this.emit('keydown', event)
  }

  dispatchKeyUp(event: KeyCodeEvent): void {
    this.emit('keyup', event)
  }

  dispatchMouseDown(event: MouseButtonEvent): void {
    this.emit('mousedown', event)
  }

  dispatchMouseUp(event: MouseButtonEvent): void {
    this.emit('mouseup', event)
  }

  dispatchPointerMove(event: PointerMoveEvent): void {
    this.emit('pointermove', event)
  }

  dispatchBlur(): void {
    this.emit('blur', undefined)
  }

  dispatchPointerCancel(): void {
    this.emit('pointercancel', undefined)
  }

  dispatchContextMenu(event: ContextMenuEvent): void {
    this.emit('contextmenu', event)
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0
  }
}

class FakeDocument implements InputDocumentLike {
  hidden = false
  private readonly listeners = new Set<() => void>()

  addEventListener(type: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(type: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener)
  }

  dispatchVisibilityChange(): void {
    for (const listener of this.listeners) listener()
  }

  listenerCount(): number {
    return this.listeners.size
  }
}

function setup(): { window: FakeWindow; document: FakeDocument; controller: ReturnType<typeof createInputController> } {
  const window = new FakeWindow()
  const document = new FakeDocument()
  const controller = createInputController({
    bindings: defaultBindingsState(BINDINGS_CONFIG),
    window,
    document,
  })
  return { window, document, controller }
}

describe('鍵盤/滑鼠 held 狀態 -> TickInput', () => {
  it('keydown 之後對應動作為 true，keyup 之後為 false', () => {
    const { window, controller } = setup()
    window.dispatchKeyDown({ code: 'KeyW' })
    expect(controller.buildTickInput('encounter1').moveY).toBe(-1)
    window.dispatchKeyUp({ code: 'KeyW' })
    expect(controller.buildTickInput('encounter1').moveY).toBe(0)
  })

  it('滑鼠左鍵按住對應 attack', () => {
    const { window, controller } = setup()
    window.dispatchMouseDown({ button: 0 })
    expect(controller.buildTickInput('encounter1').attack).toBe(true)
    window.dispatchMouseUp({ button: 0 })
    expect(controller.buildTickInput('encounter1').attack).toBe(false)
  })

  it('舞台內 pointermove 經 callback 轉成 aim，離開後仍保留最後游標方向供鍵盤攻擊', () => {
    const window = new FakeWindow()
    const document = new FakeDocument()
    const stage = { contains: (target: unknown): boolean => target === 'stage' }
    const controller = createInputController({
      bindings: defaultBindingsState(BINDINGS_CONFIG),
      window,
      document,
      contextMenuTarget: stage,
      resolvePointerAim: (clientX, clientY) => ({ x: clientX - 20, y: clientY - 10 }),
      getFallbackAim: () => ({ x: -1, y: 0 }),
    })

    expect(controller.buildTickInput('encounter1')).toMatchObject({ aimX: -1, aimY: 0 })
    window.dispatchPointerMove({ clientX: 35, clientY: 4, target: 'stage' })
    expect(controller.buildTickInput('encounter1')).toMatchObject({ aimX: 15, aimY: -6 })
    window.dispatchPointerMove({ clientX: 99, clientY: 99, target: 'settings' })
    window.dispatchKeyDown({ code: 'KeyF' })
    expect(controller.buildTickInput('encounter1')).toMatchObject({ aimX: 15, aimY: -6 })
    controller.dispose()
  })
})

describe('反向驗證：讀 KeyboardEvent.code 而非 event.key', () => {
  it('IME 組字中 code 不變、key 變成組字候選字元時，仍須用 code 判定', () => {
    const { window, controller } = setup()
    // 模擬中文輸入法組字：物理鍵是 E（code 恆為 'KeyE'），但輸入法把 key 換成
    // 組字候選字元——如果實作誤讀 event.key，這裡不會等於任何綁定鍵，
    // skillE 會被誤判為 false。
    const imeEvent: KeyCodeEvent & { readonly key: string } = { code: 'KeyE', key: '選字候選字元' }
    window.dispatchKeyDown(imeEvent)
    expect(controller.buildTickInput('encounter1').skillE).toBe(true)
  })
})

describe('失焦/隱藏/pointer cancel 清空按住狀態', () => {
  it('iframe blur 清空所有 held 狀態', () => {
    const { window, controller } = setup()
    window.dispatchKeyDown({ code: 'KeyW' })
    expect(controller.buildTickInput('encounter1').moveY).toBe(-1)
    window.dispatchBlur()
    expect(controller.buildTickInput('encounter1').moveY).toBe(0)
  })

  it('分頁隱藏（document.hidden + visibilitychange）清空所有 held 狀態', () => {
    const { window, document, controller } = setup()
    window.dispatchKeyDown({ code: 'KeyD' })
    expect(controller.buildTickInput('encounter1').moveX).toBe(1)
    document.hidden = true
    document.dispatchVisibilityChange()
    expect(controller.buildTickInput('encounter1').moveX).toBe(0)
  })

  it('document.hidden 變回 false 時的 visibilitychange 不應清空（只有變隱藏才清）', () => {
    const { window, document, controller } = setup()
    window.dispatchKeyDown({ code: 'KeyD' })
    document.hidden = false
    document.dispatchVisibilityChange()
    expect(controller.buildTickInput('encounter1').moveX).toBe(1)
  })

  it('pointercancel 清空所有 held 狀態', () => {
    const { window, controller } = setup()
    window.dispatchMouseDown({ button: 0 })
    expect(controller.buildTickInput('encounter1').attack).toBe(true)
    window.dispatchPointerCancel()
    expect(controller.buildTickInput('encounter1').attack).toBe(false)
  })
})

describe('三選一 draftChoice：只消費一次', () => {
  it('submitDraftChoice 之後下一次 buildTickInput 帶上選擇，再下一次歸零', () => {
    const { controller } = setup()
    controller.submitDraftChoice('ember-core')
    expect(controller.buildTickInput('draft').draftChoice).toBe('ember-core')
    expect(controller.buildTickInput('draft').draftChoice).toBeNull()
  })

  it('非 draft phase 時恆為 null，即使有 pending 選擇', () => {
    const { controller } = setup()
    controller.submitDraftChoice('ember-core')
    expect(controller.buildTickInput('encounter1').draftChoice).toBeNull()
  })

  it('進入 draft 時清掉最後一擊的 held 與既有 pending，必須重新按下或點選', () => {
    const { window, controller } = setup()
    window.dispatchMouseDown({ button: 0 })
    window.dispatchKeyDown({ code: 'Space' })
    controller.submitDraftChoice('ember-core')

    controller.resetForDraft()

    expect(controller.buildTickInput('draft')).toMatchObject({ attack: false, dodge: false, draftChoice: null })
    window.dispatchMouseUp({ button: 0 })
    window.dispatchKeyUp({ code: 'Space' })
    expect(controller.buildTickInput('draft')).toMatchObject({ attack: false, dodge: false })
    controller.submitDraftChoice('precision-afterimage')
    expect(controller.buildTickInput('draft').draftChoice).toBe('precision-afterimage')
  })
})

describe('快速重開鍵（RESTART_CODE，切片專用，不走可重綁系統）', () => {
  it('按住固定鍵時 restart 為 true', () => {
    const { window, controller } = setup()
    window.dispatchKeyDown({ code: RESTART_CODE })
    expect(controller.buildTickInput('encounter1').restart).toBe(true)
  })
})

describe('setBindings / getBindings：重綁後立即生效', () => {
  it('重綁 skillQ 後，舊鍵不再生效、新鍵生效', () => {
    const { window, controller } = setup()
    const rebound = { ...controller.getBindings(), skillQ: 'KeyF' }
    controller.setBindings(rebound)
    window.dispatchKeyDown({ code: 'KeyQ' })
    expect(controller.buildTickInput('encounter1').skillQ).toBe(false)
    window.dispatchKeyDown({ code: 'KeyF' })
    expect(controller.buildTickInput('encounter1').skillQ).toBe(true)
  })
})

describe('Mouse2 綁定的戰場右鍵選單', () => {
  it('Mouse2 綁定動作時，只在戰場範圍抑制 context menu', () => {
    const window = new FakeWindow()
    const document = new FakeDocument()
    const battlefield = { contains: (target: unknown): boolean => target === 'battlefield' }
    const bindings = { ...defaultBindingsState(BINDINGS_CONFIG), attack: 'Mouse2' }
    const controller = createInputController({ bindings, window, document, contextMenuTarget: battlefield })
    const inside = { target: 'battlefield', preventDefault: vi.fn() }
    const outside = { target: 'settings', preventDefault: vi.fn() }

    window.dispatchContextMenu(inside)
    window.dispatchContextMenu(outside)

    expect(inside.preventDefault).toHaveBeenCalledOnce()
    expect(outside.preventDefault).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('沒有任何動作綁 Mouse2 時不抑制戰場 context menu', () => {
    const { window, document } = setup()
    const battlefield = { contains: (): boolean => true }
    const controller = createInputController({
      bindings: defaultBindingsState(BINDINGS_CONFIG),
      window,
      document,
      contextMenuTarget: battlefield,
    })
    const event = { target: 'battlefield', preventDefault: vi.fn() }

    window.dispatchContextMenu(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    controller.dispose()
  })
})

describe('dispose：移除全部事件監聽器', () => {
  it('dispose 後 window/document 上不再殘留任何監聽器', () => {
    const { window, document, controller } = setup()
    controller.dispose()
    for (const type of ['keydown', 'keyup', 'mousedown', 'mouseup', 'pointermove', 'blur', 'pointercancel', 'contextmenu']) {
      expect(window.listenerCount(type)).toBe(0)
    }
    expect(document.listenerCount()).toBe(0)
  })
})
