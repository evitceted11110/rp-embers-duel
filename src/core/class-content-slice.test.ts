import { describe, expect, it } from 'vitest'
import { tick } from './run.js'
import { buildState, input, makeEnemy } from './test-utils.js'

describe('Gate 2 第一批職業內容切片', () => {
  it('裂盾楔擊留下不能轉身的裂盾點；環鑄界線與守角轉軸在成功格擋後繞釘轉掃', () => {
    const base = buildState().player
    const wedged = buildState({
      classId: 'forgeguard', selectedClassCards: ['shield-wedge'],
      player: { ...base, combo: { hitIndex: 3, phase: 'startup', phaseTicksRemaining: 0 } },
      enemies: [makeEnemy({ id: 'wedge-target', kind: 'ember-thrall', position: { x: 1.8, y: 0 } })],
    })
    const hit = tick(wedged, input({ aimX: 1 }))
    expect(hit.player.classObjects.breachPoint).toMatchObject({ enemyId: 'wedge-target', position: { x: 1.8, y: 0 } })
    expect(hit.player.classObjects.facingLock).toBeDefined()

    const pivot = buildState({
      classId: 'forgeguard', selectedClassCards: ['shield-wedge', 'ring-forged-boundary', 'corner-pivot'],
      player: { ...base, classObjects: { forgeNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [], arcFacing: { x: 1, y: 0 } }, shadowLine: null, breachPoint: { enemyId: 'pivot-target', position: { x: 1.8, y: 0 }, ticksRemaining: 200 } } },
      enemies: [makeEnemy({ id: 'pivot-target', kind: 'ember-thrall', position: { x: 1.8, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 2 } })],
    })
    const swept = tick(pivot, input({ skillE: true, aimX: 0, aimY: 1 }))
    expect(swept.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'corner-pivot', effect: '守角轉掃', targetIds: ['pivot-target'] }))
    expect(swept.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', classId: 'forgeguard', resonance: '楔點轉掃', targetIds: ['pivot-target'] }))
    expect(swept.enemies[0]!.position.y).toBeGreaterThan(1.8)
  })

  it.each([
    ['缺少裂盾點', { forgeNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null }],
    ['未成功格擋', { forgeNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null, breachPoint: { enemyId: 'target', position: { x: 1.8, y: 0 }, ticksRemaining: 200 } }],
    ['轉掃無目標', { forgeNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null, breachPoint: { enemyId: 'missing', position: { x: 5, y: 0 }, ticksRemaining: 200 } }],
  ] as const)('楔點轉掃在%s時拒絕且不 resolved', (reason, classObjects) => {
    const state = buildState({ classId: 'forgeguard', selectedClassCards: ['shield-wedge', 'corner-pivot'], player: { ...buildState().player, classObjects }, enemies: [makeEnemy({ id: 'target', kind: 'ember-thrall', position: { x: 1.8, y: 0 }, attackState: reason === '轉掃無目標' ? 'telegraph' : 'approach', timerTicks: reason === '轉掃無目標' ? 1 : 0, telegraphGeometry: reason === '轉掃無目標' ? { kind: 'circle', center: { x: 0, y: 0 }, radius: 2 } : null })] })
    const next = tick(state, input({ skillE: true, aimX: 1 }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '楔點轉掃', reason }))
    expect(next.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '楔點轉掃')).toBe(false)
  })

  it('守角轉軸單獨成功格擋會留下可見轉掃，不會被裂盾楔擊靜默綁死；同持時仍保留楔點共鳴', () => {
    const base = buildState().player
    const standalone = buildState({
      classId: 'forgeguard', selectedClassCards: ['corner-pivot'],
      player: { ...base, classObjects: { forgeNail: null, shadowLine: null } },
      enemies: [makeEnemy({ id: 'blocker', kind: 'ember-thrall', position: { x: 1, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 2 } })],
    })
    const spun = tick(standalone, input({ skillE: true, aimX: 0, aimY: 1 }))
    expect(spun.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'corner-pivot', effect: '守角轉掃', targetIds: ['blocker'] }))
    expect(spun.player.classObjects.pivotSweep).toMatchObject({ position: { x: 0, y: 0 }, direction: { x: 0, y: 1 } })

    const paired = buildState({
      classId: 'forgeguard', selectedClassCards: ['bulwark-hammer', 'shield-wedge', 'corner-pivot'],
      player: { ...base, classObjects: { forgeNail: null, shadowLine: null, breachPoint: { enemyId: 'wedge', position: { x: 1.2, y: 0 }, ticksRemaining: 100 } } },
      enemies: [makeEnemy({ id: 'wedge', kind: 'ember-thrall', position: { x: 1.2, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 2 } })],
    })
    const resolved = tick(paired, input({ skillE: true, aimX: 0, aimY: 1 }))
    expect(resolved.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'corner-pivot', effect: '守角轉掃' }))
    expect(resolved.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', resonance: '楔點轉掃' }))
  })

  it('環鑄界線把爐釘改為有朝向的缺口弧牆；逆標吊點 Q 會把首個掠過敵人變成移動線端', () => {
    const boundary = buildState({ classId: 'forgeguard', selectedClassCards: ['ring-forged-boundary'] })
    const ring = tick(boundary, input({ skillQ: true, aimX: 0, aimY: 1 }))
    expect(ring.player.classObjects.forgeNail).toMatchObject({ arcFacing: { x: 0, y: 1 } })
    expect(ring.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'ring-forged-boundary', effect: '環鑄界線', targetIds: [] }))

    const hunter = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['reverse-mark-anchor'],
      enemies: [makeEnemy({ id: 'anchor', kind: 'ember-thrall', position: { x: 2, y: 0 } })],
    })
    const tethered = tick(hunter, input({ skillQ: true, aimX: 1 }))
    expect(tethered.player.classObjects.shadowLine).toMatchObject({ end: { x: 2, y: 0 }, anchorEnemyId: 'anchor' })
    expect(tethered.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'reverse-mark-anchor', effect: '逆標吊點', targetIds: ['anchor'] }))
  })

  it('縫影折角沿已布影線轉位；逆標吊點鎖定預兆敵人，斷端落刃落在吊點並留下回走線', () => {
    const base = buildState().player
    const line = { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ticksRemaining: 200, markedEnemyIds: ['anchor'], residualEnemyIds: [], anchorEnemyId: 'anchor' }
    const corner = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['stitched-corner'],
      player: { ...base, combo: { hitIndex: 3, phase: 'startup', phaseTicksRemaining: 0 }, classObjects: { forgeNail: null, shadowLine: line } },
      enemies: [makeEnemy({ id: 'anchor', kind: 'ember-thrall', position: { x: 2, y: 0 } })],
    })
    expect(tick(corner, input({ aimX: 0, aimY: 1 })).player.position).toEqual({ x: 0, y: 0 })

    const escape = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['reverse-mark-anchor', 'terminal-drop'],
      player: { ...base, classObjects: { forgeNail: null, shadowLine: line } },
      enemies: [makeEnemy({ id: 'anchor', kind: 'ember-thrall', position: { x: 2, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 2, y: 0 }, radius: 2 } })],
    })
    const dropped = tick(escape, input({ skillE: true }))
    expect(dropped.player.position).toEqual({ x: 2, y: 0 })
    expect(dropped.player.classObjects.returnLine).toMatchObject({ start: { x: 2, y: 0 }, kind: 'return-exit' })
    expect(dropped.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', classId: 'shadowline-hunter', resonance: '吊點脫身', targetIds: ['anchor'] }))
  })

  it.each([
    ['缺少危險吊點', { forgeNail: null, shadowLine: null }],
    ['吊點未預兆', { forgeNail: null, shadowLine: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 }, ticksRemaining: 200, markedEnemyIds: ['anchor'], residualEnemyIds: [], anchorEnemyId: 'anchor' } }],
  ] as const)('吊點脫身在%s時拒絕且不 resolved', (reason, classObjects) => {
    const state = buildState({ classId: 'shadowline-hunter', selectedClassCards: ['reverse-mark-anchor', 'terminal-drop'], player: { ...buildState().player, classObjects }, enemies: [makeEnemy({ id: 'anchor', kind: 'ember-thrall', position: { x: 2, y: 0 } })] })
    const next = tick(state, input({ skillE: true }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '吊點脫身', reason }))
    expect(next.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '吊點脫身')).toBe(false)
  })

  it('吊點脫身未落於吊點時拒絕且同 tick 不會 resolved', () => {
    const base = buildState().player
    const state = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['reverse-mark-anchor', 'terminal-drop'],
      player: { ...base, classObjects: { forgeNail: null, shadowLine: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 }, ticksRemaining: 200, markedEnemyIds: [], residualEnemyIds: [], anchorEnemyId: 'anchor' } } },
      enemies: [makeEnemy({ id: 'anchor', kind: 'ember-thrall', position: { x: 2, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 0.1 } })],
    })
    const next = tick(state, input({ skillE: true }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '吊點脫身', reason: '未落於吊點' }))
    expect(next.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '吊點脫身')).toBe(false)
  })

  it('熔衛的引火鉤實際放下爐釘並把邊緣敵人拉向防區', () => {
    const state = buildState({
      classId: 'forgeguard',
      selectedClassCards: ['bulwark-hammer', 'fire-hook', 'pressure-furnace-roar'],
      enemies: [makeEnemy({ id: 'edge', kind: 'ember-thrall', position: { x: 5, y: 0 } })],
    })
    const next = tick(state, input({ skillQ: true, aimX: 1, aimY: 0 }))
    expect(next.player.classObjects.forgeNail).toMatchObject({ position: { x: 2.4, y: 0 } })
    expect(next.enemies[0]!.position.x).toBeLessThan(5)
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'fire-hook', effect: '引火鉤', targetIds: ['edge'] }))
  })

  it('熔衛只在防區受壓、E 架勢成功格擋後兌現可追溯反震', () => {
    const state = buildState({
      classId: 'forgeguard',
      selectedClassCards: ['bulwark-hammer', 'fire-hook', 'pressure-furnace-roar'],
      player: {
        ...buildState().player,
        classObjects: { forgeNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: ['pressure'] }, shadowLine: null },
      },
      enemies: [makeEnemy({
        id: 'pressure', kind: 'ember-thrall', position: { x: 1.4, y: 0 }, attackState: 'telegraph', timerTicks: 1,
        telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 2 },
      })],
    })
    const next = tick(state, input({ skillE: true, aimX: 1, aimY: 0 }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'playerBlocked' }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', classId: 'forgeguard', resonance: '防區反震', targetIds: ['pressure'] }))
    expect(next.enemies[0]!.position.x).toBeGreaterThan(3)
  })

  it.each([
    ['防區外', { position: { x: -3, y: 0 }, facing: { x: 1, y: 0 } }],
    ['未面向爐釘', { position: { x: 0, y: 0 }, facing: { x: -1, y: 0 } }],
  ] as const)('熔衛反震在%s時會拒絕遠端觸發', (reason, placement) => {
    const base = buildState().player
    const state = buildState({
      classId: 'forgeguard',
      selectedClassCards: ['bulwark-hammer', 'pressure-furnace-roar'],
      player: { ...base, ...placement, classObjects: { forgeNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: ['pressure'] }, shadowLine: null } },
      enemies: [makeEnemy({ id: 'pressure', kind: 'ember-thrall', position: { x: 1.4, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: placement.position, radius: 2 } })],
    })
    const next = tick(state, input({ skillE: true, aimX: placement.facing.x, aimY: placement.facing.y }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', reason }))
    expect(next.events.some((event) => event.type === 'resonanceResolved')).toBe(false)
  })

  it('影線獵人的雙線留下可見路徑；殘切回收才會把玩家送到高風險線端', () => {
    const state = buildState({
      classId: 'shadowline-hunter',
      selectedClassCards: ['broken-shadow-step', 'double-line-return', 'residual-collection'],
      enemies: [makeEnemy({ id: 'marked', kind: 'ember-thrall', position: { x: 2.5, y: 0 } })],
    })
    const lined = tick(state, input({ skillQ: true, aimX: 1, aimY: 0 }))
    expect(lined.player.classObjects.shadowLine).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 4.3, y: 0 }, markedEnemyIds: ['marked'] })

    const armed = {
      ...lined,
      previousInput: input(),
      player: { ...lined.player, classObjects: { ...lined.player.classObjects, shadowLine: { ...lined.player.classObjects.shadowLine!, residualEnemyIds: ['marked'] } } },
    }
    const collected = tick(armed, input({ skillE: true }))
    expect(collected.player.position).toEqual({ x: 4.3, y: 0 })
    expect(collected.player.classObjects.shadowLine).toBeNull()
    expect(collected.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'residual-collection', effect: '殘切回收', targetIds: ['marked'] }))
    expect(collected.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', classId: 'shadowline-hunter', resonance: '線路收割', targetIds: ['marked'] }))
  })

  it('斷影追步只在第三段穿過標定影線時留下自己的成功事件', () => {
    const base = buildState().player
    const state = buildState({
      classId: 'shadowline-hunter',
      selectedClassCards: ['broken-shadow-step'],
      player: {
        ...base,
        combo: { hitIndex: 3, phase: 'startup', phaseTicksRemaining: 0 },
        classObjects: { forgeNail: null, shadowLine: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ticksRemaining: 200, markedEnemyIds: ['marked'], residualEnemyIds: [] } },
      },
      enemies: [makeEnemy({ id: 'marked', kind: 'ember-thrall', position: { x: 1.8, y: 0 } })],
    })
    const next = tick(state, input({ aimX: 1 }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'broken-shadow-step', effect: '斷影追步', targetIds: ['marked'] }))
  })

  it('1.0 路徑不會憑空建立職業物件', () => {
    const state = buildState({ enemies: [makeEnemy({ id: 'legacy', kind: 'ember-thrall', position: { x: 2, y: 0 } })] })
    const next = tick(state, input({ skillQ: true, aimX: 1, aimY: 0 }))
    expect(next.classId).toBeNull()
    expect(next.player.classObjects).toEqual({ forgeNail: null, shadowLine: null })
  })

  it('灼鐵回旋只在防區內的第三段追加向外掃環；雙釘封口加鐵幕回收會收束熔鏈內受壓目標', () => {
    const base = buildState().player
    const rotation = buildState({
      classId: 'forgeguard', selectedClassCards: ['heated-rotation'],
      player: { ...base, combo: { hitIndex: 3, phase: 'startup', phaseTicksRemaining: 0 }, classObjects: { forgeNail: { position: { x: 0, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null } },
      enemies: [makeEnemy({ id: 'ring', kind: 'ember-thrall', position: { x: 2, y: 0 } })],
    })
    const spun = tick(rotation, input({ aimX: 1 }))
    expect(spun.enemies[0]!.position.x).toBeGreaterThan(2)

    const sealed = buildState({
      classId: 'forgeguard', selectedClassCards: ['double-nail-seal', 'iron-curtain-recall'],
      player: { ...base, classObjects: { forgeNail: { position: { x: -1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: ['caught'] }, sealNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: ['caught'] }, shadowLine: null } },
      enemies: [makeEnemy({ id: 'caught', kind: 'ember-thrall', position: { x: 0, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 2 } })],
    })
    const recalled = tick(sealed, input({ skillE: true, aimX: 1 }))
    expect(recalled.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', classId: 'forgeguard', resonance: '封口回收', targetIds: ['caught'] }))
    expect(recalled.enemies[0]!.position).toEqual({ x: 0, y: 0 })
  })

  it('封口回收會在缺雙釘與空格擋時留下明確拒絕原因', () => {
    const base = buildState().player
    const missing = buildState({ classId: 'forgeguard', selectedClassCards: ['double-nail-seal', 'iron-curtain-recall'], player: { ...base, classObjects: { forgeNail: { position: { x: 0, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null } } })
    expect(tick(missing, input({ skillE: true })).events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '封口回收', reason: '缺少雙釘' }))
  })

  it('雙釘封口第二次 Q 才形成熔鏈；獵隙標定的空線只留下路徑、不給隱性傷害', () => {
    const base = buildState({ classId: 'forgeguard', selectedClassCards: ['double-nail-seal'] })
    const first = tick(base, input({ skillQ: true, aimX: 1 }))
    const second = tick({ ...first, player: { ...first.player, qCooldownTicksRemaining: 0 }, previousInput: input() }, input({ skillQ: true, aimX: -1 }))
    expect(second.player.classObjects.sealNail).toBeDefined()
    expect(second.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'double-nail-seal', effect: '雙釘封口', targetIds: [] }))

    const hunter = buildState({ classId: 'shadowline-hunter', selectedClassCards: ['gap-marking'], enemies: [makeEnemy({ id: 'outside', kind: 'ember-thrall', position: { x: 2, y: 2 } })] })
    const marked = tick(hunter, input({ skillQ: true, aimX: 1 }))
    expect(marked.player.classObjects.shadowLine!.markedEnemyIds).toEqual([])
    expect(marked.enemies[0]!.hp).toBe(hunter.enemies[0]!.hp)
  })

  it('同時投資雙釘與引火鉤時，每次 Q 都保留雙釘容量並拉近防區邊緣敵人', () => {
    const state = buildState({
      classId: 'forgeguard',
      selectedClassCards: ['double-nail-seal', 'fire-hook'],
      enemies: [makeEnemy({ id: 'edge', kind: 'ember-thrall', position: { x: 5, y: 0 } })],
    })
    const first = tick(state, input({ skillQ: true, aimX: 1 }))
    expect(first.player.classObjects.forgeNail).toMatchObject({ position: { x: 2.15, y: 0 } })
    expect(first.enemies[0]!.position.x).toBeLessThan(5)

    const second = tick({ ...first, previousInput: input(), player: { ...first.player, qCooldownTicksRemaining: 0 } }, input({ skillQ: true, aimX: -1 }))
    expect(second.player.classObjects.sealNail).toMatchObject({ position: { x: -2.15, y: 0 } })
    expect(second.enemies[0]!.position.x).toBeLessThan(first.enemies[0]!.position.x)
  })

  it('雙線折返與獵隙標定共同保留兩條線，並讓精準掠過敵人成為標定目標', () => {
    const state = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['double-line-return', 'gap-marking'],
      enemies: [makeEnemy({ id: 'marked', kind: 'ember-thrall', position: { x: 2.5, y: 0 } })],
    })
    const first = tick(state, input({ skillQ: true, aimX: 1 }))
    expect(first.player.classObjects.shadowLine).toMatchObject({ end: { x: 4.3, y: 0 }, markedEnemyIds: ['marked'] })
    const second = tick({ ...first, previousInput: input(), player: { ...first.player, qCooldownTicksRemaining: 0 } }, input({ skillQ: true, aimX: 0, aimY: 1 }))
    expect(second.player.classObjects.returnLine).toMatchObject({ end: { x: 0, y: 4.3 } })
    expect(second.player.classObjects.shadowLine!.markedEnemyIds).toEqual(['marked'])
  })

  it('回身割裂與殘切回收在同一次 E 同時回斬並消耗殘切，而非互相遮蔽', () => {
    const base = buildState().player
    const state = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['returning-rend', 'residual-collection'],
      player: { ...base, classObjects: { forgeNail: null, shadowLine: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ticksRemaining: 200, markedEnemyIds: [], residualEnemyIds: ['cut'] } } },
      enemies: [makeEnemy({ id: 'cut', kind: 'ember-thrall', position: { x: 2, y: 0 } })],
    })
    const next = tick(state, input({ skillE: true }))
    expect(next.player.position).toEqual({ x: 4, y: 0 })
    expect(next.player.classObjects.shadowLine).toMatchObject({ residualEnemyIds: [] })
    expect(next.enemies[0]!.hp).toBeLessThan(state.enemies[0]!.hp - 13)
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'returning-rend', effect: '回身割裂', targetIds: ['cut'] }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'residual-collection', effect: '殘切回收', targetIds: ['cut'] }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', resonance: '線路收割', targetIds: ['cut'] }))
  })

  it('鐵幕回收在沒有雙釘時仍會以成功格擋把受壓敵人拉回盾與爐釘之間', () => {
    const base = buildState().player
    const state = buildState({
      classId: 'forgeguard', selectedClassCards: ['iron-curtain-recall'],
      player: { ...base, classObjects: { forgeNail: { position: { x: 2, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: ['pressed'] }, shadowLine: null } },
      enemies: [makeEnemy({ id: 'pressed', kind: 'ember-thrall', position: { x: 2.2, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 3 } })],
    })
    const next = tick(state, input({ skillE: true, aimX: 1 }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'playerBlocked' }))
    expect(next.enemies[0]!.position).toEqual({ x: 1, y: 0 })
  })

  it('反壓爐鳴與鐵幕回收同時持有時，各自輸出 typed 結果且反震保留最終擊退位置', () => {
    const base = buildState().player
    const state = buildState({
      classId: 'forgeguard',
      selectedClassCards: ['bulwark-hammer', 'pressure-furnace-roar', 'iron-curtain-recall'],
      player: { ...base, classObjects: { forgeNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: ['pressed'] }, shadowLine: null } },
      enemies: [makeEnemy({ id: 'pressed', kind: 'ember-thrall', position: { x: 1.4, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 2 } })],
    })
    const next = tick(state, input({ skillE: true, aimX: 1 }))
    expect(next.events).toContainEqual({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'iron-curtain-recall', effect: '鐵幕收束', targetIds: ['pressed'] })
    expect(next.events).toContainEqual({ type: 'classEffectResolved', classId: 'forgeguard', cardId: 'pressure-furnace-roar', effect: '反壓反震', targetIds: ['pressed'] })
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', resonance: '防區反震', targetIds: ['pressed'] }))
    expect(next.enemies[0]!.position.x).toBeGreaterThan(3)
  })

  it.each([
    ['熔鏈外', buildState({ classId: 'forgeguard', selectedClassCards: ['double-nail-seal', 'iron-curtain-recall'], player: { ...buildState().player, classObjects: { forgeNail: { position: { x: -1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: ['outside'] }, sealNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null } }, enemies: [makeEnemy({ id: 'outside', kind: 'ember-thrall', position: { x: -1, y: 1.2 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 2 } })] })],
    ['未受壓', buildState({ classId: 'forgeguard', selectedClassCards: ['double-nail-seal', 'iron-curtain-recall'], player: { ...buildState().player, classObjects: { forgeNail: { position: { x: -1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, sealNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null } } })],
    ['未成功格擋', buildState({ classId: 'forgeguard', selectedClassCards: ['double-nail-seal', 'iron-curtain-recall'], player: { ...buildState().player, classObjects: { forgeNail: { position: { x: -1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: ['caught'] }, sealNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null } }, enemies: [makeEnemy({ id: 'caught', kind: 'ember-thrall', position: { x: 0, y: 0 } })] })],
  ] as const)('封口回收在%s時拒絕，且同 tick 不會 resolved', (reason, state) => {
    const next = tick(state, input({ skillE: true, aimX: 1 }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '封口回收', reason }))
    expect(next.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '封口回收')).toBe(false)
  })

  it.each([
    ['錯誤落點', { forgeNail: null, shadowLine: null, returnLine: { start: { x: 0, y: 0 }, end: { x: 0, y: 4 }, ticksRemaining: 200, markedEnemyIds: ['mark'], residualEnemyIds: [] } }],
    ['無標定目標', { forgeNail: null, shadowLine: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ticksRemaining: 200, markedEnemyIds: [], residualEnemyIds: [] }, returnLine: { start: { x: 4, y: 0 }, end: { x: 4, y: 2 }, ticksRemaining: 200, markedEnemyIds: [], residualEnemyIds: [] } }],
  ] as const)('折返處刑在%s時拒絕，且同 tick 不會 resolved', (reason, classObjects) => {
    const base = buildState().player
    const state = buildState({ classId: 'shadowline-hunter', selectedClassCards: ['double-line-return', 'returning-rend'], player: { ...base, classObjects } })
    const next = tick(state, input({ skillE: true }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '折返處刑', reason }))
    expect(next.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '折返處刑')).toBe(false)
  })

  it('交錯收刀留下標記殘切；獵隙標定與回身割裂以雙線折返兌現折返處刑，空線會拒絕', () => {
    const base = buildState().player
    const line = { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ticksRemaining: 200, markedEnemyIds: ['mark'], residualEnemyIds: [] }
    const sheath = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['crossed-sheath'],
      player: { ...base, combo: { hitIndex: 3, phase: 'startup', phaseTicksRemaining: 0 }, classObjects: { forgeNail: null, shadowLine: line } },
      enemies: [makeEnemy({ id: 'mark', kind: 'ember-thrall', position: { x: 1.5, y: 0 } })],
    })
    const sheathed = tick(sheath, input({ aimX: 1 }))
    expect(sheathed.player.classObjects.shadowLine!.residualEnemyIds).toContain('mark')
    expect(sheathed.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'crossed-sheath', effect: '交錯收刀', targetIds: ['mark'] }))

    const returned = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['gap-marking', 'double-line-return', 'returning-rend'],
      player: { ...base, classObjects: { forgeNail: null, shadowLine: line, returnLine: { ...line, start: { x: 4, y: 0 }, end: { x: 4, y: 2 }, markedEnemyIds: ['mark'] } } },
      enemies: [makeEnemy({ id: 'mark', kind: 'ember-thrall', position: { x: 3.8, y: 0 } })],
    })
    const cut = tick(returned, input({ skillE: true }))
    expect(cut.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'returning-rend', effect: '回身割裂', targetIds: ['mark'] }))
    expect(cut.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', classId: 'shadowline-hunter', resonance: '折返處刑', targetIds: ['mark'] }))
    expect(cut.player.position).toEqual({ x: 4, y: 0 })
    const empty = buildState({ classId: 'shadowline-hunter', selectedClassCards: ['double-line-return', 'returning-rend'] })
    expect(tick(empty, input({ skillE: true })).events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '折返處刑', reason: '缺少折返線' }))
  })

  it('第三批與既有同槽三卡以可疊合 pipeline 共同結算，不由 if 優先序靜默淘汰', () => {
    const base = buildState().player
    const forge = buildState({
      classId: 'forgeguard', selectedClassCards: ['bulwark-hammer', 'heated-rotation', 'shield-wedge'],
      player: { ...base, combo: { hitIndex: 3, phase: 'startup', phaseTicksRemaining: 0 }, classObjects: { forgeNail: { position: { x: 1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null } },
      enemies: [
        makeEnemy({ id: 'wedge', kind: 'ember-thrall', position: { x: 1.4, y: 0 } }),
        makeEnemy({ id: 'rotation', kind: 'ember-thrall', position: { x: 1, y: 1.2 } }),
      ],
    })
    const forged = tick(forge, input({ aimX: 1 }))
    expect(forged.player.classObjects.breachPoint).toMatchObject({ enemyId: 'wedge' })
    expect(forged.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'bulwark-hammer', effect: '壁壘重錘', targetIds: expect.arrayContaining(['wedge', 'rotation']) }))
    expect(forged.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'heated-rotation', effect: '灼鐵回旋', targetIds: ['rotation'] }))
    expect(forged.enemies.find((enemy) => enemy.id === 'rotation')!.hp).toBeLessThan(forge.enemies[1]!.hp)

    const hunter = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['double-line-return', 'gap-marking', 'reverse-mark-anchor'],
      player: { ...base, classObjects: { forgeNail: null, shadowLine: null } },
      enemies: [makeEnemy({ id: 'anchor', kind: 'ember-thrall', position: { x: 2, y: 0 } })],
    })
    const first = tick(hunter, input({ skillQ: true, aimX: 1 }))
    expect(first.player.classObjects.shadowLine).toMatchObject({ anchorEnemyId: 'anchor', markedEnemyIds: ['anchor'], kind: 'double-line' })
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'gap-marking', effect: '獵隙標定', targetIds: ['anchor'] }))
    const second = tick({ ...first, player: { ...first.player, qCooldownTicksRemaining: 0 }, previousInput: input() }, input({ skillQ: true, aimX: 1 }))
    expect(second.player.classObjects.returnLine).toMatchObject({ anchorEnemyId: 'anchor', kind: 'double-line' })
    expect(second.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'double-line-return', effect: '雙線折返', targetIds: ['anchor'] }))
  })

  it('最後一批熔衛：定錨回擊留下火索、回爐移釘捨棄舊防區，成功格擋才熔鎖退讓', () => {
    const base = buildState().player
    const anchored = buildState({
      classId: 'forgeguard', selectedClassCards: ['anchored-riposte'],
      player: { ...base, combo: { hitIndex: 3, phase: 'startup', phaseTicksRemaining: 0 }, classObjects: { forgeNail: { position: { x: -1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null } },
      enemies: [makeEnemy({ id: 'hammered', kind: 'ember-thrall', position: { x: 1.5, y: 0 } })],
    })
    const tethered = tick(anchored, input({ aimX: 1 }))
    expect(tethered.player.classObjects.forgeTether).toMatchObject({ end: { x: -1, y: 0 } })
    expect(tethered.player.classObjects.forgeTether!.start.x).toBeLessThan(0.3)
    expect(tethered.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'anchored-riposte', effect: '定錨回擊' }))

    const relocating = buildState({
      classId: 'forgeguard', selectedClassCards: ['reforge-relocation'],
      player: { ...base, classObjects: { forgeNail: { position: { x: -2, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: ['old'] }, shadowLine: null } },
    })
    const moved = tick(relocating, input({ skillQ: true, aimX: 1 }))
    expect(moved.player.classObjects.forgeNail).toMatchObject({ position: { x: 2.4, y: 0 }, pressuredEnemyIds: [] })
    expect(moved.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'reforge-relocation', effect: '回爐移釘' }))

    const retreat = buildState({
      classId: 'forgeguard', selectedClassCards: ['anchored-riposte', 'molten-lock-retreat'],
      player: { ...base, classObjects: { forgeNail: { position: { x: -1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null, forgeTether: { start: { x: 0, y: 0 }, end: { x: -1, y: 0 }, ticksRemaining: 200 } } },
      enemies: [makeEnemy({ id: 'blocker', kind: 'ember-thrall', position: { x: 0, y: 0 }, attackState: 'telegraph', timerTicks: 1, telegraphGeometry: { kind: 'circle', center: { x: 0, y: 0 }, radius: 2 } })],
    })
    const locked = tick(retreat, input({ skillE: true, aimX: -1 }))
    expect(locked.player.position).toEqual({ x: -1, y: 0 })
    expect(locked.player.classObjects.moltenLock).toBeDefined()
    expect(locked.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'molten-lock-retreat', effect: '熔鎖退讓' }))
    expect(locked.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', resonance: '錨索退讓' }))
  })

  it.each([
    ['缺少火索', { forgeNail: { position: { x: -1, y: 0 }, ticksRemaining: 200, pressuredEnemyIds: [] }, shadowLine: null }],
    ['缺少爐釘', { forgeNail: null, shadowLine: null, forgeTether: { start: { x: 0, y: 0 }, end: { x: -1, y: 0 }, ticksRemaining: 200 } }],
  ] as const)('錨索退讓在%s時拒絕且不 resolved', (reason, classObjects) => {
    const base = buildState().player
    const state = buildState({ classId: 'forgeguard', selectedClassCards: ['anchored-riposte', 'molten-lock-retreat'], player: { ...base, classObjects } })
    const next = tick(state, input({ skillE: true }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '錨索退讓', reason }))
    expect(next.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '錨索退讓')).toBe(false)
  })

  it('最後一批影線：釘身換位留下殘切、環扣索留彎線、跨線借位兌現交線換身', () => {
    const base = buildState().player
    const swapped = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['pinned-body-swap'],
      player: { ...base, combo: { hitIndex: 3, phase: 'startup', phaseTicksRemaining: 0 }, classObjects: { forgeNail: null, shadowLine: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ticksRemaining: 200, markedEnemyIds: ['mark'], residualEnemyIds: [] } } },
      enemies: [makeEnemy({ id: 'mark', kind: 'ember-thrall', position: { x: 1.4, y: 0 } })],
    })
    const swappedNext = tick(swapped, input({ aimX: 1 }))
    expect(swappedNext.player.classObjects.shadowLine).toMatchObject({ swappedEnemyId: 'mark', residualEnemyIds: ['mark'] })
    expect(swappedNext.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'pinned-body-swap', effect: '釘身換位' }))

    const loop = tick(buildState({ classId: 'shadowline-hunter', selectedClassCards: ['loop-tether'] }), input({ skillQ: true, aimX: 1 }))
    expect(loop.player.classObjects.shadowLine).toMatchObject({ kind: 'loop-tether', curveControl: { x: 2.15, y: 1.15 } })
    expect(loop.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'loop-tether', effect: '環扣索' }))

    const borrowed = buildState({
      classId: 'shadowline-hunter', selectedClassCards: ['pinned-body-swap', 'cross-line-borrow'],
      player: { ...base, classObjects: { forgeNail: null, shadowLine: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ticksRemaining: 200, markedEnemyIds: ['swap'], residualEnemyIds: ['swap'], swappedEnemyId: 'swap' }, returnLine: { start: { x: 4, y: 0 }, end: { x: 3, y: 2 }, ticksRemaining: 200, markedEnemyIds: [], residualEnemyIds: [], kind: 'double-line' } } },
      enemies: [makeEnemy({ id: 'swap', kind: 'ember-thrall', position: { x: 1.5, y: 0 } })],
    })
    const crossed = tick(borrowed, input({ skillE: true }))
    expect(crossed.player.position).toEqual({ x: 3, y: 2 })
    expect(crossed.player.classObjects.crossBorrow).toBeDefined()
    expect(crossed.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'cross-line-borrow', effect: '跨線借位' }))
    expect(crossed.events).toContainEqual(expect.objectContaining({ type: 'resonanceResolved', resonance: '交線換身', targetIds: ['swap'] }))
  })

  it('環扣索與雙線折返同槽時，兩次 Q 同時留下彎折幾何、雙線壽命與第二條 returnLine', () => {
    const state = buildState({
      classId: 'shadowline-hunter',
      selectedClassCards: ['loop-tether', 'double-line-return'],
      enemies: [makeEnemy({ id: 'line-target', kind: 'ember-thrall', position: { x: 2, y: 0 } })],
    })
    const first = tick(state, input({ skillQ: true, aimX: 1 }))
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'loop-tether', effect: '環扣索' }))
    expect(first.player.classObjects.shadowLine).toMatchObject({
      kind: 'double-line',
      curveControl: { x: 2.15, y: 1.15 },
      ticksRemaining: expect.any(Number),
    })
    const ready = { ...first, player: { ...first.player, qCooldownTicksRemaining: 0 } }
    const released = tick(ready, input({ aimX: 1 }))
    const second = tick({ ...released, player: { ...released.player, qCooldownTicksRemaining: 0 } }, input({ skillQ: true, aimX: 1 }))
    expect(second.events).toContainEqual(expect.objectContaining({ type: 'classEffectResolved', cardId: 'loop-tether', effect: '環扣索' }))
    expect(second.player.classObjects.returnLine).toMatchObject({
      kind: 'double-line',
      curveControl: { x: 2.15, y: 1.15 },
    })
  })

  it.each([
    ['缺少換位殘切', { forgeNail: null, shadowLine: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ticksRemaining: 200, markedEnemyIds: [], residualEnemyIds: [] }, returnLine: { start: { x: 4, y: 0 }, end: { x: 3, y: 2 }, ticksRemaining: 200, markedEnemyIds: [], residualEnemyIds: [], kind: 'double-line' as const } }],
    ['缺少第二線', { forgeNail: null, shadowLine: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ticksRemaining: 200, markedEnemyIds: ['swap'], residualEnemyIds: ['swap'], swappedEnemyId: 'swap' } }],
  ] as const)('交線換身在%s時拒絕且不 resolved', (reason, classObjects) => {
    const base = buildState().player
    const state = buildState({ classId: 'shadowline-hunter', selectedClassCards: ['pinned-body-swap', 'cross-line-borrow'], player: { ...base, classObjects } })
    const next = tick(state, input({ skillE: true }))
    expect(next.events).toContainEqual(expect.objectContaining({ type: 'resonanceRejected', resonance: '交線換身', reason }))
    expect(next.events.some((event) => event.type === 'resonanceResolved' && event.resonance === '交線換身')).toBe(false)
  })
})
