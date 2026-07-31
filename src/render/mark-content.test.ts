import { describe, expect, it } from 'vitest'
import {
  AFTERIMAGE_DURATION_S,
  DRAFT_CARD_ORDER,
  GUARD_MAX_STACKS,
  PARRY_TAIL_DURATION_S,
  draftCardContent,
} from './mark-content.js'

describe('draftCardContent：三選一卡片資料來自 content/marks.json 正本', () => {
  it('DRAFT_CARD_ORDER 固定是三枚 keystone，且每枚都能取出卡片資料', () => {
    expect(DRAFT_CARD_ORDER).toEqual(['ember-core', 'precision-afterimage', 'charged-retaliation'])
    for (const id of DRAFT_CARD_ORDER) {
      const card = draftCardContent(id)
      expect(card.name.length).toBeGreaterThan(0)
      expect(card.visibleFeedback.length).toBeGreaterThan(0)
      expect(card.tagline.length).toBeGreaterThan(0)
    }
  })

  it('餘燼核心卡片的學派與名稱與 content 正本一致', () => {
    const card = draftCardContent('ember-core')
    expect(card.school).toBe('ember')
    expect(card.name).toBe('餘燼核心')
  })

  it('視覺回饋文字直接取自 content 正本，不是渲染層自己編的', () => {
    const card = draftCardContent('precision-afterimage')
    expect(card.visibleFeedback).toContain('殘影')
  })
})

describe('數值參數讀自 content/marks.json，不寫死複製一份魔法數字', () => {
  it('殘影存續秒數與格擋尾段秒數為合法正數', () => {
    expect(AFTERIMAGE_DURATION_S).toBeGreaterThan(0)
    expect(PARRY_TAIL_DURATION_S).toBeGreaterThan(0)
    expect(GUARD_MAX_STACKS).toBe(3)
  })

  it('格擋尾段（0.15s）明顯短於殘影存續（1.6s）——兩者不是同一個常數誤植', () => {
    expect(PARRY_TAIL_DURATION_S).toBeLessThan(AFTERIMAGE_DURATION_S)
  })
})
