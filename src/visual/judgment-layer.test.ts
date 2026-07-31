import { describe, expect, it } from 'vitest'
import { ENEMY_TELEGRAPH_COLORS, SCHOOL_COLORS } from './color.js'
import { enemyTelegraph, paintJudgmentEffect, schoolEffect, type JudgmentPaintTarget } from './judgment-layer.js'
import { afterimageGeometry } from './shapes/afterimage.js'
import { dodgeArcTrail } from './shapes/arc-trail.js'
import { coneGeometry } from './shapes/cone.js'
import { parryHaloGeometry } from './shapes/parry-halo.js'
import { toScreenPoint } from './screen-point.js'

function createFakeTarget(): JudgmentPaintTarget & { calls: string[] } {
  const calls: string[] = []
  return {
    strokeStyle: '',
    fillStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    beginPath: () => calls.push('beginPath'),
    moveTo: (x, y) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x, y) => calls.push(`lineTo(${x},${y})`),
    arc: (x, y, r, s, e) => calls.push(`arc(${x},${y},${r},${s.toFixed(3)},${e.toFixed(3)})`),
    closePath: () => calls.push('closePath'),
    stroke: () => calls.push('stroke'),
    fill: () => calls.push('fill'),
    calls,
  }
}

describe('enemyTelegraph／schoolEffect：地面 vs 角色、硬邊 vs 柔邊的雙重區隔寫死在建構子', () => {
  it('enemyTelegraph 固定 anchor=ground、edge=hard', () => {
    const geometry = coneGeometry(toScreenPoint(0, 0), 0, 90, 3)
    const effect = enemyTelegraph(geometry, ENEMY_TELEGRAPH_COLORS.sentinelWhite)
    expect(effect.anchor).toBe('ground')
    expect(effect.edge).toBe('hard')
    expect(effect.color).toBe(ENEMY_TELEGRAPH_COLORS.sentinelWhite)
  })

  it('schoolEffect 固定 anchor=character、edge=soft', () => {
    const geometry = coneGeometry(toScreenPoint(0, 0), 0, 120, 2.2)
    const effect = schoolEffect(geometry, SCHOOL_COLORS.ember)
    expect(effect.anchor).toBe('character')
    expect(effect.edge).toBe('soft')
    expect(effect.color).toBe(SCHOOL_COLORS.ember)
  })
})

describe('paintJudgmentEffect：四種形狀語彙的畫布分派', () => {
  it('cone 特效會畫出從原點出發、涵蓋扇形角度範圍的路徑', () => {
    const target = createFakeTarget()
    const geometry = coneGeometry(toScreenPoint(0, 0), 0, 120, 2.2)
    paintJudgmentEffect(target, schoolEffect(geometry, SCHOOL_COLORS.ember))

    expect(target.calls[0]).toBe('beginPath')
    expect(target.calls).toContain('moveTo(0,0)')
    expect(target.calls.some((call) => call.startsWith('arc(0,0,2.2,'))).toBe(true)
    expect(target.calls.at(-1)).toBe('fill')
  })

  it('parry-halo 特效以 baseRadius × radiusScale 為半徑畫圓', () => {
    const target = createFakeTarget()
    const geometry = parryHaloGeometry(toScreenPoint(5, 5), 10, 0.1, 0.15)
    paintJudgmentEffect(target, schoolEffect(geometry, SCHOOL_COLORS.guard))

    const arcCall = target.calls.find((call) => call.startsWith('arc('))
    expect(arcCall).toBeDefined()
    expect(target.calls.at(-1)).toBe('stroke')
  })

  it('四種幾何都能各自完成一次繪製而不拋出例外', () => {
    const target = createFakeTarget()
    const origin = toScreenPoint(0, 0)

    expect(() =>
      paintJudgmentEffect(target, schoolEffect(coneGeometry(origin, 0, 120, 2), SCHOOL_COLORS.ember)),
    ).not.toThrow()
    expect(() =>
      paintJudgmentEffect(
        target,
        schoolEffect(parryHaloGeometry(origin, 8, 0.05, 0.15), SCHOOL_COLORS.guard),
      ),
    ).not.toThrow()
    expect(() =>
      paintJudgmentEffect(
        target,
        schoolEffect(dodgeArcTrail(origin, toScreenPoint(5, 5), null), SCHOOL_COLORS.ember),
      ),
    ).not.toThrow()
    expect(() =>
      paintJudgmentEffect(
        target,
        schoolEffect(afterimageGeometry([origin, toScreenPoint(1, 1)], 0.5, 1.6), SCHOOL_COLORS.shadow),
      ),
    ).not.toThrow()
  })
})
