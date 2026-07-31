import { describe, expect, it } from 'vitest'
import {
  CHARGED_RETALIATION,
  EMBER_CORE,
  EMBER_THRALL,
  ENCOUNTER_1,
  ENCOUNTER_2,
  PRECISION_AFTERIMAGE,
  SHADE_SKIRMISHER,
  ZONE_1_CLEAR_HEAL_HP,
} from './content.js'

describe('content：讀取 content/*.json 的三枚 keystone 印記與兩種敵人', () => {
  it('餘燼核心欄位皆為合法正數', () => {
    expect(EMBER_CORE.placeDistanceUnits).toBeGreaterThan(0)
    expect(EMBER_CORE.armDelayS).toBe(2.0)
    expect(EMBER_CORE.qCooldownS).toBe(5)
    expect(EMBER_CORE.detonateDamage).toBe(18)
    expect(EMBER_CORE.detonateRadiusUnits).toBe(1.8)
    expect(EMBER_CORE.postDetonateAttackBonusPct).toBe(25)
    expect(EMBER_CORE.postDetonateAttackBonusDurationS).toBe(1.5)
  })

  it('精準殘影欄位皆為合法正數', () => {
    expect(PRECISION_AFTERIMAGE.precisionWindowS).toBe(0.12)
    expect(PRECISION_AFTERIMAGE.afterimageDurationS).toBe(1.6)
    expect(PRECISION_AFTERIMAGE.maxCharges).toBe(2)
    expect(PRECISION_AFTERIMAGE.eCooldownS).toBe(4)
    expect(PRECISION_AFTERIMAGE.eTeleportDamage).toBe(14)
  })

  it('蓄能反震欄位皆為合法正數', () => {
    expect(CHARGED_RETALIATION.maxStacks).toBe(3)
    expect(CHARGED_RETALIATION.dodgeTrailingParryS).toBe(0.15)
    expect(CHARGED_RETALIATION.eCooldownS).toBe(8)
    expect(CHARGED_RETALIATION.damagePerStack).toBe(6)
  })

  it('兩種敵人資料正確', () => {
    expect(EMBER_THRALL.hp).toBe(200)
    expect(SHADE_SKIRMISHER.hp).toBe(145)
    expect(SHADE_SKIRMISHER.telegraphS).toBeCloseTo(0.35)
  })

  it('戰區一兩場遭遇戰的敵人組成符合 spec：焰奴×1，接著焰奴×2＋影刺客×1', () => {
    expect(ENCOUNTER_1).toEqual([{ kind: 'ember-thrall', count: 1 }])
    expect(ENCOUNTER_2).toEqual([
      { kind: 'ember-thrall', count: 2 },
      { kind: 'shade-skirmisher', count: 1 },
    ])
    expect(ZONE_1_CLEAR_HEAL_HP).toBe(44)
  })
})
