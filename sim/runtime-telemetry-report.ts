/** 以真實 core input/replay 產出可供 BL-01 對照的最小 runtime trace。 */
import { createRecorder } from '../src/core/crash-dump.js'
import { collectRuntimeTelemetry } from '../src/core/runtime-telemetry.js'
import { createRun } from '../src/core/run.js'
import { input } from '../src/core/test-utils.js'
import type { ClassId } from '../src/core/class-expansion.js'

function seedFor(classId: ClassId): string {
  for (let index = 0; index < 10_000; index += 1) {
    const seed = `runtime-trace-${classId}-${index}`
    if (createRun(seed, classId).forgeOptions.length === 3) return seed
  }
  throw new Error(`missing deterministic opening offer for ${classId}`)
}

function sample(classId: ClassId): unknown {
  const recorder = createRecorder(seedFor(classId), classId)
  recorder.tick(input({ forgeChoice: recorder.getState().forgeOptions[0]! }))
  for (let index = 0; index < 900; index += 1) {
    const state = recorder.getState()
    if (state.phase === 'draft' || state.phase === 'defeat') break
    const target = state.enemies.find((enemy) => enemy.hp > 0)
    recorder.tick(input({
      attack: index % 5 === 0,
      dodge: index % 47 === 0,
      skillQ: index === 180 || index === 480,
      skillE: index === 310 || index === 700,
      aimX: target === undefined ? 1 : target.position.x - state.player.position.x,
      aimY: target === undefined ? 0 : target.position.y - state.player.position.y,
    }))
  }
  return collectRuntimeTelemetry(recorder.dump())
}

console.log(JSON.stringify({ schema: 'runtime-telemetry-v1', traces: [sample('forgeguard'), sample('shadowline-hunter')] }, null, 2))
