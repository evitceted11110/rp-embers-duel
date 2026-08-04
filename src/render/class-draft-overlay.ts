import type { ClassId } from '../core/index.js'
import type { ClassDraftCard, HudViewModel } from './hud-view.js'

type SelectForgeCard = (cardId: string) => void

export type BeforeAfterDemo = {
  readonly before: string
  readonly after: string
  readonly beforeGlyph: string
  readonly afterGlyph: string
  readonly accent: string
}

const SHADOWLINE_CARD_IDS = new Set([
  'crossed-sheath', 'broken-shadow-step', 'stitched-corner', 'pinned-body-swap',
  'double-line-return', 'gap-marking', 'loop-tether', 'reverse-mark-anchor',
  'returning-rend', 'residual-collection', 'terminal-drop', 'cross-line-borrow', 'shadow-identity',
])

/**
 * 卡片示範是純呈現資料：不影響戰鬥規則，也不以文字取代戰場上的因果。
 * 每 3 秒完整走過「前置物存在 → 此槽作用後的結果」一次；玩家可隨時選牌。
 */
export function beforeAfterDemo(card: ClassDraftCard): BeforeAfterDemo {
  const forgeguard = !SHADOWLINE_CARD_IDS.has(card.id)
  const creates = card.creates === '無' ? '站位與敵方預兆' : card.creates
  const consumes = card.consumes ?? '本槽的時機'
  return {
    before: `前｜${creates}`,
    after: `後｜${consumes} → ${card.name}`,
    beforeGlyph: forgeguard ? '◉' : '╱',
    afterGlyph: forgeguard ? '✹' : '✦',
    accent: forgeguard ? '#f2b45d' : '#74d4cf',
  }
}

function style(node: HTMLElement, values: Partial<CSSStyleDeclaration>): void {
  Object.assign(node.style, values)
}

function appendDemo(card: ClassDraftCard, parent: HTMLElement): void {
  const demo = beforeAfterDemo(card)
  const forgeguard = !SHADOWLINE_CARD_IDS.has(card.id)
  const figure = document.createElement('figure')
  figure.setAttribute('aria-label', `三秒示範：${demo.before}；${demo.after}`)
  style(figure, { margin: '11px 0', minHeight: '54px', position: 'relative', overflow: 'hidden', border: `1px solid ${demo.accent}`, background: '#14131b' })
  const before = document.createElement('div')
  before.className = 'class-draft-demo-before'
  const after = document.createElement('div')
  after.className = 'class-draft-demo-after'
  for (const [frame, caption, resolved] of [[before, demo.before, false], [after, demo.after, true]] as const) {
    style(frame, { position: 'absolute', inset: '0', display: 'grid', gridTemplateColumns: '48px 1fr', alignItems: 'center', gap: '4px', padding: '5px', fontSize: '11px', color: demo.accent, textAlign: 'left' })
    const geometry = document.createElement('span')
    geometry.setAttribute('aria-hidden', 'true')
    style(geometry, {
      width: resolved ? '36px' : '18px', height: resolved ? '36px' : '18px', justifySelf: 'center',
      border: `2px solid ${demo.accent}`, borderRadius: forgeguard ? '50%' : '0', transform: forgeguard ? 'none' : 'rotate(45deg)',
      boxShadow: resolved ? `0 0 0 6px #14131b, 0 0 0 8px ${demo.accent}` : `0 0 0 3px #14131b, 0 0 0 5px ${demo.accent}`,
    })
    const label = document.createElement('span')
    label.textContent = `${resolved ? demo.afterGlyph : demo.beforeGlyph} ${caption}`
    frame.append(geometry, label)
    figure.appendChild(frame)
  }
  parent.appendChild(figure)
}

function installStyles(container: HTMLElement): void {
  const sheet = document.createElement('style')
  sheet.textContent = `
    @keyframes classDraftBefore { 0%,49.9% { opacity:1; transform:translateX(0) } 50%,100% { opacity:0; transform:translateX(-12px) } }
    @keyframes classDraftAfter { 0%,49.9% { opacity:0; transform:translateX(12px) } 50%,100% { opacity:1; transform:translateX(0) } }
    .class-draft-demo-before { animation: classDraftBefore 3s steps(1,end) infinite; }
    .class-draft-demo-after { animation: classDraftAfter 3s steps(1,end) infinite; }
    .class-draft-card:hover,.class-draft-card:focus-visible { transform:translateY(-5px); border-color:#fff0ad !important; outline:3px solid #fff0ad; }
  `
  container.appendChild(sheet)
}

function keyboardActivate(event: KeyboardEvent, select: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  select()
}

export type ClassDraftOverlayHandle = {
  update(model: Pick<HudViewModel, 'showClassDraft' | 'selectedMarkName' | 'draftNumber' | 'selectedBuild' | 'resonanceLog' | 'classDraftCards'>): void
}

/** DOM 專用職業 Draft；1.0 的印記 Draft 仍由 dungeon-hud.ts 維護。 */
export function mountClassDraftOverlay(container: HTMLElement, onSelect: SelectForgeCard): ClassDraftOverlayHandle {
  installStyles(container)
  const overlay = document.createElement('section')
  overlay.setAttribute('aria-label', '職業鍛造選擇')
  overlay.setAttribute('aria-live', 'polite')
  style(overlay, { position: 'absolute', inset: '0', zIndex: '25', display: 'none', alignItems: 'flex-end', justifyContent: 'center', gap: '12px', paddingBottom: '8%', background: 'rgba(16,15,22,.62)', pointerEvents: 'auto', fontFamily: 'system-ui,sans-serif', color: '#e6dcc4' })
  container.appendChild(overlay)

  let contentKey = ''
  let wasVisible = false
  let firstCard: HTMLButtonElement | null = null

  function render(model: Parameters<ClassDraftOverlayHandle['update']>[0]): void {
    const content = model.classDraftCards
    const nextKey = `${model.selectedMarkName}|${model.draftNumber}|${model.selectedBuild.map((card) => card.id).join('|')}|${model.resonanceLog.join('|')}|${content.map((card) => card.id).join('|')}`
    if (nextKey === contentKey) return
    contentKey = nextKey
    firstCard = null
    overlay.replaceChildren()
    const title = document.createElement('div')
    title.textContent = `${model.selectedMarkName}｜第 ${model.draftNumber}／6 次鍛造`
    style(title, { position: 'absolute', top: '10%', fontSize: '21px', color: '#ffd37a' })
    const summary = document.createElement('div')
    summary.textContent = `已鍛造：${model.selectedBuild.map((card) => `${card.slotBadge}｜${card.name}`).join('、') || '尚無'}｜共鳴：${model.resonanceLog.join('、') || '尚未形成'}`
    style(summary, { position: 'absolute', top: '16%', fontSize: '13px', color: '#d9cbb3' })
    overlay.append(title, summary)
    for (const card of content) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'class-draft-card'
      button.setAttribute('aria-label', `${card.slotBadge}｜${card.name}。${beforeAfterDemo(card).before}；${beforeAfterDemo(card).after}。按 Enter 或空白鍵鍛造。`)
      button.setAttribute('aria-keyshortcuts', 'Enter Space')
      style(button, { width: '220px', minHeight: '205px', padding: '12px', textAlign: 'left', cursor: 'pointer', color: '#e6dcc4', background: '#211f2a', border: '2px solid #746765', font: 'inherit' })
      const heading = document.createElement('strong')
      heading.textContent = `${card.slotBadge}｜${card.name}`
      const details = document.createElement('div')
      details.textContent = `留下：${card.creates}${card.consumes === null ? '' : ` → 作用 ${card.consumes}`}｜取捨：${card.tradeoff}`
      style(details, { marginTop: '7px', fontSize: '11px', lineHeight: '1.4' })
      button.append(heading, details)
      appendDemo(card, button)
      const select = (): void => onSelect(card.id)
      button.addEventListener('click', select)
      button.addEventListener('keydown', (event) => keyboardActivate(event, select))
      overlay.appendChild(button)
      if (firstCard === null) firstCard = button
    }
  }

  return {
    update(model): void {
      const visible = model.showClassDraft && model.selectedMarkName !== null
      if (!visible) {
        overlay.style.display = 'none'
        wasVisible = false
        return
      }
      render(model)
      overlay.style.display = 'flex'
      if (!wasVisible) firstCard?.focus()
      wasVisible = true
    },
  }
}

/** 職業二選一同樣讓玩家先看到三秒的姿態前後差異，而非只讀一行口號。 */
export function appendClassIdentityDemo(classId: ClassId, parent: HTMLElement): void {
  const card: ClassDraftCard = classId === 'forgeguard'
    ? { id: 'forge-identity', slotBadge: 'E', name: '防區反震', creates: '爐釘防區', consumes: '成功格擋', tradeoff: '必須守在防區內' }
    : { id: 'shadow-identity', slotBadge: 'E', name: '線路收割', creates: '影線與殘切', consumes: '沿線穿越', tradeoff: '落點暴露' }
  appendDemo(card, parent)
}

/** 等 overlay 已掛到舞台後再設定焦點，避免首次鍵盤操作落在頁面背景。 */
export function focusInitialClassChoice(button: HTMLButtonElement): void {
  button.focus()
}
