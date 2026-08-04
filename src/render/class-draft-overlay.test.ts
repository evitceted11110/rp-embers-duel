import { describe, expect, it, vi } from 'vitest'
import { CLASS_CARDS } from '../core/class-expansion.js'
import { appendClassIdentityDemo, beforeAfterDemo, focusInitialClassChoice, mountClassDraftOverlay } from './class-draft-overlay.js'
import type { ClassDraftCard } from './hud-view.js'

type Listener = (event: Event) => void

class FakeElement {
  readonly children: FakeElement[] = []
  readonly style: Record<string, string> = {}
  readonly attributes = new Map<string, string>()
  readonly listeners = new Map<string, Listener[]>()
  textContent = ''
  className = ''
  type = ''
  focusCount = 0

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void { this.children.push(...children) }
  appendChild(child: FakeElement): FakeElement { this.children.push(child); return child }
  replaceChildren(...children: FakeElement[]): void { this.children.splice(0, this.children.length, ...children) }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value) }
  addEventListener(type: string, listener: Listener): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  focus(): void { this.focusCount += 1 }
  dispatch(type: string, event: Partial<KeyboardEvent> = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as Event)
  }

  descendants(tagName: string): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants(tagName)]).filter((child) => child.tagName === tagName)
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement { return new FakeElement(tagName) }
}

const cards: readonly ClassDraftCard[] = [
  { id: 'bulwark-hammer', slotBadge: '左鍵', name: '壁壘重錘', creates: '受壓環', consumes: null, tradeoff: '放棄前追' },
  { id: 'double-nail-seal', slotBadge: 'Q', name: '雙釘封口', creates: '熔鏈', consumes: '防區', tradeoff: '單釘範圍較小' },
  { id: 'pressure-furnace-roar', slotBadge: 'E', name: '反壓爐鳴', creates: '爐釘反震', consumes: '受壓環', tradeoff: '自身反震變窄' },
]

function model(showClassDraft = true) {
  return { showClassDraft, selectedMarkName: '熔衛｜佔點反擊', draftNumber: 1, selectedBuild: [], resonanceLog: [], classDraftCards: cards }
}

describe('職業 Draft before/after overlay', () => {
  it('每張職業卡都有三秒前置→結果示範資料，不以卡色或純數值取代因果', () => {
    for (const card of CLASS_CARDS) {
      const demo = beforeAfterDemo({ ...card, slotBadge: card.slot === 'primary' ? '左鍵' : card.slot.toUpperCase() as 'Q' | 'E' })
      expect(demo.before).toContain(card.creates)
      expect(demo.after).toContain(card.name)
    }
  })

  it('Draft 開啟時建立 DOM 示範、首次 focus 第一張；逐幀 update 不重建或搶回焦點', () => {
    const document = new FakeDocument()
    vi.stubGlobal('document', document)
    const stage = new FakeElement('div')
    const choose = vi.fn()
    const overlay = mountClassDraftOverlay(stage as unknown as HTMLElement, choose)

    overlay.update(model())
    const buttons = stage.descendants('button')
    const figures = stage.descendants('figure')
    expect(buttons).toHaveLength(3)
    expect(figures).toHaveLength(3)
    const first = buttons[0]
    const sheet = stage.descendants('style')[0]
    if (first === undefined || sheet === undefined) throw new Error('職業 Draft DOM 未完整建立')
    expect(first.focusCount).toBe(1)
    expect(first.attributes.get('aria-keyshortcuts')).toBe('Enter Space')
    expect(sheet.textContent).toContain('3s')

    overlay.update(model())
    expect(first.focusCount).toBe(1)
  })

  it('焦點中的卡用 Enter 或空白鍵可選，關閉後下次 Draft 才重新 focus', () => {
    const document = new FakeDocument()
    vi.stubGlobal('document', document)
    const stage = new FakeElement('div')
    const choose = vi.fn()
    const overlay = mountClassDraftOverlay(stage as unknown as HTMLElement, choose)
    overlay.update(model())
    const first = stage.descendants('button')[0]
    if (first === undefined) throw new Error('職業 Draft 第一張卡未建立')
    const prevented = vi.fn()
    first.dispatch('keydown', { key: 'Enter', preventDefault: prevented })
    expect(prevented).toHaveBeenCalledOnce()
    expect(choose).toHaveBeenCalledWith('bulwark-hammer')

    overlay.update(model(false))
    overlay.update(model())
    expect(first.focusCount).toBe(2)
  })

  it('職業選擇也有 before/after 視覺與掛載後焦點', () => {
    const document = new FakeDocument()
    vi.stubGlobal('document', document)
    const button = new FakeElement('button')
    appendClassIdentityDemo('shadowline-hunter', button as unknown as HTMLElement)
    focusInitialClassChoice(button as unknown as HTMLButtonElement)
    expect(button.descendants('figure')).toHaveLength(1)
    expect(button.focusCount).toBe(1)
  })
})
