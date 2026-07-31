import { describe, expect, it } from 'vitest'
import { telegraphSeconds } from './enemy-content.js'

describe('telegraphSeconds：讀自 content/enemies.json 的 telegraph_ms', () => {
  it('焰奴 500ms → 0.5 秒', () => {
    expect(telegraphSeconds('ember-thrall')).toBe(0.5)
  })

  it('影刺客 350ms → 0.35 秒，明顯短於焰奴（逼玩家提高閃避判斷頻率）', () => {
    expect(telegraphSeconds('shade-skirmisher')).toBe(0.35)
    expect(telegraphSeconds('shade-skirmisher')).toBeLessThan(telegraphSeconds('ember-thrall'))
  })
})
