import { describe, expect, it } from 'vitest'
import { createRun, type GameState } from '../core/index.js'
import { buildHudViewModel } from './hud-view.js'

function state(overrides: Partial<GameState> = {}): GameState {
  const base = createRun('hud-view-test')
  return { ...base, ...overrides }
}

describe('buildHudViewModel：血量／冷卻／階段的純資料轉換', () => {
  it('滿血時 hpPercent=100，hpText 顯示 220/220', () => {
    const vm = buildHudViewModel(state())
    expect(vm.hpPercent).toBe(100)
    expect(vm.hpText).toBe('220 / 220')
  })

  it('hp 歸零時 hpPercent 夾在 0（不會變負數）', () => {
    const base = state()
    const vm = buildHudViewModel({ ...base, player: { ...base.player, hp: -10 } })
    expect(vm.hpPercent).toBe(0)
  })

  it('冷卻 tick 數正確換算成秒數', () => {
    const base = state()
    const vm = buildHudViewModel({ ...base, player: { ...base.player, qCooldownTicksRemaining: 250, eCooldownTicksRemaining: 0 } })
    expect(vm.qCooldownSecondsRemaining).toBe(2.5)
    expect(vm.eCooldownSecondsRemaining).toBe(0)
  })

  it('尚未選印記時 selectedMarkName 為 null；選了之後回傳印記名稱', () => {
    expect(buildHudViewModel(state({ selectedMark: null })).selectedMarkName).toBeNull()
    expect(buildHudViewModel(state({ selectedMark: 'ember-core' })).selectedMarkName).toBe('餘燼核心')
  })

  it('phase 對應正確的中文標籤', () => {
    expect(buildHudViewModel(state({ phase: 'encounter1' })).phaseLabel).toContain('遭遇 1')
    expect(buildHudViewModel(state({ phase: 'encounter2' })).phaseLabel).toContain('遭遇 2')
  })
})

describe('buildHudViewModel：三選一與終局橫幅', () => {
  it('phase=draft 時 showDraft 為 true，且輸出固定三張 keystone 卡片', () => {
    const vm = buildHudViewModel(state({ phase: 'draft' }))
    expect(vm.showDraft).toBe(true)
    expect(vm.draftCards.map((c) => c.id)).toEqual(['ember-core', 'precision-afterimage', 'charged-retaliation'])
  })

  it('非 draft 階段 showDraft 為 false', () => {
    expect(buildHudViewModel(state({ phase: 'encounter1' })).showDraft).toBe(false)
  })

  it('victory/defeat 階段輸出對應橫幅，提示玩家按 R 重開；其餘階段無橫幅', () => {
    expect(buildHudViewModel(state({ phase: 'victory' })).banner?.title).toBe('勝利')
    expect(buildHudViewModel(state({ phase: 'defeat' })).banner?.title).toBe('戰敗')
    expect(buildHudViewModel(state({ phase: 'encounter1' })).banner).toBeNull()
  })
})
