import { describe, expect, it } from 'vitest'
import { createRecorder, replay, replayHistory } from './crash-dump.js'
import type { ClassId } from './class-expansion.js'
import { createRun, tick } from './run.js'
import { enemyGeometryContains } from './enemy-geometry.js'
import { input } from './test-utils.js'
import type { TickInput } from './types.js'
import { classDraftOptions } from './class-expansion.js'

function scriptedInputs(): TickInput[] {
  const inputs: TickInput[] = []
  for (let i = 0; i < 40; i += 1) {
    inputs.push(input({ moveX: 1, aimX: 3, aimY: -4, attack: i % 3 === 0 }))
  }
  inputs.push(input({ dodge: true, moveX: 0, moveY: 1 }))
  for (let i = 0; i < 30; i += 1) inputs.push(input())
  inputs.push(input({ skillQ: true }))
  for (let i = 0; i < 10; i += 1) inputs.push(input())
  inputs.push(input({ skillE: true }))
  return inputs
}

function seedOffering(classId: ClassId, cardId: string): string {
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const seed = `b2-replay-${classId}-${candidate}`
    if (createRun(seed, classId).forgeOptions.includes(cardId)) return seed
  }
  throw new Error(`No deterministic opening offer for ${cardId}`)
}

function seedOfferingPair(classId: ClassId, firstCardId: string, secondCardId: string): string {
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const seed = `b2-cross-draft-${classId}-${candidate}`
    if (createRun(seed, classId).forgeOptions.includes(firstCardId) && classDraftOptions(seed, classId, 1, [firstCardId]).includes(secondCardId)) return seed
  }
  throw new Error(`No deterministic first/second offer for ${firstCardId} → ${secondCardId}`)
}

/**
 * 以真實戰鬥輸入推到第一關後 Draft；不手動改寫 GameState，故 dump 可以完整重播
 * 「選第一張 → 清關 → 選同槽第二張」的 pipeline。
 */
function clearOpeningEncounter(recorder: ReturnType<typeof createRecorder>): void {
  for (let tickIndex = 0; tickIndex < 1_800; tickIndex += 1) {
    const state = recorder.getState()
    if (state.phase === 'draft' && state.encounterIndex === 0) return
    if (state.phase === 'defeat') throw new Error('scripted replay controller was defeated before the second draft')
    const target = state.enemies.find((enemy) => enemy.hp > 0)
    const aimX = target === undefined ? 1 : target.position.x - state.player.position.x
    const aimY = target === undefined ? 0 : target.position.y - state.player.position.y
    recorder.tick(input({ attack: true, dodge: tickIndex % 43 === 0, aimX, aimY }))
  }
  throw new Error('scripted replay controller did not reach the second draft')
}

/**
 * 不改寫 state 的實戰控制器。每 tick 都透過 recorder 留下真實輸入，直到下一輪 Draft；
 * 這讓後面的共鳴測試不是 fixture 偽造的雙釘／雙線。
 */
function clearCurrentEncounter(recorder: ReturnType<typeof createRecorder>, expectedEncounterIndex: number): void {
  // 第三關是小 Boss；在不手動調整 HP／enemy state 的 replay controller 下，
  // 需要比一般波次更長的真實輸入預算才能抵達第四次 Draft。
  for (let tickIndex = 0; tickIndex < 9_600; tickIndex += 1) {
    const state = recorder.getState()
    if (state.phase === 'draft' && state.encounterIndex === expectedEncounterIndex) return
    if (state.phase === 'defeat') throw new Error(`scripted replay controller was defeated before draft ${expectedEncounterIndex + 2}`)
    const target = state.enemies.find((enemy) => enemy.hp > 0)
    const aimX = target === undefined ? 1 : target.position.x - state.player.position.x
    const aimY = target === undefined ? 0 : target.position.y - state.player.position.y
    recorder.tick(input({ attack: true, dodge: tickIndex % 43 === 0, aimX, aimY }))
  }
  throw new Error(`scripted replay controller did not reach draft ${expectedEncounterIndex + 2}`)
}

function seedOfferingSequence(classId: ClassId, cardIds: readonly string[]): string {
  for (let candidate = 0; candidate < 50_000; candidate += 1) {
    const seed = `b2-full-replay-${classId}-${candidate}`
    let owned: readonly string[] = []
    let offered = createRun(seed, classId).forgeOptions
    let valid = true
    for (let index = 0; index < cardIds.length; index += 1) {
      const cardId = cardIds[index]!
      if (!offered.includes(cardId)) {
        valid = false
        break
      }
      owned = [...owned, cardId]
      offered = classDraftOptions(seed, classId, index + 1, owned)
    }
    if (valid) return seed
  }
  throw new Error(`No deterministic draft sequence for ${cardIds.join(' → ')}`)
}

function chooseThroughDrafts(recorder: ReturnType<typeof createRecorder>, cardIds: readonly string[]): void {
  for (let index = 0; index < cardIds.length; index += 1) {
    const cardId = cardIds[index]!
    expect(recorder.getState().forgeOptions).toContain(cardId)
    recorder.tick(input({ forgeChoice: cardId }))
    if (index < cardIds.length - 1) clearCurrentEncounter(recorder, index)
  }
}

function waitForQ(recorder: ReturnType<typeof createRecorder>): void {
  for (let tickIndex = 0; tickIndex < 2_400; tickIndex += 1) {
    const state = recorder.getState()
    if (state.player.qCooldownTicksRemaining <= 0) return
    if (state.phase === 'draft' || state.phase === 'defeat') throw new Error(`Q cooldown stopped in ${state.phase}`)
    const target = state.enemies.find((enemy) => enemy.hp > 0)
    recorder.tick(input({
      aimX: target === undefined ? 1 : target.position.x - state.player.position.x,
      aimY: target === undefined ? 0 : target.position.y - state.player.position.y,
    }))
  }
  const final = recorder.getState()
  throw new Error(`Q cooldown did not recover (${final.phase}, ${final.player.qCooldownTicksRemaining})`)
}

function waitForE(recorder: ReturnType<typeof createRecorder>): void {
  for (let tickIndex = 0; tickIndex < 2_400; tickIndex += 1) {
    const state = recorder.getState()
    if (state.player.eCooldownTicksRemaining <= 0) return
    if (state.phase === 'draft' || state.phase === 'defeat') throw new Error(`E cooldown stopped in ${state.phase}`)
    const target = state.enemies.find((enemy) => enemy.hp > 0)
    recorder.tick(input({
      aimX: target === undefined ? 1 : target.position.x - state.player.position.x,
      aimY: target === undefined ? 0 : target.position.y - state.player.position.y,
    }))
  }
  throw new Error(`E cooldown did not recover (${recorder.getState().phase}, ${recorder.getState().player.eCooldownTicksRemaining})`)
}

function assertRoundTrip(recorder: ReturnType<typeof createRecorder>): void {
  const dump = JSON.parse(JSON.stringify(recorder.dump()))
  expect(replay(dump)).toEqual(recorder.getState())
  expect(replayHistory(dump).at(-1)).toEqual(recorder.getState())
  const manual = [createRun(dump.seed, dump.classId ?? null)]
  for (const loggedInput of dump.inputLog) manual.push(manual.at(-1) === undefined ? createRun(dump.seed, dump.classId ?? null) : tick(manual.at(-1)!, loggedInput))
  expect(replayHistory(dump)).toEqual(manual)
}

describe('crash dump：seed ＋ 輸入序列可以一鍵重現', () => {
  it('recorder 錄下的 dump 用 replay() 重播，得到與錄製當下完全相同的最終狀態', () => {
    const recorder = createRecorder('crash-dump-seed')
    for (const i of scriptedInputs()) recorder.tick(i)
    const recorded = recorder.getState()

    const dump = recorder.dump()
    expect(dump.seed).toBe('crash-dump-seed')
    expect(dump.inputLog).toHaveLength(scriptedInputs().length)
    expect(dump.inputLog[0]).toMatchObject({ aimX: 3, aimY: -4 })

    const replayed = replay(dump)
    expect(replayed).toEqual(recorded)
  })

  it('dump 是純資料（可以 JSON 序列化/還原後照樣重播）', () => {
    const recorder = createRecorder('crash-dump-json-seed')
    for (const i of scriptedInputs()) recorder.tick(i)
    const dump = recorder.dump()

    const roundTripped = JSON.parse(JSON.stringify(dump))
    const replayed = replay(roundTripped)
    expect(replayed).toEqual(recorder.getState())
  })

  it('replayHistory 回傳的每一 tick 狀態，與逐次呼叫 tick() 累積的歷史逐項相同', () => {
    const inputs = scriptedInputs()
    const recorder = createRecorder('history-seed')
    const manualHistory = [recorder.getState()]
    for (const i of inputs) {
      recorder.tick(i)
      manualHistory.push(recorder.getState())
    }
    const dump = recorder.dump()
    const replayedHistory = replayHistory(dump)
    expect(replayedHistory).toEqual(manualHistory)
  })

  it('雙職業切片的 classId 也會寫入 dump 並逐 tick 重播；1.0 dump 仍維持 null 路徑', () => {
    const classRecorder = createRecorder('class-crash-dump-seed', 'forgeguard')
    classRecorder.tick(input({ forgeChoice: classRecorder.getState().forgeOptions[0]! }))
    classRecorder.tick(input({ skillQ: true, aimX: 1 }))
    const classDump = classRecorder.dump()
    expect(classDump.classId).toBe('forgeguard')
    expect(replay(classDump)).toEqual(classRecorder.getState())
    expect(replayHistory(classDump)[0]!.classId).toBe('forgeguard')

    const legacy = createRecorder('legacy-class-regression')
    const legacyDump = legacy.dump()
    expect(legacyDump.classId).toBeNull()
    expect(replay(legacyDump).classId).toBeNull()
  })

  it.each([
    ['forgeguard', 'double-nail-seal', 'forgeNail'],
    ['shadowline-hunter', 'double-line-return', 'shadowLine'],
    ['forgeguard', 'ring-forged-boundary', 'forgeNail'],
    ['shadowline-hunter', 'reverse-mark-anchor', 'shadowLine'],
  ] as const)('職業卡 %s 的固定輸入序列，JSON dump/replay 逐 tick 等同錄製歷史', (classId, cardId, classObject) => {
    const seed = seedOffering(classId, cardId)
    const recorder = createRecorder(seed, classId)
    recorder.tick(input({ forgeChoice: cardId }))
    // 首波預告期間不解算玩家行動；將這段真實輸入也留在 dump，確保重播覆蓋
    // 「職業 Draft → 戰鬥啟動 → 第二批 Q」的完整時序，而非繞過 run pipeline。
    for (let i = 0; i < 130; i += 1) recorder.tick(input())
    recorder.tick(input({ skillQ: true, aimX: 1 }))
    recorder.tick(input())

    const dump = JSON.parse(JSON.stringify(recorder.dump()))
    const history = replayHistory(dump)
    expect(replay(dump)).toEqual(recorder.getState())
    expect(history.at(-1)).toEqual(recorder.getState())
    expect(history.some((state) => state.player.classObjects[classObject] !== null)).toBe(true)
  })

  it.each([
    ['forgeguard', 'pressure-furnace-roar', 'iron-curtain-recall'],
    ['shadowline-hunter', 'residual-collection', 'returning-rend'],
  ] as const)('跨 Draft 取得第二張同槽卡：%s 的 JSON dump/replay 保留完整逐 tick 歷史', (classId, firstCardId, secondCardId) => {
    const recorder = createRecorder(seedOfferingPair(classId, firstCardId, secondCardId), classId)
    recorder.tick(input({ forgeChoice: firstCardId }))
    clearOpeningEncounter(recorder)
    expect(recorder.getState().forgeOptions).toContain(secondCardId)
    recorder.tick(input({ forgeChoice: secondCardId }))

    const dump = JSON.parse(JSON.stringify(recorder.dump()))
    expect(recorder.getState().selectedClassCards).toEqual([firstCardId, secondCardId])
    expect(replay(dump)).toEqual(recorder.getState())
    expect(replayHistory(dump).at(-1)).toEqual(recorder.getState())
  })

  it('熔衛固定 seed 跨 Draft 取得雙釘／鐵幕構築；真實輸入建立熔鏈並留下封口回收的 rejected 與 resolved replay', () => {
    const cardIds = ['double-nail-seal', 'iron-curtain-recall'] as const
    const recorder = createRecorder(seedOfferingSequence('forgeguard', cardIds), 'forgeguard')
    chooseThroughDrafts(recorder, cardIds)

    // 先讓下一關由預告進入真實戰鬥；選到成對卡但尚未建立雙釘時，
    // 才能用真實 E 輸入留下明確拒絕路徑。
    for (let i = 0; i < 130; i += 1) recorder.tick(input({ dodge: i % 43 === 0, aimX: 1 }))
    recorder.tick(input({ skillE: true, aimX: 1 }))
    expect(recorder.getState().events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '封口回收', reason: '缺少雙釘' }))

    // 等待 E 冷卻，第一枚釘朝仍存活敵人落下。
    waitForE(recorder)
    const firstTarget = recorder.getState().enemies.find((enemy) => enemy.hp > 0)
    if (firstTarget === undefined) throw new Error('forgeguard replay needs a live target after Draft 3')
    recorder.tick(input({ skillQ: true, aimX: firstTarget.position.x - recorder.getState().player.position.x, aimY: firstTarget.position.y - recorder.getState().player.position.y }))
    expect(recorder.getState().player.classObjects.forgeNail).not.toBeNull()

    waitForQ(recorder)
    const firstNail = recorder.getState().player.classObjects.forgeNail
    if (firstNail === null) throw new Error('forgeguard replay lost its first nail before the second cast')
    // 第二釘落在玩家另一側，形成穿過守點的熔鏈，而不是把兩枚釘疊在同一端。
    recorder.tick(input({ skillQ: true, aimX: recorder.getState().player.position.x - firstNail.position.x, aimY: recorder.getState().player.position.y - firstNail.position.y }))
    expect(recorder.getState().player.classObjects.sealNail).toBeDefined()

    // 雙釘的熔鏈實際壓住穿線目標；只靠真實移動與 E 等待成功格擋，
    // 不手動改寫任何 class object。
    let sawPressure = false
    let eAttempts = 0
    let comboHits = 0
    const rejectedReasons = new Set<string>()
    for (let i = 0; i < 1_200; i += 1) {
      const state = recorder.getState()
      if (state.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '封口回收')) break
      if (state.phase === 'defeat' || state.phase === 'draft') throw new Error(`forgeguard replay ended before seal resonance resolved (E attempts: ${eAttempts}, rejects: ${[...rejectedReasons].join(',')})`)
      const nail = state.player.classObjects.forgeNail
      const target = state.enemies.find((enemy) => enemy.hp > 0)
      const aimToNail = nail === null
        ? { x: 1, y: 0 }
        : { x: nail.position.x - state.player.position.x, y: nail.position.y - state.player.position.y }
      const aimToTarget = target === undefined
        ? aimToNail
        : { x: target.position.x - state.player.position.x, y: target.position.y - state.player.position.y }
      if (nail !== null && nail.pressuredEnemyIds.length > 0) sawPressure = true
      comboHits += state.events.filter((event) => event.type === 'comboHit').length
      for (const event of state.events) if (event.type === 'resonanceRejected' && event.resonance === '封口回收') rejectedReasons.add(event.reason)
      const telegraphTarget = state.enemies.find((enemy) => enemy.attackState === 'telegraph'
        && enemy.timerTicks === 1
        && enemy.telegraphGeometry !== null
        && enemyGeometryContains(enemy.telegraphGeometry, state.player.position))
      const canTryE = nail !== null
        && nail.pressuredEnemyIds.length > 0
        && telegraphTarget !== undefined
        && state.player.dodge.invincibilityTicksRemaining <= 0
        && Math.hypot(aimToTarget.x, aimToTarget.y) <= 2.25
      const aim = nail !== null && nail.pressuredEnemyIds.length > 0 ? aimToTarget : aimToTarget
      if (canTryE) eAttempts += 1
      recorder.tick(input({ attack: !canTryE && !sawPressure, skillE: canTryE, dodge: !canTryE && !sawPressure && i % 57 === 0, aimX: aim.x, aimY: aim.y }))
    }
    const finalEvents = recorder.getState().events
    if (!sawPressure || !finalEvents.some((event) => event.type === 'resonanceResolved' && event.resonance === '封口回收')) {
      throw new Error(`forgeguard seal did not resolve (hits: ${comboHits}, pressure: ${sawPressure}, E attempts: ${eAttempts}, rejects: ${[...rejectedReasons].join(',')}, phase: ${recorder.getState().phase})`)
    }
    expect(recorder.getState().selectedClassCards).toEqual(cardIds)
    expect(replayHistory(recorder.dump()).some((state) => state.player.classObjects.sealNail !== undefined)).toBe(true)
    assertRoundTrip(recorder)
  })

  it('影線固定 seed 跨 Draft 取得雙線／回身割裂；真實輸入留下折返處刑的 rejected 與 resolved replay', () => {
    const cardIds = ['double-line-return', 'returning-rend'] as const
    const recorder = createRecorder(seedOfferingSequence('shadowline-hunter', cardIds), 'shadowline-hunter')
    chooseThroughDrafts(recorder, cardIds)

    for (let i = 0; i < 130; i += 1) recorder.tick(input({ dodge: i % 43 === 0, aimX: 1 }))
    recorder.tick(input({ skillE: true, aimX: 1 }))
    expect(recorder.getState().events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '折返處刑', reason: '缺少折返線' }))

    const target = recorder.getState().enemies.find((enemy) => enemy.hp > 0)
    if (target === undefined) throw new Error('shadowline replay needs a live target after Draft 2')
    const aimX = target.position.x - recorder.getState().player.position.x
    const aimY = target.position.y - recorder.getState().player.position.y
    recorder.tick(input({ skillQ: true, aimX, aimY }))
    expect(recorder.getState().player.classObjects.shadowLine).not.toBeNull()

    waitForQ(recorder)
    const returnTarget = recorder.getState().enemies.find((enemy) => enemy.hp > 0)
    if (returnTarget === undefined) throw new Error('shadowline replay lost its target before the return line')
    recorder.tick(input({ skillQ: true, aimX: returnTarget.position.x - recorder.getState().player.position.x, aimY: returnTarget.position.y - recorder.getState().player.position.y }))
    expect(recorder.getState().player.classObjects.returnLine).toBeDefined()
    recorder.tick(input())
    recorder.tick(input({ skillE: true }))

    expect(recorder.getState().events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', resonance: '折返處刑' }))
    expect(recorder.getState().selectedClassCards).toEqual(cardIds)
    expect(replayHistory(recorder.dump()).some((state) => state.player.classObjects.returnLine !== undefined)).toBe(true)
    assertRoundTrip(recorder)
  })

  it.each([
    ['forgeguard', ['shield-wedge', 'corner-pivot'], '楔點轉掃', '未成功格擋'],
    ['shadowline-hunter', ['reverse-mark-anchor', 'terminal-drop'], '吊點脫身', '缺少危險吊點'],
  ] as const)('第三共鳴 %s 以固定 seed 真實跨 Draft 留下 rejected，JSON replay/replayHistory 保留職業與可用共鳴', (classId, cardIds, resonance, rejectedReason) => {
    const recorder = createRecorder(seedOfferingSequence(classId, cardIds), classId)
    chooseThroughDrafts(recorder, cardIds)
    for (let i = 0; i < 130; i += 1) recorder.tick(input({ aimX: 1 }))
    recorder.tick(input({ skillE: true, aimX: 1 }))

    expect(recorder.getState().selectedClassCards).toEqual(cardIds)
    expect(recorder.getState().resonanceLog).toContain(resonance)
    expect(recorder.getState().events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance, reason: rejectedReason }))
    assertRoundTrip(recorder)
  })

  it('影線第三共鳴以固定 seed 真實跨 Draft：先拒絕、再在吊點預兆時落刃 resolved，完整 JSON replayHistory 可重播', () => {
    const cardIds = ['reverse-mark-anchor', 'terminal-drop'] as const
    const recorder = createRecorder(seedOfferingSequence('shadowline-hunter', cardIds), 'shadowline-hunter')
    chooseThroughDrafts(recorder, cardIds)
    for (let i = 0; i < 130; i += 1) recorder.tick(input({ aimX: 1 }))
    recorder.tick(input({ skillE: true, aimX: 1 }))
    expect(recorder.getState().events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '吊點脫身' }))

    const target = recorder.getState().enemies.find((enemy) => enemy.hp > 0)
    if (target === undefined) throw new Error('third resonance replay needs a live target')
    recorder.tick(input({ skillQ: true, aimX: target.position.x - recorder.getState().player.position.x, aimY: target.position.y - recorder.getState().player.position.y }))
    expect(recorder.getState().player.classObjects.shadowLine?.anchorEnemyId).toBeDefined()

    let resolved = false
    for (let index = 0; index < 480; index += 1) {
      const state = recorder.getState()
      if (state.phase === 'defeat' || state.phase === 'draft') break
      const anchorId = state.player.classObjects.shadowLine?.anchorEnemyId
      const anchor = anchorId === undefined ? undefined : state.enemies.find((enemy) => enemy.id === anchorId)
      const canDrop = anchor?.attackState === 'telegraph' && anchor.timerTicks === 1
      recorder.tick(input({ skillE: canDrop, aimX: anchor === undefined ? 1 : anchor.position.x - state.player.position.x, aimY: anchor === undefined ? 0 : anchor.position.y - state.player.position.y }))
      if (recorder.getState().events.some((event) => event.type === 'resonanceResolved' && event.resonance === '吊點脫身')) {
        resolved = true
        break
      }
    }
    expect(resolved).toBe(true)
    assertRoundTrip(recorder)
  })

  it('熔衛第三共鳴以固定 seed 真實跨 Draft：裂盾楔擊、成功格擋與守角轉掃會留下可重播的楔點轉掃', () => {
    const cardIds = ['shield-wedge', 'corner-pivot'] as const
    const recorder = createRecorder(seedOfferingSequence('forgeguard', cardIds), 'forgeguard')
    chooseThroughDrafts(recorder, cardIds)
    for (let i = 0; i < 130; i += 1) recorder.tick(input({ dodge: i % 43 === 0, aimX: 1 }))

    // 以真實三段左鍵而非 state fixture 建立裂盾點。持續追蹤存活敵人，避免
    // 測試在第三段前因目標被清空而把「未打到」誤當成共鳴失敗。
    let createdBreach = false
    for (let index = 0; index < 720; index += 1) {
      const state = recorder.getState()
      if (state.player.classObjects.breachPoint !== undefined) {
        createdBreach = true
        break
      }
      if (state.phase === 'defeat' || state.phase === 'draft') throw new Error(`wedge controller stopped before breach (${state.phase})`)
      const target = state.enemies.find((enemy) => enemy.hp > 0)
      if (target === undefined) continue
      recorder.tick(input({
        attack: true,
        dodge: index % 47 === 0,
        aimX: target.position.x - state.player.position.x,
        aimY: target.position.y - state.player.position.y,
      }))
    }
    expect(createdBreach).toBe(true)

    let resolved = false
    for (let index = 0; index < 960; index += 1) {
      const state = recorder.getState()
      if (state.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '楔點轉掃')) {
        resolved = true
        break
      }
      if (state.phase === 'defeat' || state.phase === 'draft') break
      const breach = state.player.classObjects.breachPoint
      const target = breach === undefined ? undefined : state.enemies.find((enemy) => enemy.id === breach.enemyId && enemy.hp > 0)
      const canPivot = breach !== undefined
        && target !== undefined
        && target.attackState === 'telegraph'
        && target.timerTicks === 1
        && enemyGeometryContains(target.telegraphGeometry!, state.player.position)
      recorder.tick(input({
        attack: !canPivot,
        skillE: canPivot,
        dodge: !canPivot && index % 59 === 0,
        aimX: target === undefined ? 1 : target.position.x - state.player.position.x,
        aimY: target === undefined ? 0 : target.position.y - state.player.position.y,
      }))
    }
    expect(resolved).toBe(true)
    const history = replayHistory(JSON.parse(JSON.stringify(recorder.dump())))
    expect(history.some((state) => state.player.classObjects.breachPoint !== undefined)).toBe(true)
    expect(history.some((state) => state.player.classObjects.pivotSweep !== undefined)).toBe(true)
    expect(history.some((state) => state.events.some((event) => event.type === 'classEffectResolved' && event.cardId === 'corner-pivot' && event.effect === '守角轉掃'))).toBe(true)
    expect(history.some((state) => state.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '楔點轉掃'))).toBe(true)
    assertRoundTrip(recorder)
  })

  it('三張熔衛 Q 卡跨 Draft 同時生效：環鑄界線、雙釘封口與引火鉤的兩次真實 Q 都會保留在 replay', () => {
    const cardIds = ['ring-forged-boundary', 'double-nail-seal', 'fire-hook'] as const
    const recorder = createRecorder(seedOfferingSequence('forgeguard', cardIds), 'forgeguard')
    chooseThroughDrafts(recorder, cardIds)
    for (let i = 0; i < 130; i += 1) recorder.tick(input({ aimX: 1 }))
    const beforeFirstQ = recorder.getState()
    const target = beforeFirstQ.enemies.find((enemy) => enemy.hp > 0)
    if (target === undefined) throw new Error('forge Q pipeline needs a live target')
    recorder.tick(input({ skillQ: true, aimX: target.position.x - beforeFirstQ.player.position.x, aimY: target.position.y - beforeFirstQ.player.position.y }))
    const first = recorder.getState()
    expect(first.player.classObjects.forgeNail?.arcFacing).toBeDefined()
    expect(first.events).toContainEqual({ type: 'qCast' })
    const firstPositions = new Map(beforeFirstQ.enemies.map((enemy) => [enemy.id, enemy.position]))
    expect(first.enemies.some((enemy) => {
      const before = firstPositions.get(enemy.id)
      return before !== undefined && (before.x !== enemy.position.x || before.y !== enemy.position.y)
    })).toBe(true)

    waitForQ(recorder)
    const secondTarget = recorder.getState().enemies.find((enemy) => enemy.hp > 0)
    if (secondTarget === undefined) throw new Error('forge Q pipeline lost every target before seal cast')
    recorder.tick(input({ skillQ: true, aimX: -1, aimY: secondTarget.position.y - recorder.getState().player.position.y }))
    expect(recorder.getState().player.classObjects.sealNail).toBeDefined()
    expect(replayHistory(JSON.parse(JSON.stringify(recorder.dump()))).some((state) => state.player.classObjects.forgeNail?.arcFacing !== undefined && state.player.classObjects.sealNail !== undefined)).toBe(true)
    assertRoundTrip(recorder)
  })

  it('三張影線 Q 卡跨 Draft 同時生效：雙線、獵隙標定與逆標吊點的真實兩次 Q 不互相靜默覆寫', () => {
    const cardIds = ['double-line-return', 'gap-marking', 'reverse-mark-anchor'] as const
    const recorder = createRecorder(seedOfferingSequence('shadowline-hunter', cardIds), 'shadowline-hunter')
    chooseThroughDrafts(recorder, cardIds)
    for (let i = 0; i < 130; i += 1) recorder.tick(input({ aimX: 1 }))
    const target = recorder.getState().enemies.find((enemy) => enemy.hp > 0)
    if (target === undefined) throw new Error('shadow Q pipeline needs a live target')
    const aim = { x: target.position.x - recorder.getState().player.position.x, y: target.position.y - recorder.getState().player.position.y }
    recorder.tick(input({ skillQ: true, aimX: aim.x, aimY: aim.y }))
    const first = recorder.getState().player.classObjects.shadowLine
    expect(first).toMatchObject({ anchorEnemyId: target.id, kind: 'double-line' })
    expect(first?.markedEnemyIds).toContain(target.id)
    waitForQ(recorder)
    const anchoredTarget = recorder.getState().enemies.find((enemy) => enemy.id === target.id && enemy.hp > 0)
    if (anchoredTarget === undefined) throw new Error('shadow Q pipeline lost its anchored target before return cast')
    recorder.tick(input({ skillQ: true, aimX: anchoredTarget.position.x - recorder.getState().player.position.x, aimY: anchoredTarget.position.y - recorder.getState().player.position.y }))
    expect(recorder.getState().player.classObjects.returnLine).toMatchObject({ anchorEnemyId: target.id, kind: 'double-line' })
    expect(replayHistory(JSON.parse(JSON.stringify(recorder.dump()))).some((state) => state.player.classObjects.shadowLine?.anchorEnemyId === target.id && state.player.classObjects.returnLine?.kind === 'double-line')).toBe(true)
    assertRoundTrip(recorder)
  })

  it('第三批 E 與既有 E 在真實跨 Draft 流程同 tick 都可觀察，並可 JSON replay', () => {
    const forgeCards = ['bulwark-hammer', 'ring-forged-boundary', 'iron-curtain-recall', 'corner-pivot'] as const
    const forge = createRecorder(seedOfferingSequence('forgeguard', forgeCards), 'forgeguard')
    chooseThroughDrafts(forge, forgeCards)
    for (let i = 0; i < 130; i += 1) forge.tick(input({ aimX: 1 }))
    const forgeTarget = forge.getState().enemies.find((enemy) => enemy.hp > 0)
    if (forgeTarget === undefined) throw new Error('forge E pipeline needs a live target')
    forge.tick(input({ skillQ: true, aimX: forgeTarget.position.x - forge.getState().player.position.x, aimY: forgeTarget.position.y - forge.getState().player.position.y }))
    let sawPressure = false
    let forgeResolved = false
    for (let index = 0; index < 720; index += 1) {
      const state = forge.getState()
      const nail = state.player.classObjects.forgeNail
      if (state.phase === 'defeat' || state.phase === 'draft') break
      const blocker = state.enemies.find((enemy) => enemy.attackState === 'telegraph' && enemy.timerTicks === 1 && enemy.telegraphGeometry !== null && enemyGeometryContains(enemy.telegraphGeometry, state.player.position))
      const canCast = blocker !== undefined && nail !== null && nail.pressuredEnemyIds.length > 0
      if (nail !== null && nail.pressuredEnemyIds.length > 0) sawPressure = true
      const target = state.enemies.find((enemy) => enemy.hp > 0)
      forge.tick(input({ attack: !canCast, skillE: canCast, dodge: !canCast && index % 53 === 0, aimX: target === undefined ? 1 : target.position.x - state.player.position.x, aimY: target === undefined ? 0 : target.position.y - state.player.position.y }))
      const events = forge.getState().events
      if (events.some((event) => event.type === 'classEffectResolved' && event.cardId === 'iron-curtain-recall') && events.some((event) => event.type === 'classEffectResolved' && event.cardId === 'corner-pivot')) {
        forgeResolved = true
        break
      }
    }
    expect(sawPressure).toBe(true)
    expect(forgeResolved).toBe(true)
    assertRoundTrip(forge)

    const shadowCards = ['reverse-mark-anchor', 'returning-rend', 'terminal-drop'] as const
    const shadow = createRecorder(seedOfferingSequence('shadowline-hunter', shadowCards), 'shadowline-hunter')
    chooseThroughDrafts(shadow, shadowCards)
    for (let i = 0; i < 130; i += 1) shadow.tick(input({ aimX: 1 }))
    const shadowTarget = shadow.getState().enemies.find((enemy) => enemy.hp > 0)
    if (shadowTarget === undefined) throw new Error('shadow E pipeline needs a live target')
    shadow.tick(input({ skillQ: true, aimX: shadowTarget.position.x - shadow.getState().player.position.x, aimY: shadowTarget.position.y - shadow.getState().player.position.y }))
    const hpBefore = shadow.getState().enemies.find((enemy) => enemy.id === shadowTarget.id)?.hp
    shadow.tick(input({ skillE: true, aimX: shadowTarget.position.x - shadow.getState().player.position.x, aimY: shadowTarget.position.y - shadow.getState().player.position.y }))
    const after = shadow.getState()
    expect(after.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'terminal-drop', effect: '斷端落刃', targetIds: [shadowTarget.id] }))
    expect(after.player.classObjects.returnLine).toMatchObject({ kind: 'return-exit' })
    expect(after.enemies.find((enemy) => enemy.id === shadowTarget.id)?.hp).toBeLessThan(hpBefore!)
    assertRoundTrip(shadow)
  })

  it('第四批最後六張各有固定 seed 的跨 Draft JSON crash dump：火索移釘與環扣索均逐 tick 可重播', () => {
    const forgeCards = ['anchored-riposte', 'reforge-relocation', 'molten-lock-retreat'] as const
    const forge = createRecorder(seedOfferingSequence('forgeguard', forgeCards), 'forgeguard')
    chooseThroughDrafts(forge, forgeCards)
    for (let index = 0; index < 130; index += 1) forge.tick(input({ aimX: 1 }))
    forge.tick(input({ skillQ: true, aimX: 1 }))
    expect(forge.getState().player.classObjects.forgeNail).not.toBeNull()
    waitForQ(forge)
    forge.tick(input({ skillQ: true, aimX: -1 }))
    expect(forge.getState().events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'reforge-relocation', effect: '回爐移釘' }))
    assertRoundTrip(forge)

    const shadowCards = ['pinned-body-swap', 'loop-tether', 'cross-line-borrow'] as const
    const shadow = createRecorder(seedOfferingSequence('shadowline-hunter', shadowCards), 'shadowline-hunter')
    chooseThroughDrafts(shadow, shadowCards)
    for (let index = 0; index < 130; index += 1) shadow.tick(input({ aimX: 1 }))
    const target = shadow.getState().enemies.find((enemy) => enemy.hp > 0)
    if (target === undefined) throw new Error('final shadow replay needs a live target')
    shadow.tick(input({ skillQ: true, aimX: target.position.x - shadow.getState().player.position.x, aimY: target.position.y - shadow.getState().player.position.y }))
    expect(shadow.getState().player.classObjects.shadowLine).toMatchObject({ kind: 'loop-tether' })
    assertRoundTrip(shadow)
  })

  it('第四條熔衛共鳴以固定 seed 真實跨 Draft：先拒絕、火索與爐釘完成後成功格擋，JSON history 可重播錨索退讓', () => {
    const cardIds = ['anchored-riposte', 'fire-hook', 'molten-lock-retreat'] as const
    const recorder = createRecorder(seedOfferingSequence('forgeguard', cardIds), 'forgeguard')
    chooseThroughDrafts(recorder, cardIds)
    for (let index = 0; index < 130; index += 1) recorder.tick(input({ aimX: 1 }))
    recorder.tick(input({ skillE: true, aimX: 1 }))
    expect(recorder.getState().events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '錨索退讓', reason: '缺少火索' }))
    waitForE(recorder)
    const qTarget = recorder.getState().enemies.find((enemy) => enemy.hp > 0)
    if (qTarget === undefined) throw new Error('tether replay needs a live target for its forge nail')
    recorder.tick(input({ skillQ: true, aimX: qTarget.position.x - recorder.getState().player.position.x, aimY: qTarget.position.y - recorder.getState().player.position.y }))
    expect(recorder.getState().player.classObjects.forgeNail).not.toBeNull()

    let resolved = false
    for (let index = 0; index < 960; index += 1) {
      const state = recorder.getState()
      if (state.phase === 'defeat' || state.phase === 'draft') break
      if (state.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '錨索退讓')) {
        resolved = true
        break
      }
      const target = state.enemies.find((enemy) => enemy.hp > 0)
      const canBlock = state.player.classObjects.forgeTether !== undefined
        && state.enemies.some((enemy) => enemy.attackState === 'telegraph' && enemy.timerTicks === 1 && enemy.telegraphGeometry !== null && enemyGeometryContains(enemy.telegraphGeometry, state.player.position))
      recorder.tick(input({
        attack: !canBlock && index % 2 === 0,
        skillE: canBlock,
        dodge: !canBlock && index % 61 === 0,
        aimX: target === undefined ? 1 : target.position.x - state.player.position.x,
        aimY: target === undefined ? 0 : target.position.y - state.player.position.y,
      }))
    }
    expect(resolved).toBe(true)
    const history = replayHistory(JSON.parse(JSON.stringify(recorder.dump())))
    expect(history.some((state) => state.player.classObjects.forgeTether !== undefined)).toBe(true)
    expect(history.some((state) => state.player.classObjects.moltenLock !== undefined)).toBe(true)
    expect(history.some((state) => state.events.some((event) => event.type === 'resonanceRejected' && event.resonance === '錨索退讓' && event.reason === '缺少火索'))).toBe(true)
    expect(history.some((state) => state.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '錨索退讓'))).toBe(true)
    assertRoundTrip(recorder)
  })

  it('第四條影線共鳴以固定 seed 真實跨 Draft：先拒絕、換位殘切與第二線完成後，JSON history 可重播交線換身', () => {
    const cardIds = ['pinned-body-swap', 'double-line-return', 'cross-line-borrow'] as const
    const recorder = createRecorder(seedOfferingSequence('shadowline-hunter', cardIds), 'shadowline-hunter')
    chooseThroughDrafts(recorder, cardIds)
    for (let index = 0; index < 130; index += 1) recorder.tick(input({ aimX: 1 }))
    recorder.tick(input({ skillE: true, aimX: 1 }))
    expect(recorder.getState().events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '交線換身', reason: '缺少換位殘切' }))
    const initialTarget = recorder.getState().enemies.find((enemy) => enemy.hp > 0)
    if (initialTarget === undefined) throw new Error('swap replay needs a live target for its main line')
    recorder.tick(input({ skillQ: true, aimX: initialTarget.position.x - recorder.getState().player.position.x, aimY: initialTarget.position.y - recorder.getState().player.position.y }))
    waitForQ(recorder)
    const returnTarget = recorder.getState().enemies.find((enemy) => enemy.id === initialTarget.id && enemy.hp > 0)
    if (returnTarget === undefined) throw new Error('swap replay lost the marked target before its second line')
    recorder.tick(input({ skillQ: true, aimX: returnTarget.position.x - recorder.getState().player.position.x, aimY: returnTarget.position.y - recorder.getState().player.position.y }))
    expect(recorder.getState().player.classObjects.returnLine).toMatchObject({ kind: 'double-line' })

    let resolved = false
    for (let index = 0; index < 420; index += 1) {
      const state = recorder.getState()
      if (state.phase === 'defeat' || state.phase === 'draft') break
      if (state.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '交線換身')) {
        resolved = true
        break
      }
      const target = state.enemies.find((enemy) => enemy.id === initialTarget.id && enemy.hp > 0)
      recorder.tick(input({
        attack: target !== undefined && index % 2 === 0,
        dodge: index % 53 === 0,
        aimX: target === undefined ? 1 : target.position.x - state.player.position.x,
        aimY: target === undefined ? 0 : target.position.y - state.player.position.y,
      }))
      const afterAttack = recorder.getState()
      if (afterAttack.player.classObjects.shadowLine?.swappedEnemyId !== undefined && afterAttack.player.eCooldownTicksRemaining <= 0) recorder.tick(input({ skillE: true, aimX: 1 }))
    }
    expect(resolved).toBe(true)
    const history = replayHistory(JSON.parse(JSON.stringify(recorder.dump())))
    expect(history.some((state) => state.player.classObjects.shadowLine?.swappedEnemyId !== undefined)).toBe(true)
    expect(history.some((state) => state.player.classObjects.returnLine?.kind === 'double-line')).toBe(true)
    expect(history.some((state) => state.events.some((event) => event.type === 'resonanceRejected' && event.resonance === '交線換身' && event.reason === '缺少換位殘切'))).toBe(true)
    expect(history.some((state) => state.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '交線換身'))).toBe(true)
    assertRoundTrip(recorder)
  })
})
