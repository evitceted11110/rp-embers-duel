import { createRng } from '@rogue-paradise/rng'
import { describe, expect, it } from 'vitest'
import { shatterParticles } from './particles.js'

describe('shatterParticles：視覺隨機的決定性（同 seed 同結果）', () => {
  it('相同 seed 各自 fork 出的 rng 產生完全相同的粒子序列', () => {
    const rngA = createRng('embers-duel-visual-test').fork('visual-shatter')
    const rngB = createRng('embers-duel-visual-test').fork('visual-shatter')

    expect(shatterParticles(rngA, 6)).toEqual(shatterParticles(rngB, 6))
  })

  it('不同 seed 產生不同的粒子序列', () => {
    const rngA = createRng('seed-a').fork('visual-shatter')
    const rngB = createRng('seed-b').fork('visual-shatter')

    expect(shatterParticles(rngA, 6)).not.toEqual(shatterParticles(rngB, 6))
  })

  it('每個粒子的角度落在 [0, 2π) 內，速度落在設計範圍內', () => {
    const rng = createRng('embers-duel-visual-test').fork('visual-shatter')
    const particles = shatterParticles(rng, 20)
    for (const particle of particles) {
      expect(particle.angleRad).toBeGreaterThanOrEqual(0)
      expect(particle.angleRad).toBeLessThan(Math.PI * 2)
      expect(particle.speed).toBeGreaterThanOrEqual(40)
      expect(particle.speed).toBeLessThanOrEqual(120)
    }
  })

  it('拒絕負數或非整數的 count', () => {
    const rng = createRng('embers-duel-visual-test').fork('visual-shatter')
    expect(() => shatterParticles(rng, -1)).toThrow()
    expect(() => shatterParticles(rng, 1.5)).toThrow()
  })
})
