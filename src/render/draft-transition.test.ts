import { describe, expect, it, vi } from 'vitest'
import { DRAFT_REVEAL_DELAY_MS, createDraftTransition } from './draft-transition.js'

describe('清房後三選一保護期', () => {
  it('進入 draft 後先保留清房回饋，時間到才顯示並接受新的明確選擇', () => {
    const onEnterDraft = vi.fn()
    const transition = createDraftTransition(onEnterDraft)

    transition.observePhase('encounter1', 1000)
    transition.observePhase('draft', 1010)

    expect(onEnterDraft).toHaveBeenCalledOnce()
    expect(transition.presentation('draft', 1010)).toEqual({ showDraft: false, showClearFeedback: true })
    expect(transition.trySelect('ember-core', 1010)).toBeNull()
    expect(transition.presentation('draft', 1010 + DRAFT_REVEAL_DELAY_MS)).toEqual({
      showDraft: true,
      showClearFeedback: false,
    })
    expect(transition.trySelect('ember-core', 1010 + DRAFT_REVEAL_DELAY_MS)).toBe('ember-core')
  })

  it('同一個 draft 的重複 frame 不會重設保護期', () => {
    const onEnterDraft = vi.fn()
    const transition = createDraftTransition(onEnterDraft)

    transition.observePhase('encounter1', 0)
    transition.observePhase('draft', 10)
    transition.observePhase('draft', 500)

    expect(onEnterDraft).toHaveBeenCalledOnce()
    expect(transition.presentation('draft', 10 + DRAFT_REVEAL_DELAY_MS).showDraft).toBe(true)
  })

  it('非 draft phase 不顯示、不接受殘留選擇', () => {
    const transition = createDraftTransition(() => undefined)
    transition.observePhase('encounter1', 0)

    expect(transition.presentation('encounter1', 9999)).toEqual({ showDraft: false, showClearFeedback: false })
    expect(transition.trySelect('ember-core', 9999)).toBeNull()
  })
})
