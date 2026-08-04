import { describe, expect, it } from 'vitest'
import { createRun, type GameState } from '../core/index.js'
import { bindingLabel, buildHudViewModel } from './hud-view.js'

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
    for (const phase of ['encounter3', 'encounter4', 'encounter5', 'encounter6', 'boss'] as const) {
      expect(buildHudViewModel(state({ phase })).phaseLabel.length).toBeGreaterThan(0)
    }
  })
})

describe('buildHudViewModel：三選一與終局橫幅', () => {
  it('phase=draft 時 showDraft 為 true，且輸出固定三張 keystone 卡片', () => {
    const vm = buildHudViewModel(state({ phase: 'draft' }))
    expect(vm.showDraft).toBe(true)
    expect(vm.draftCards.map((c) => c.id)).toEqual(['ember-core', 'precision-afterimage', 'charged-retaliation'])
  })

  it('後續 draft 只輸出 core 提供的合法 options，並保留完整已選 build', () => {
    const vm = buildHudViewModel(state({
      phase: 'draft', encounterIndex: 3,
      selectedMark: 'pursuit-strike',
      selectedMarks: ['precision-afterimage', 'pursuit-strike'],
      draftOptions: ['phantom-reset', 'shadow-harvest', 'cracking-flame-combo'],
    }))
    expect(vm.draftCards.map((card) => card.id)).toEqual(['phantom-reset', 'shadow-harvest', 'cracking-flame-combo'])
    expect(vm.selectedBuild.map((mark) => mark.id)).toEqual(['precision-afterimage', 'pursuit-strike'])
    expect(vm.draftNumber).toBe(5)
    expect(vm.roomName).toContain('鏡影祭壇')
  })

  it('非 draft 階段 showDraft 為 false', () => {
    expect(buildHudViewModel(state({ phase: 'encounter1' })).showDraft).toBe(false)
  })

  it('職業 Run 將鍛造選項、已選槽位卡與共鳴接入 HUD，而不污染 1.0 印記 Draft', () => {
    const base = state({ classId: 'forgeguard', phase: 'draft', forgeOptions: ['bulwark-hammer', 'fire-hook', 'pressure-furnace-roar'], selectedClassCards: ['bulwark-hammer'], resonanceLog: ['防區反震'] })
    const vm = buildHudViewModel(base)
    expect(vm.showDraft).toBe(false)
    expect(vm.showClassDraft).toBe(true)
    expect(vm.classDraftCards.map((card) => card.slotBadge)).toEqual(['左鍵', 'Q', 'E'])
    expect(vm.selectedBuild).toEqual([expect.objectContaining({ id: 'bulwark-hammer', slotBadge: '左鍵' })])
    expect(vm.resonanceLog).toEqual(['防區反震'])
  })

  it('victory/defeat 階段輸出對應橫幅，提示玩家按 R 重開；其餘階段無橫幅', () => {
    expect(buildHudViewModel(state({ phase: 'victory' })).banner?.title).toBe('餘火未熄')
    expect(buildHudViewModel(state({ phase: 'defeat' })).banner?.title).toBe('餘火熄滅')
    expect(buildHudViewModel(state({ phase: 'encounter1' })).banner).toBeNull()
  })
})

describe('rework 0.1.0 HUD：房間目標與動態 bindings', () => {
  it('把常用 KeyboardEvent.code 轉成玩家可讀標籤', () => {
    expect(bindingLabel('Mouse0')).toBe('滑鼠左鍵')
    expect(bindingLabel('Space')).toBe('空白鍵')
    expect(bindingLabel('KeyF')).toBe('F')
    expect(bindingLabel(null)).toBe('未綁定')
  })

  it('四個行動槽使用目前 bindings，不寫死 Q/E/Space', () => {
    const vm = buildHudViewModel(state(), {
      moveUp: 'KeyW', moveDown: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD',
      attack: 'KeyJ', dodge: 'KeyK', skillQ: 'KeyU', skillE: 'KeyI',
    })
    expect(vm.actionSlots.map((slot) => slot.binding)).toEqual(['J', 'K', 'U', 'I'])
    expect(vm.actionSlots.map((slot) => slot.slotBadge)).toEqual(['左鍵', 'Space', 'Q', 'E'])
    expect(vm.roomName).toBe('鑄火祭壇')
    expect(vm.objective).toContain('第 0 次刻印')
  })
})
