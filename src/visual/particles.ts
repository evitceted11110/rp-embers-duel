/**
 * 世界層受擊碎裂粒子。
 * 視覺隨機一律吃呼叫端已 fork 過的 Rng（例如 `rootRng.fork('visual-shatter')`），
 * 禁止 Math.random()——這是 eslint no-restricted-properties 擋的硬規定，
 * 也是本模組能被決定性重播測試的原因。
 */
import type { Rng } from '@rogue-paradise/rng'

export type ShatterParticle = {
  readonly angleRad: number
  readonly speed: number
}

const MIN_SPEED = 40
const MAX_SPEED = 120

/** 產生 count 個巨像素碎裂粒子的方向與速度。同一個 rng（同 seed）永遠回傳相同結果。 */
export function shatterParticles(rng: Rng, count: number): readonly ShatterParticle[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`count 必須是非負整數，收到 ${count}`)
  }
  const particles: ShatterParticle[] = []
  for (let i = 0; i < count; i += 1) {
    particles.push({
      angleRad: rng.next() * Math.PI * 2,
      speed: MIN_SPEED + rng.next() * (MAX_SPEED - MIN_SPEED),
    })
  }
  return particles
}
