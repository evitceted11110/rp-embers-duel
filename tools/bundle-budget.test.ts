import { describe, expect, it } from 'vitest'
import { assertBundleWithinBudget } from './bundle-budget.js'

describe('assertBundleWithinBudget', () => {
  it('gzip bytes 未超過門檻時通過', () => {
    expect(() => assertBundleWithinBudget(24_610, 65_536)).not.toThrow()
  })

  it('gzip bytes 超過門檻時擋下 build', () => {
    expect(() => assertBundleWithinBudget(65_537, 65_536)).toThrow(/超過/)
  })
})
