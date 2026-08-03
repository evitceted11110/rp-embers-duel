import { describe, expect, it } from 'vitest'
import {
  ATTACK_HALF_ANGLES_RAD,
  ATTACK_RANGES_UNITS,
  createPlayerAttackGeometry,
  enemyHurtboxRadius,
  playerAttackHitsCircle,
  type EnemyKind,
} from './index.js'

const RIGHT = { x: 1, y: 0 } as const

function geometry(hitIndex: 1 | 2 | 3, marks: Parameters<typeof createPlayerAttackGeometry>[0]['selectedMarks'] = []) {
  return createPlayerAttackGeometry({
    position: { x: 0, y: 0 },
    facing: RIGHT,
    hitIndex,
    selectedMarks: marks,
    pursuitActive: false,
    guardStacks: 0,
  })
}

describe('玩家普攻幾何單一真相來源', () => {
  it('三段 physical reach 依 640×360 的 22px/unit 放大為可讀的輕、輕、重劍光', () => {
    expect(ATTACK_RANGES_UNITS).toEqual([1.3, 1.45, 1.95])
    expect(ATTACK_RANGES_UNITS.map((range) => range * 22)).toEqual([28.6, 31.9, 42.9])
    expect(ATTACK_HALF_ANGLES_RAD).toEqual([
      Math.PI * 0.34,
      Math.PI * 0.3,
      Math.PI * 0.42,
    ])
    expect([1, 2, 3].map((hitIndex) => geometry(hitIndex as 1 | 2 | 3).strokeHalfWidthUnits * 22)).toEqual([4, 4.5, 5.5])
  })

  it('base、裂焰、追擊、鐵壁改寫都由同一 helper 產生', () => {
    expect(geometry(2)).toMatchObject({ hitIndex: 2, variant: 'base', range: 1.45 })
    expect(geometry(3, ['cracking-flame-combo'])).toMatchObject({ variant: 'cracking-flame', range: 2.2, halfAngle: Math.PI / 3 })
    expect(createPlayerAttackGeometry({ position: { x: 0, y: 0 }, facing: RIGHT, hitIndex: 1, selectedMarks: ['pursuit-strike'], pursuitActive: true, guardStacks: 0 })).toMatchObject({ variant: 'pursuit', range: 2.5 })
    expect(createPlayerAttackGeometry({ position: { x: 0, y: 0 }, facing: RIGHT, hitIndex: 1, selectedMarks: ['bulwark-chain'], pursuitActive: false, guardStacks: 2 })).toMatchObject({ variant: 'bulwark', range: 1.3 * 1.3 })
  })

  it('敵人中心略超過 physical blade reach，但圓形 hurtbox 與可見刃帶外緣相交時命中；完全超出才 miss', () => {
    const attack = geometry(1)
    const radius = enemyHurtboxRadius('ember-thrall')
    expect(playerAttackHitsCircle(attack, { x: attack.origin.x + attack.range + radius + attack.strokeHalfWidthUnits - 0.01, y: 0 }, radius)).toBe(true)
    expect(playerAttackHitsCircle(attack, { x: attack.origin.x + attack.range + radius + attack.strokeHalfWidthUnits + 0.01, y: 0 }, radius)).toBe(false)
  })

  it('角度邊緣以 circle-vs-sector 判定：圓與側邊相交命中，完全在角邊外 miss', () => {
    const attack = geometry(2)
    const radius = enemyHurtboxRadius('shade-skirmisher')
    const distance = 1.25
    const atAngle = (angle: number) => ({
      x: attack.origin.x + Math.cos(angle) * distance,
      y: attack.origin.y + Math.sin(angle) * distance,
    })
    expect(playerAttackHitsCircle(attack, atAngle(attack.halfAngle + 0.2), radius)).toBe(true)
    expect(playerAttackHitsCircle(attack, atAngle(attack.halfAngle + 0.65), radius)).toBe(false)
  })

  it('hurtbox radius 按 sprite kind 決定且 Boss 明顯較大', () => {
    const radii = Object.fromEntries((['ember-thrall', 'shade-skirmisher', 'bulwark-sentinel', 'ashen-warlord'] as const).map((kind: EnemyKind) => [kind, enemyHurtboxRadius(kind)]))
    expect(radii).toEqual({ 'ember-thrall': 0.5, 'shade-skirmisher': 0.42, 'bulwark-sentinel': 0.72, 'ashen-warlord': 1 })
    expect(radii['ashen-warlord']).toBeGreaterThan(radii['ember-thrall']!)
  })
})
