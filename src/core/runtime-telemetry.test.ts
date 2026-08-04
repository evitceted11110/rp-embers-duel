import { describe, expect, it } from 'vitest'
import { classDraftOptions } from './class-expansion.js'
import { createRecorder } from './crash-dump.js'
import { collectRuntimeTelemetry } from './runtime-telemetry.js'
import { createRun } from './run.js'
import { input } from './test-utils.js'

function seedOffering(cardId: string): string {
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const seed = `runtime-telemetry-${candidate}`
    if (createRun(seed, 'forgeguard').forgeOptions.includes(cardId)) return seed
  }
  throw new Error(`no deterministic offer for ${cardId}`)
}

describe('runtime telemetry', () => {
  it('從實際 recorder dump 重播，逐房記錄承傷、死亡、構築與槽位執行', () => {
    const recorder = createRecorder(seedOffering('fire-hook'), 'forgeguard')
    recorder.tick(input({ forgeChoice: 'fire-hook' }))
    for (let tickIndex = 0; tickIndex < 180; tickIndex += 1) {
      const state = recorder.getState()
      const target = state.enemies.find((enemy) => enemy.hp > 0)
      recorder.tick(input({
        attack: tickIndex % 5 === 0,
        skillQ: tickIndex === 140,
        aimX: target === undefined ? 1 : target.position.x - state.player.position.x,
        aimY: target === undefined ? 0 : target.position.y - state.player.position.y,
      }))
    }
    const dump = JSON.parse(JSON.stringify(recorder.dump()))
    const telemetry = collectRuntimeTelemetry(dump)

    expect(telemetry.build).toEqual(['fire-hook'])
    expect(telemetry.rooms).toHaveLength(1)
    expect(telemetry.rooms[0]).toMatchObject({ roomIndex: 0, startedAtTick: 1 })
    expect(telemetry.durationTicks).toBe(recorder.getState().tick)
    expect(telemetry.damageTaken).toBeGreaterThanOrEqual(0)
    expect(telemetry.cards).toContainEqual(expect.objectContaining({ cardId: 'fire-hook', slot: 'q', inputAttempts: 1 }))
    expect(telemetry).toEqual(collectRuntimeTelemetry(dump))
  })

  it('保留共鳴 resolved/rejected 原因，且不把 1.0 run 虛構成職業卡資料', () => {
    const legacy = createRecorder('runtime-telemetry-legacy')
    for (let index = 0; index < 20; index += 1) legacy.tick(input({ attack: index % 2 === 0 }))
    expect(collectRuntimeTelemetry(legacy.dump())).toMatchObject({ classId: null, build: [], cards: [], resonances: [] })

    const seed = (() => {
      for (let candidate = 0; candidate < 20_000; candidate += 1) {
        const value = `runtime-telemetry-resonance-${candidate}`
        if (createRun(value, 'forgeguard').forgeOptions.includes('double-nail-seal') && classDraftOptions(value, 'forgeguard', 1, ['double-nail-seal']).includes('iron-curtain-recall')) return value
      }
      throw new Error('no deterministic paired offer')
    })()
    const recorder = createRecorder(seed, 'forgeguard')
    recorder.tick(input({ forgeChoice: 'double-nail-seal' }))
    // 尚未取得鐵幕時先不列共鳴；此段的目的在於斷言 telemetry 不從卡名猜共鳴。
    const telemetry = collectRuntimeTelemetry(recorder.dump())
    expect(telemetry.availableResonances).toEqual([])
    expect(telemetry.resonances).toEqual([])
  })
})
