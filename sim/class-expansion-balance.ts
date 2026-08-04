import { type Rng } from '@rogue-paradise/rng'
import { simulate } from '@rogue-paradise/sim'
import { classCards, type ClassCard, type ClassId, type Investment, type SlotId, targetInvestments } from './class-expansion-prototype.js'

// 可重播的「平衡基線模型」。它不是 runtime 的逐幀替身：目前敵人波次、命中盒與
// 真人反應仍須在 Gate 3 驗證。模型刻意只把規格已承諾的操作前置（讀預兆、站位、
// 布線／防區、共鳴意願）量化，使改版前後能用相同 seed 對照。

export type SkillProfileId = 'learning' | 'competent' | 'expert'
export type BuildPolicyId = 'primary-focus' | 'toolbox' | 'balanced' | 'resonance-first'
export type RuntimeResonanceId =
  | 'zone-rebound' | 'seal-recovery' | 'wedge-pivot' | 'tether-retreat'
  | 'line-harvest' | 'return-execution' | 'hanging-escape' | 'cross-line-borrow'

type SkillProfile = {
  telegraphRead: number; dodge: number; parry: number; positioning: number; resonanceIntent: number; risk: number
}

type Resonance = { id: RuntimeResonanceId; classId: ClassId; cards: readonly [string, string]; requires: 'parry' | 'line' }
type CardStats = { selected: number; uses: number; successes: number }
type Reason = 'card-not-picked' | 'held-by-policy' | 'read-missed' | 'position-missed' | 'execution-missed' | 'risk-rejected'
type RunResult = {
  classId: ClassId; profile: SkillProfileId; policy: BuildPolicyId; build: Investment; won: boolean; rooms: number
  timeSeconds: number; damageTaken: number; death: string | null; selected: readonly string[]
  cardStats: Record<string, CardStats>; resonance: Record<RuntimeResonanceId, { attempts: number; resolved: number; rejected: Record<Reason, number> }>
}

const slots: readonly SlotId[] = ['primary', 'q', 'e']
const classes: readonly ClassId[] = ['forgeguard', 'shadowline-hunter']
const profiles: Record<SkillProfileId, SkillProfile> = {
  learning: { telegraphRead: 0.58, dodge: 0.64, parry: 0.48, positioning: 0.53, resonanceIntent: 0.42, risk: 0.32 },
  competent: { telegraphRead: 0.78, dodge: 0.82, parry: 0.70, positioning: 0.74, resonanceIntent: 0.68, risk: 0.54 },
  expert: { telegraphRead: 0.91, dodge: 0.93, parry: 0.88, positioning: 0.89, resonanceIntent: 0.82, risk: 0.69 },
}
const policies: readonly BuildPolicyId[] = ['primary-focus', 'toolbox', 'balanced', 'resonance-first']
const policyBuild: Record<Exclude<BuildPolicyId, 'resonance-first'>, Investment> = {
  'primary-focus': { primary: 4, q: 1, e: 1 },
  toolbox: { primary: 3, q: 2, e: 1 },
  balanced: { primary: 2, q: 2, e: 2 },
}
const resonances: readonly Resonance[] = [
  { id: 'zone-rebound', classId: 'forgeguard', cards: ['bulwark-hammer', 'pressure-furnace-roar'], requires: 'parry' },
  { id: 'seal-recovery', classId: 'forgeguard', cards: ['double-nail-seal', 'iron-curtain-recall'], requires: 'parry' },
  { id: 'wedge-pivot', classId: 'forgeguard', cards: ['shield-wedge', 'corner-pivot'], requires: 'parry' },
  { id: 'tether-retreat', classId: 'forgeguard', cards: ['anchored-riposte', 'molten-lock-retreat'], requires: 'parry' },
  { id: 'line-harvest', classId: 'shadowline-hunter', cards: ['broken-shadow-step', 'residual-collection'], requires: 'line' },
  { id: 'return-execution', classId: 'shadowline-hunter', cards: ['double-line-return', 'returning-rend'], requires: 'line' },
  { id: 'hanging-escape', classId: 'shadowline-hunter', cards: ['reverse-mark-anchor', 'terminal-drop'], requires: 'line' },
  { id: 'cross-line-borrow', classId: 'shadowline-hunter', cards: ['pinned-body-swap', 'cross-line-borrow'], requires: 'line' },
]

const emptyCardStats = (): Record<string, CardStats> => Object.fromEntries(classCards.map((card) => [card.id, { selected: 0, uses: 0, successes: 0 }]))
const emptyResonance = (): RunResult['resonance'] => Object.fromEntries(resonances.map((rule) => [rule.id, { attempts: 0, resolved: 0, rejected: { 'card-not-picked': 0, 'held-by-policy': 0, 'read-missed': 0, 'position-missed': 0, 'execution-missed': 0, 'risk-rejected': 0 } }])) as RunResult['resonance']
const cardsFor = (classId: ClassId, slot: SlotId): readonly ClassCard[] => classCards.filter((card) => card.classId === classId && card.slot === slot)
const targetKey = (build: Investment): string => `${build.primary}/${build.q}/${build.e}`

function chooseBuild(classId: ClassId, policy: BuildPolicyId, rng: Rng): Investment {
  if (policy !== 'resonance-first') return policyBuild[policy]
  const candidates = resonances.filter((rule) => rule.classId === classId)
  const rule = rng.pick(candidates)
  const selectedCards = rule.cards.map((id) => classCards.find((card) => card.id === id)!)
  const build: Investment = { primary: 1, q: 1, e: 1 }
  for (const card of selectedCards) build[card.slot] += 1
  // 兩張共鳴卡可能落在同一槽；以第三個 slot 補足六張且維持合法上限。
  while (build.primary + build.q + build.e < 6) {
    const candidatesSlots = slots.filter((slot) => build[slot] < 4)
    build[rng.pick(candidatesSlots)] += 1
  }
  return build
}

function draft(classId: ClassId, build: Investment, policy: BuildPolicyId, rng: Rng): string[] {
  const chosen: string[] = []
  const resonanceTarget = policy === 'resonance-first' ? rng.pick(resonances.filter((rule) => rule.classId === classId)) : null
  for (const slot of slots) {
    const count = build[slot]
    const pool = rng.shuffle(cardsFor(classId, slot))
    const favored = resonanceTarget === null ? [] : pool.filter((card) => resonanceTarget.cards.includes(card.id))
    chosen.push(...[...favored, ...pool.filter((card) => !favored.includes(card))].slice(0, count).map((card) => card.id))
  }
  return chosen
}

function chance(rng: Rng, value: number): boolean { return rng.next() < Math.max(0, Math.min(1, value)) }
function cardSuccessChance(card: ClassCard, profile: SkillProfile): number {
  const base = card.type === 'risk' ? profile.positioning * 0.88 : card.type === 'timing' ? profile.telegraphRead * 0.94 : profile.positioning * 0.9 + profile.telegraphRead * 0.1
  return Math.max(0.12, Math.min(0.97, base))
}

export function runClassBalance(rng: Rng, classId: ClassId, profileId: SkillProfileId, policy: BuildPolicyId): RunResult {
  const profile = profiles[profileId]
  const build = chooseBuild(classId, policy, rng.fork('build'))
  const selected = draft(classId, build, policy, rng.fork('draft'))
  const cardStats = emptyCardStats()
  const resonance = emptyResonance()
  for (const id of selected) cardStats[id]!.selected += 1
  let hp = 100
  let timeSeconds = 0
  let damageTaken = 0
  let rooms = 0
  let death: string | null = null
  const owned = new Set(selected)
  for (let room = 1; room <= 6 && hp > 0; room += 1) {
    const roomRng = rng.fork(`room-${room}`)
    const pressure = 0.56 + room * 0.055 + (room === 6 ? 0.10 : 0)
    let damageOutput = 0.52 + selected.filter((id) => classCards.find((card) => card.id === id)?.slot === 'primary').length * 0.045
    let mitigation = classId === 'forgeguard' ? profile.parry * 0.18 + profile.positioning * 0.12 : profile.dodge * 0.14 + profile.positioning * 0.08
    for (const id of selected) {
      const card = classCards.find((entry) => entry.id === id)!
      const uses = room === 6 ? 5 : 3
      for (let use = 0; use < uses; use += 1) {
        const stat = cardStats[id]!
        stat.uses += 1
        if (chance(roomRng.fork(`${id}-${use}`), cardSuccessChance(card, profile))) {
          stat.successes += 1
          damageOutput += card.slot === 'primary' ? 0.006 : 0.004
          mitigation += card.slot === 'e' ? 0.003 : 0.001
        }
      }
    }
    for (const rule of resonances.filter((entry) => entry.classId === classId)) {
      const stat = resonance[rule.id]
      if (!rule.cards.every((id) => owned.has(id))) { stat.rejected['card-not-picked'] += 1; continue }
      if (!chance(roomRng.fork(`${rule.id}-intent`), profile.resonanceIntent)) { stat.rejected['held-by-policy'] += 1; continue }
      stat.attempts += 1
      if (!chance(roomRng.fork(`${rule.id}-read`), profile.telegraphRead)) { stat.rejected['read-missed'] += 1; continue }
      if (!chance(roomRng.fork(`${rule.id}-position`), profile.positioning)) { stat.rejected['position-missed'] += 1; continue }
      // 影線的穿線／落點並非「看到就必按」：低風險傾向的技巧檔應留下明確的
      // 主動拒絕，而不是把所有未觸發誤判為命中盒或輸入失敗。
      if (rule.requires === 'line' && !chance(roomRng.fork(`${rule.id}-risk`), profile.risk)) { stat.rejected['risk-rejected'] += 1; continue }
      const execution = rule.requires === 'parry' ? profile.parry : profile.dodge * (0.82 + profile.risk * 0.18)
      if (!chance(roomRng.fork(`${rule.id}-execute`), execution)) { stat.rejected['execution-missed'] += 1; continue }
      stat.resolved += 1
      damageOutput += 0.11
      mitigation += 0.075
    }
    const roomDamage = Math.max(0, (pressure - mitigation) * (10.5 + roomRng.next() * 8))
    damageTaken += roomDamage
    hp -= roomDamage
    timeSeconds += Math.max(48, 110 - damageOutput * 52 + roomRng.next() * 16)
    rooms = room
    if (hp <= 0) death = room === 6 ? 'boss-pressure' : classId === 'forgeguard' ? 'defense-zone-collapse' : 'endpoint-exposure'
  }
  return { classId, profile: profileId, policy, build, won: hp > 0 && rooms === 6, rooms, timeSeconds, damageTaken, death, selected, cardStats, resonance }
}

export type BalanceSummary = {
  seed: string; runsPerScenario: number; scenarios: number; deterministicDigest: string
  winRate: Record<string, number>; meanTimeSeconds: Record<string, number>; meanDamageTaken: Record<string, number>; deaths: Record<string, number>
  cardSelectionRate: Record<string, number>; cardSuccessRate: Record<string, number>
  resonanceResolveRate: Record<RuntimeResonanceId, number>; resonanceRejectReasons: Record<Reason, number>
  dominantBuildShare: Record<ClassId, number>; unreachableCards: string[]; unreachableResonances: RuntimeResonanceId[]; invalidBuilds: string[]
}

export function runClassBalanceBaseline(runsPerScenario = 10_000, seed = 'embers-class-balance-v1'): BalanceSummary {
  const combinations = classes.flatMap((classId) => (Object.keys(profiles) as SkillProfileId[]).flatMap((profile) => policies.map((policy) => ({ classId, profile, policy }))))
  const results = combinations.flatMap((scenario) => simulate((rng) => runClassBalance(rng, scenario.classId, scenario.profile, scenario.policy), { runs: runsPerScenario, seed: `${seed}:${scenario.classId}:${scenario.profile}:${scenario.policy}` }).results)
  const key = (row: RunResult): string => `${row.classId}/${row.profile}/${row.policy}/${targetKey(row.build)}`
  const groups = new Map<string, RunResult[]>()
  for (const row of results) groups.set(key(row), [...(groups.get(key(row)) ?? []), row])
  const average = (rows: readonly RunResult[], field: 'timeSeconds' | 'damageTaken'): number => rows.reduce((sum, row) => sum + row[field], 0) / rows.length
  const winRate = Object.fromEntries([...groups.entries()].map(([id, rows]) => [id, rows.filter((row) => row.won).length / rows.length]))
  const meanTimeSeconds = Object.fromEntries([...groups.entries()].map(([id, rows]) => [id, average(rows, 'timeSeconds')]))
  const meanDamageTaken = Object.fromEntries([...groups.entries()].map(([id, rows]) => [id, average(rows, 'damageTaken')]))
  const deaths: Record<string, number> = {}
  const selected = emptyCardStats(); const attempted = emptyCardStats()
  const resolved = Object.fromEntries(resonances.map((rule) => [rule.id, 0])) as Record<RuntimeResonanceId, number>
  const resonanceAttempts = Object.fromEntries(resonances.map((rule) => [rule.id, 0])) as Record<RuntimeResonanceId, number>
  const reasons: Record<Reason, number> = { 'card-not-picked': 0, 'held-by-policy': 0, 'read-missed': 0, 'position-missed': 0, 'execution-missed': 0, 'risk-rejected': 0 }
  for (const row of results) {
    if (row.death !== null) deaths[row.death] = (deaths[row.death] ?? 0) + 1
    for (const card of classCards) { selected[card.id]!.selected += row.cardStats[card.id]!.selected; attempted[card.id]!.uses += row.cardStats[card.id]!.uses; attempted[card.id]!.successes += row.cardStats[card.id]!.successes }
    for (const rule of resonances) { const stat = row.resonance[rule.id]; resolved[rule.id] += stat.resolved; resonanceAttempts[rule.id] += stat.attempts; for (const reason of Object.keys(reasons) as Reason[]) reasons[reason] += stat.rejected[reason] }
  }
  const classBuildShare = (classId: ClassId): number => {
    const wins = results.filter((row) => row.classId === classId && row.won)
    const frequency: Record<string, number> = {}
    for (const win of wins) { const id = `${win.policy}/${targetKey(win.build)}`; frequency[id] = (frequency[id] ?? 0) + 1 }
    return wins.length === 0 ? 0 : Math.max(...Object.values(frequency)) / wins.length
  }
  const invalidBuilds = results.filter((row) => !targetInvestments.some((target) => targetKey(target) === targetKey(row.build))).slice(0, 5).map((row) => key(row))
  const digest = results.slice(0, 48).map((row) => `${key(row)}:${row.won}:${row.rooms}:${row.selected.join(',')}`).join('|')
  return {
    seed, runsPerScenario, scenarios: combinations.length, deterministicDigest: digest, winRate, meanTimeSeconds, meanDamageTaken, deaths,
    cardSelectionRate: Object.fromEntries(classCards.map((card) => [card.id, selected[card.id]!.selected / results.filter((row) => row.classId === card.classId).length])),
    cardSuccessRate: Object.fromEntries(classCards.map((card) => [card.id, attempted[card.id]!.uses === 0 ? 0 : attempted[card.id]!.successes / attempted[card.id]!.uses])),
    resonanceResolveRate: Object.fromEntries(resonances.map((rule) => [rule.id, resolved[rule.id] / (resonanceAttempts[rule.id] || 1)])) as Record<RuntimeResonanceId, number>,
    resonanceRejectReasons: reasons, dominantBuildShare: { forgeguard: classBuildShare('forgeguard'), 'shadowline-hunter': classBuildShare('shadowline-hunter') },
    unreachableCards: classCards.filter((card) => selected[card.id]!.selected === 0).map((card) => card.id),
    unreachableResonances: resonances.filter((rule) => resolved[rule.id] === 0).map((rule) => rule.id), invalidBuilds,
  }
}
