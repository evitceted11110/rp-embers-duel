/**
 * HUD 的 DOM 接線：把 `hud-view.ts` 算出的純資料套進實際 DOM 元素。
 *
 * 沿用 `src/input/rebind-panel.ts` 的既有慣例：所有可驗證的邏輯都在 `hud-view.ts`
 * （有測試），這裡純粹是「把資料寫進 DOM」的接線，不另外寫測試。
 *
 * 色彩說明：`design/style-guide.md` 的色彩規則只約束畫面世界層／判定層（canvas 繪製
 * 的遊戲視覺），HUD 文字色本身「不在本次視覺方向決策範圍內，維持既有佔位值」
 * （見 `src/visual/theme.ts` 頂部註解）。這裡的 HUD 純 UI 圖表（血條、卡片背景）
 * 因此使用一般 CSS 具名色彩，不使用 `src/visual/color.ts` 的流派／敵人色 token——
 * 那些 token 各自綁定明確的遊戲語意（流派特效／敵人預兆），挪用在 UI 圖表上反而
 * 會製造「這個顏色代表什麼」的混淆。
 */
import type { MarkId } from '../core/index.js'
import { theme } from '../visual/theme.js'
import type { HudViewModel } from './hud-view.js'

export type HudDomHandle = {
  update(model: HudViewModel): void
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  Object.assign(node.style, style)
  if (text !== undefined) node.textContent = text
  return node
}

const PANEL_BACKGROUND = 'rgba(0, 0, 0, 0.55)'

export function mountHud(container: HTMLElement, onSelectMark: (markId: MarkId) => void): HudDomHandle {
  const root = el('div', {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    fontFamily: 'monospace',
    color: theme.foreground,
    userSelect: 'none',
  })
  container.appendChild(root)

  // 操作提示：固定在畫面底部，最小的提示即可，不需要精美教學。
  const hintBar = el(
    'div',
    {
      position: 'absolute',
      bottom: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: PANEL_BACKGROUND,
      padding: '4px 12px',
      fontSize: '13px',
      borderRadius: '4px',
      whiteSpace: 'nowrap',
    },
    'WASD 移動｜滑鼠左鍵 攻擊｜空白鍵 閃避｜Q／E 技能｜R 重開',
  )
  root.appendChild(hintBar)

  // 左上角：血量、階段、印記名稱。
  const topLeft = el('div', {
    position: 'absolute',
    top: '8px',
    left: '8px',
    background: PANEL_BACKGROUND,
    padding: '6px 10px',
    borderRadius: '4px',
    fontSize: '13px',
    lineHeight: '1.6',
  })
  root.appendChild(topLeft)

  const phaseLabelNode = el('div', { fontWeight: 'bold' })
  const markLabelNode = el('div', { opacity: '0.85' })
  const hpTrack = el('div', {
    width: '160px',
    height: '10px',
    background: 'dimgray',
    borderRadius: '3px',
    overflow: 'hidden',
    marginTop: '4px',
  })
  const hpFill = el('div', { width: '100%', height: '100%', background: 'crimson' })
  hpTrack.appendChild(hpFill)
  const hpTextNode = el('div', { fontSize: '11px', opacity: '0.85' })
  topLeft.appendChild(phaseLabelNode)
  topLeft.appendChild(markLabelNode)
  topLeft.appendChild(hpTrack)
  topLeft.appendChild(hpTextNode)

  // 右上角：Q／E 冷卻秒數。
  const topRight = el('div', {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: PANEL_BACKGROUND,
    padding: '6px 10px',
    borderRadius: '4px',
    fontSize: '13px',
    lineHeight: '1.6',
  })
  root.appendChild(topRight)
  const qCooldownNode = el('div', {})
  const eCooldownNode = el('div', {})
  topRight.appendChild(qCooldownNode)
  topRight.appendChild(eCooldownNode)

  // 三選一：三張卡片，各自標題／一句話標籤／content 正本的 visible_feedback。
  const draftOverlay = el('div', {
    position: 'absolute',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    background: 'rgba(0, 0, 0, 0.6)',
    pointerEvents: 'auto',
  })
  root.appendChild(draftOverlay)

  const draftTitle = el(
    'div',
    { position: 'absolute', top: '18%', width: '100%', textAlign: 'center', fontSize: '20px', fontWeight: 'bold' },
    '選擇一枚流派印記',
  )
  draftOverlay.appendChild(draftTitle)

  const draftCardsRow = el('div', { display: 'flex', gap: '16px' })
  draftOverlay.appendChild(draftCardsRow)

  const cardNameNodes = new Map<MarkId, HTMLElement>()
  const cardTaglineNodes = new Map<MarkId, HTMLElement>()
  const cardFeedbackNodes = new Map<MarkId, HTMLElement>()

  function buildDraftCard(): { button: HTMLButtonElement; name: HTMLElement; tagline: HTMLElement; feedback: HTMLElement } {
    const button = el('button', {
      width: '220px',
      minHeight: '180px',
      background: 'rgba(255, 255, 255, 0.08)',
      border: '2px solid rgba(255, 255, 255, 0.4)',
      borderRadius: '8px',
      color: theme.foreground,
      fontFamily: 'monospace',
      padding: '14px',
      textAlign: 'left',
      cursor: 'pointer',
    })
    const name = el('div', { fontSize: '16px', fontWeight: 'bold', marginBottom: '6px' })
    const tagline = el('div', { fontSize: '12px', opacity: '0.8', marginBottom: '10px' })
    const feedback = el('div', { fontSize: '12px', lineHeight: '1.5' })
    button.appendChild(name)
    button.appendChild(tagline)
    button.appendChild(feedback)
    return { button, name, tagline, feedback }
  }

  let draftCardsBuilt = false

  function ensureDraftCards(model: HudViewModel): void {
    if (draftCardsBuilt) return
    draftCardsBuilt = true
    for (const card of model.draftCards) {
      const parts = buildDraftCard()
      parts.button.addEventListener('click', () => onSelectMark(card.id))
      draftCardsRow.appendChild(parts.button)
      cardNameNodes.set(card.id, parts.name)
      cardTaglineNodes.set(card.id, parts.tagline)
      cardFeedbackNodes.set(card.id, parts.feedback)
    }
  }

  // 終局橫幅：勝利／戰敗，提示按 R 重開。
  const bannerOverlay = el('div', {
    position: 'absolute',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    background: 'rgba(0, 0, 0, 0.6)',
    gap: '8px',
  })
  root.appendChild(bannerOverlay)
  const bannerTitleNode = el('div', { fontSize: '32px', fontWeight: 'bold' })
  const bannerSubtitleNode = el('div', { fontSize: '14px', opacity: '0.85' })
  bannerOverlay.appendChild(bannerTitleNode)
  bannerOverlay.appendChild(bannerSubtitleNode)

  function update(model: HudViewModel): void {
    phaseLabelNode.textContent = model.phaseLabel
    markLabelNode.textContent = model.selectedMarkName === null ? '尚未選擇印記' : `印記：${model.selectedMarkName}`
    hpFill.style.width = `${model.hpPercent}%`
    hpTextNode.textContent = `HP ${model.hpText}`
    qCooldownNode.textContent = `Q 冷卻：${model.qCooldownSecondsRemaining.toFixed(1)}s`
    eCooldownNode.textContent = `E 冷卻：${model.eCooldownSecondsRemaining.toFixed(1)}s`

    ensureDraftCards(model)
    for (const card of model.draftCards) {
      const name = cardNameNodes.get(card.id)
      const tagline = cardTaglineNodes.get(card.id)
      const feedback = cardFeedbackNodes.get(card.id)
      if (name !== undefined) name.textContent = card.name
      if (tagline !== undefined) tagline.textContent = card.tagline
      if (feedback !== undefined) feedback.textContent = card.visibleFeedback
    }
    draftOverlay.style.display = model.showDraft ? 'flex' : 'none'

    if (model.banner === null) {
      bannerOverlay.style.display = 'none'
    } else {
      bannerOverlay.style.display = 'flex'
      bannerTitleNode.textContent = model.banner.title
      bannerSubtitleNode.textContent = model.banner.subtitle
    }
  }

  return { update }
}
