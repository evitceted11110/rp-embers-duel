import type { MarkId } from '../core/index.js'
import type { HudViewModel } from './hud-view.js'

export type DungeonHudHandle = { update(model: HudViewModel, endingVisible?: boolean, showClearFeedback?: boolean): void }

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

const MARK_COLORS: Readonly<Record<MarkId, string>> = {
  'ember-core': '#e85d32',
  'cracking-flame-combo': '#e85d32',
  'twin-core-resonance': '#ffd37a',
  'ember-sacrifice': '#e85d32',
  'precision-afterimage': '#74d4cf',
  'pursuit-strike': '#74d4cf',
  'phantom-reset': '#79658e',
  'shadow-harvest': '#74d4cf',
  'charged-retaliation': '#f2df9b',
  'aftershock-shield': '#f2df9b',
  'mirror-plating': '#f2df9b',
  'bulwark-chain': '#f2df9b',
}

const MARK_STEPS: Readonly<Record<MarkId, readonly string[]>> = {
  'ember-core': ['Q 放核心', '閃避掃過', '環火引爆'],
  'cracking-flame-combo': ['完成連段', '第三斬展開', '扇焰掃群'],
  'twin-core-resonance': ['連放雙核', '閃避引爆', '連鎖共振'],
  'ember-sacrifice': ['布置核心', '等待武裝', 'E 全域引爆'],
  'precision-afterimage': ['精準閃避', '留下殘影', 'E 交叉瞬斬'],
  'pursuit-strike': ['精準閃避', '抓住窗口', '首斬突進'],
  'phantom-reset': ['看準攻勢', '精準閃避', '立刻再閃'],
  'shadow-harvest': ['留下殘影', 'Q 集束', '多點爆裂'],
  'charged-retaliation': ['閃避蓄能', '盾瓣累積', 'E 反震'],
  'aftershock-shield': ['蓄滿三層', '尾段格擋', '強化反震'],
  'mirror-plating': ['Q 舉盾', '正面格下', '反傷蓄能'],
  'bulwark-chain': ['蓄能兩層', '擴大首斬', '連段不斷'],
}

function installStyles(container: HTMLElement): void {
  const style = document.createElement('style')
  style.textContent = `
    .dungeon-hud{position:absolute;inset:0;pointer-events:none;color:#e6dcc4;font-family:ui-sans-serif,system-ui,"PingFang TC","Noto Sans TC",sans-serif;text-shadow:0 2px #100f16;user-select:none}
    .hud-panel{background:linear-gradient(180deg,rgba(24,21,29,.93),rgba(16,15,22,.78));border:2px solid #746765;box-shadow:inset 0 0 0 2px #302f37,0 4px 0 rgba(8,7,11,.5)}
    .hero-status{position:absolute;left:2%;top:3%;width:min(31%,330px);padding:9px 11px;display:grid;grid-template-columns:48px 1fr;gap:9px}
    .portrait{width:44px;height:44px;background:#211f2a;border:2px solid #746765;position:relative}.portrait:before{content:"";position:absolute;left:10px;top:8px;width:24px;height:20px;background:#aeb4b4;clip-path:polygon(0 15%,78% 0,100% 28%,88% 100%,10% 100%)}.portrait:after{content:"";position:absolute;left:14px;top:24px;width:18px;height:5px;background:#100f16;box-shadow:7px 1px #ffd37a}
    .hp-label{font-size:12px;display:flex;justify-content:space-between}.hp-track{height:12px;background:#211f2a;border:2px solid #100f16;position:relative;overflow:hidden}.hp-delay,.hp-fill{position:absolute;inset:0 auto 0 0;transition:width .35s}.hp-delay{background:#7d2d32}.hp-fill{background:linear-gradient(90deg,#a73437,#e85d32);transition-duration:.1s}.mark-line{font-size:12px;color:#d9cbb3;margin-top:3px}.build-list{display:flex;gap:3px;flex-wrap:wrap;margin-top:4px}.build-mark{font-size:9px;border:1px solid currentColor;padding:2px 4px;background:#17151c}.build-mark.ember{color:#e85d32}.build-mark.shadow{color:#74d4cf}.build-mark.guard{color:#f2df9b}
    .objective{position:absolute;right:2%;top:3%;padding:9px 13px;text-align:right;min-width:210px}.room{font-size:15px;font-weight:800;letter-spacing:.12em;color:#ffd37a}.goal{font-size:12px;margin-top:3px}
    .action-bar{position:absolute;left:50%;bottom:2.5%;transform:translateX(-50%);display:flex;gap:7px}.action-slot{width:92px;height:58px;padding:6px;position:relative;overflow:hidden}.action-slot.failed{animation:slotFail .18s 2;border-color:#7d2d32}.slot-cooldown{position:absolute;left:0;right:0;bottom:0;background:rgba(11,10,15,.72);transition:height .08s}.slot-label,.slot-key,.slot-time{position:relative;z-index:1}.slot-label{font-size:11px;color:#d0c4b0}.slot-key{font-size:15px;font-weight:900;color:#ffd37a}.slot-time{position:absolute;right:6px;bottom:5px;font-size:10px}
    .restart-hint{position:absolute;right:2%;bottom:3%;font-size:11px;color:#aeb4b4}.draft{position:absolute;inset:0;display:none;align-items:flex-end;justify-content:center;gap:1.2%;padding:0 4% 6%;background:rgba(16,15,22,.58);pointer-events:auto}.draft.visible{display:flex}.draft-title{position:absolute;top:9%;left:0;right:0;text-align:center}.draft-title b{display:block;font-size:25px;color:#ffd37a;letter-spacing:.18em}.draft-title span{font-size:13px}
    .mark-card{width:28%;max-width:300px;min-height:210px;padding:14px;background:linear-gradient(160deg,#393642,#211f2a 65%);color:#e6dcc4;border:3px solid var(--mark);box-shadow:inset 0 0 0 3px #100f16,0 7px 0 #100f16;text-align:left;cursor:pointer;font:inherit}.mark-card:hover,.mark-card:focus-visible{transform:translateY(-6px);outline:3px solid #fff0ad}.mark-glyph{width:32px;height:32px;display:grid;place-items:center;color:var(--mark);font-size:25px}.mark-name{font-size:18px;font-weight:900;color:var(--mark)}.mark-tag{font-size:11px;min-height:34px;margin:5px 0}.steps{display:flex;gap:4px;margin:9px 0}.step{flex:1;border:1px solid #746765;padding:6px 3px;text-align:center;font-size:10px;background:#17151c}.step+.step:before{content:"› ";color:var(--mark)}.feedback{font-size:11px;line-height:1.45;color:#c7baa5}
    .clear-feedback{position:absolute;inset:0;display:none;place-items:center;background:radial-gradient(circle,rgba(255,211,122,.12),transparent 48%);font-size:24px;font-weight:900;letter-spacing:.22em;color:#ffd37a;animation:clearPulse .7s ease-out;pointer-events:none}.clear-feedback.visible{display:grid}
    .ending{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(16,15,22,.64);pointer-events:none}.ending.visible{display:flex}.ending-box{padding:24px 40px;text-align:center;min-width:310px}.ending h1{margin:0;color:#ffd37a;font-size:34px;letter-spacing:.16em}.ending p{font-size:14px}.ending .ending-key{display:inline-block;border:2px solid #746765;padding:7px 14px;color:#e6dcc4;background:#211f2a}
    @keyframes slotFail{50%{transform:translateX(4px);filter:brightness(.55)}}@keyframes clearPulse{0%{opacity:0;transform:scale(.85)}30%{opacity:1}100%{opacity:.72;transform:scale(1)}}
    @media(max-width:760px){.hero-status{width:42%;grid-template-columns:34px 1fr;padding:5px}.portrait{width:30px;height:30px}.objective{min-width:150px;padding:6px}.action-slot{width:66px;height:46px;padding:4px}.slot-label{font-size:9px}.slot-key{font-size:11px}.mark-card{min-height:175px;padding:8px}.feedback{display:none}.steps{flex-direction:column}.draft{padding-bottom:3%}}
  `
  container.appendChild(style)
}

export function mountDungeonHud(container: HTMLElement, onSelectMark: (mark: MarkId) => void): DungeonHudHandle {
  installStyles(container)
  const root = element('div', 'dungeon-hud')
  container.appendChild(root)

  const status = element('section', 'hero-status hud-panel')
  status.appendChild(element('div', 'portrait'))
  const vitals = element('div', 'vitals')
  const hpLabel = element('div', 'hp-label')
  const hpName = element('span', '', '餘火')
  const hpText = element('span', '')
  hpLabel.append(hpName, hpText)
  const hpTrack = element('div', 'hp-track')
  const hpDelay = element('div', 'hp-delay')
  const hpFill = element('div', 'hp-fill')
  hpTrack.append(hpDelay, hpFill)
  const markLine = element('div', 'mark-line', '印記｜尚未刻印')
  const buildList = element('div', 'build-list')
  vitals.append(hpLabel, hpTrack, markLine, buildList)
  status.appendChild(vitals)
  root.appendChild(status)

  const objective = element('section', 'objective hud-panel')
  const room = element('div', 'room')
  const goal = element('div', 'goal')
  objective.append(room, goal)
  root.appendChild(objective)

  const actionBar = element('section', 'action-bar')
  const slots = new Map<string, { root: HTMLElement; key: HTMLElement; cooldown: HTMLElement; time: HTMLElement }>()
  for (const id of ['attack', 'dodge', 'skillQ', 'skillE']) {
    const slot = element('div', 'action-slot hud-panel')
    const cooldown = element('div', 'slot-cooldown')
    const label = element('div', 'slot-label')
    const key = element('div', 'slot-key')
    const time = element('div', 'slot-time')
    slot.append(cooldown, label, key, time)
    actionBar.appendChild(slot)
    slots.set(id, { root: slot, key, cooldown, time })
  }
  root.appendChild(actionBar)
  root.appendChild(element('div', 'restart-hint', 'R｜快速重開'))

  const draft = element('section', 'draft')
  const draftTitle = element('div', 'draft-title')
  draftTitle.innerHTML = '<b>三燼祭壇</b><span>選擇一枚印記，改寫下一場戰鬥</span>'
  draft.appendChild(draftTitle)
  const cardNodes = new Map<MarkId, { button: HTMLButtonElement; name: HTMLElement; tag: HTMLElement; feedback: HTMLElement }>()
  root.appendChild(draft)

  const clearFeedback = element('section', 'clear-feedback', '遭遇突破')
  root.appendChild(clearFeedback)

  const ending = element('section', 'ending')
  const endingBox = element('div', 'ending-box hud-panel')
  const endingTitle = element('h1', '')
  const endingSubtitle = element('p', '')
  const endingMark = element('p', 'ending-mark')
  const endingKey = element('div', 'ending-key')
  endingBox.append(endingTitle, endingSubtitle, endingMark, endingKey)
  ending.appendChild(endingBox)
  root.appendChild(ending)

  let builtCardKey = ''
  let delayedHp = 100
  let previousHp = 100

  function buildCards(model: HudViewModel): void {
    const nextKey = model.draftCards.map((card) => card.id).join('|')
    if (nextKey === builtCardKey) return
    builtCardKey = nextKey
    for (const nodes of cardNodes.values()) nodes.button.remove()
    cardNodes.clear()
    for (const card of model.draftCards) {
      const button = element('button', 'mark-card')
      button.type = 'button'
      button.style.setProperty('--mark', MARK_COLORS[card.id])
      const glyph = element('div', 'mark-glyph', card.id === 'ember-core' ? '♨' : card.id === 'precision-afterimage' ? '✣' : '⬡')
      const name = element('div', 'mark-name')
      const tag = element('div', 'mark-tag')
      const steps = element('div', 'steps')
      for (const stepText of MARK_STEPS[card.id]) steps.appendChild(element('div', 'step', stepText))
      const feedback = element('div', 'feedback')
      button.append(glyph, name, tag, steps, feedback)
      button.addEventListener('click', () => onSelectMark(card.id))
      draft.appendChild(button)
      cardNodes.set(card.id, { button, name, tag, feedback })
    }
  }

  return {
    update(model: HudViewModel, endingVisible = true, showClearFeedback = false): void {
      hpText.textContent = model.hpText
      hpFill.style.width = `${model.hpPercent}%`
      if (model.hpPercent < previousHp) delayedHp = previousHp
      delayedHp += (model.hpPercent - delayedHp) * 0.08
      hpDelay.style.width = `${Math.max(model.hpPercent, delayedHp)}%`
      previousHp = model.hpPercent
      markLine.textContent = model.selectedMarkName === null ? '印記｜尚未刻印' : `印記｜${model.selectedMarkName}`
      buildList.replaceChildren(...model.selectedBuild.map((mark) => element('span', `build-mark ${mark.school}`, mark.name)))
      room.textContent = model.roomName
      goal.textContent = model.objective
      for (const action of model.actionSlots) {
        const slot = slots.get(action.id)
        if (slot === undefined) continue
        slot.root.querySelector<HTMLElement>('.slot-label')!.textContent = action.label
        slot.key.textContent = action.binding
        slot.cooldown.style.height = `${action.cooldownPercent}%`
        slot.time.textContent = action.cooldownSeconds > 0 ? `${action.cooldownSeconds.toFixed(1)}s` : 'READY'
        slot.root.classList.toggle('failed', action.failed)
      }
      buildCards(model)
      draftTitle.innerHTML = `<b>第 ${model.draftNumber}／6 次刻印</b><span>以下皆為目前構築可合法選擇的印記</span>`
      for (const card of model.draftCards) {
        const nodes = cardNodes.get(card.id)
        if (nodes === undefined) continue
        nodes.name.textContent = card.name
        nodes.tag.textContent = card.tagline
        nodes.feedback.textContent = card.visibleFeedback
      }
      draft.classList.toggle('visible', model.showDraft)
      clearFeedback.classList.toggle('visible', showClearFeedback)
      ending.classList.toggle('visible', model.banner !== null && endingVisible)
      if (model.banner !== null) {
        endingTitle.textContent = model.banner.title
        endingSubtitle.textContent = model.banner.subtitle
        endingMark.textContent = model.selectedMarkName === null ? '未選擇印記' : `本次印記｜${model.selectedMarkName}`
        endingKey.textContent = 'R　重新開始'
      }
    },
  }
}
