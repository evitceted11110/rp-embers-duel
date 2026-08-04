/** HUD 與 Draft 共用的固定操作槽語彙；實際按鍵仍由 input bindings 顯示。 */
export type DraftActionSlot = 'attack' | 'dodge' | 'skillQ' | 'skillE'

export const ACTION_SLOT_CONTENT: Readonly<Record<DraftActionSlot, Readonly<{ badge: string; label: string }>>> = {
  attack: { badge: '左鍵', label: '斬擊' },
  dodge: { badge: 'Space', label: '閃避' },
  skillQ: { badge: 'Q', label: '戰技 Q' },
  skillE: { badge: 'E', label: '戰技 E' },
}

const MARK_ACTION_SLOT: Readonly<Record<string, DraftActionSlot>> = {
  attack: 'attack', dodge: 'dodge', q: 'skillQ', e: 'skillE',
}

/** 將內容正本的 changes_actions 轉成畫面共用的技能槽資料。 */
export function draftActionSlots(actions: readonly string[]): readonly DraftActionSlot[] {
  return actions.map((action) => {
    const slot = MARK_ACTION_SLOT[action]
    if (slot === undefined) throw new Error(`content/marks.json 出現未知的 changes_actions：${action}`)
    return slot
  })
}
