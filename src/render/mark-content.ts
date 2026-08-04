/**
 * 讀取 `content/marks.json`，取出三選一畫面與判定層渲染需要的三枚 keystone 印記資料。
 *
 * 這裡獨立讀取 JSON，不深入 import `src/core/content.ts`（那是 core 的內部模組，
 * `src/core/README.md` 明講渲染層只應該從 `src/core/index.ts` 這個公開介面 import）。
 * 沿用本專案既有慣例（`sim/prototype.ts` 與 `src/core/content.ts` 也是各自獨立讀同一份
 * `content/marks.json`，彼此不互相 import）：Designer 改內容，這裡與 core 都會各自反映，
 * 不會有「內容正本改了但某處沒讀到」的漂移風險。
 *
 * `content/marks.json` 本身不被本檔修改，只讀取。
 */
import marksJson from '../../content/marks.json'
import type { MarkId } from '../core/index.js'
import { draftActionSlots, type DraftActionSlot } from './action-slot-content.js'

type MarkJson = {
  readonly id: string
  readonly name: string
  readonly school: 'ember' | 'shadow' | 'guard'
  readonly changes_actions: readonly string[]
  readonly visible_feedback: string
  readonly decision_change: string
  readonly effect: Record<string, unknown>
}

const marks = marksJson.marks as readonly MarkJson[]

function findMark(id: MarkId): MarkJson {
  const mark = marks.find((candidate) => candidate.id === id)
  if (mark === undefined) throw new Error(`content/marks.json 缺少印記 ${id}`)
  return mark
}

function effectNumber(id: MarkId, field: string): number {
  const value = findMark(id).effect[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`印記 ${id} 的 effect.${field} 缺失或不是合法數字，渲染層無法啟動`)
  }
  return value
}

/** 三選一卡片的顯示資料：一句話定位 + 內容正本的 visible_feedback（已經是精簡的單句，不另外改寫）。 */
export type DraftCardContent = {
  readonly id: MarkId
  readonly name: string
  readonly school: 'ember' | 'shadow' | 'guard'
  /** 一句話點出這枚印記改寫了哪個按鍵/動作，渲染層自撰（不是 content 正本，只是 UI 標籤）。 */
  readonly tagline: string
  readonly visibleFeedback: string
  /** 此卡會改寫的固定操作槽；供 Draft 徽章與 HUD 使用相同語彙。 */
  readonly affectedSlots: readonly DraftActionSlot[]
}

const DRAFT_TAGLINES: Record<MarkId, string> = {
  'ember-core': 'Q：放置核心｜閃避：彎曲弧線引爆',
  'cracking-flame-combo': '第三段：改為廣角裂焰終結斬',
  'twin-core-resonance': 'Q：雙核心｜引爆：必定連鎖',
  'ember-sacrifice': 'E：引爆全場已武裝核心',
  'precision-afterimage': '閃避：精準判定留殘影｜E：瞬移到殘影',
  'pursuit-strike': '精準閃避後：第一斬變為突進刺擊',
  'phantom-reset': '精準閃避：立即重置閃避冷卻',
  'shadow-harvest': 'Q：所有殘影同步爆裂',
  'charged-retaliation': '閃避：疊蓄能護環｜E：層數兌現衝擊波',
  'aftershock-shield': '滿蓄能：尾段必擋並強化下一次 E',
  'mirror-plating': 'Q：舉盾格擋並反傷蓄能',
  'bulwark-chain': '兩層蓄能：首斬擴大並維持連段',
}

/** 三選一畫面固定順序：裂焰／影步／守勢，對應 `content/marks.json` 的 keystone 印記。 */
export const DRAFT_CARD_ORDER: readonly MarkId[] = [
  'ember-core',
  'cracking-flame-combo',
  'twin-core-resonance',
  'ember-sacrifice',
  'precision-afterimage',
  'pursuit-strike',
  'phantom-reset',
  'shadow-harvest',
  'charged-retaliation',
  'aftershock-shield',
  'mirror-plating',
  'bulwark-chain',
]

export function draftCardContent(id: MarkId): DraftCardContent {
  const mark = findMark(id)
  return {
    id,
    name: mark.name,
    school: mark.school,
    tagline: DRAFT_TAGLINES[id],
    visibleFeedback: mark.visible_feedback,
    affectedSlots: draftActionSlots(mark.changes_actions),
  }
}

/** 精準殘影 keystone：殘影存續秒數（`effect.afterimage_duration_s`）。 */
export const AFTERIMAGE_DURATION_S = effectNumber('precision-afterimage', 'afterimage_duration_s')

/** 蓄能反震 keystone：格擋尾段秒數（`effect.dodge_trailing_parry_s`，0.15 秒）。 */
export const PARRY_TAIL_DURATION_S = effectNumber('charged-retaliation', 'dodge_trailing_parry_s')

/** 蓄能反震 keystone：最大蓄能層數（`effect.max_stacks`，上限 3）。 */
export const GUARD_MAX_STACKS = effectNumber('charged-retaliation', 'max_stacks')
