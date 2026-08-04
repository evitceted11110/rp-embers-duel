import { type Rng } from '@rogue-paradise/rng'
import { simulate } from '@rogue-paradise/sim'

// Gate 2 的拋棄式純資料原型。只驗證 Draft、卡池與可見共鳴前置；
// 不讀 runtime/content，也不虛構 HP、傷害、冷卻或勝率。

export type ClassId = 'forgeguard' | 'shadowline-hunter'
export type SlotId = 'primary' | 'q' | 'e'
export type CardType = 'shape' | 'path' | 'timing' | 'position' | 'risk'
export type ResonanceId =
  | 'zone-rebound'
  | 'seal-recovery'
  | 'wedge-pivot'
  | 'line-harvest'
  | 'return-execution'
  | 'hanging-escape'
export type MissedReason = 'missing-prerequisite' | 'card-not-picked' | 'held-by-policy'

export type ClassCard = {
  id: string
  classId: ClassId
  slot: SlotId
  type: CardType
  changes: readonly string[]
  creates: readonly string[]
  consumes: readonly string[]
  tradeoff: string
  resonanceTags: readonly ResonanceId[]
}

type ResonanceRule = { id: ResonanceId; classId: ClassId; requiredCards: readonly string[]; visibleResult: string }
export type Investment = Record<SlotId, number>
export type DraftOffer = { slot: SlotId; cardId: string | null; supplyReason: 'normal-rotation' | 'target-investment' | 'resonance-prerequisite' | 'slot-forged' }
export type ResonanceOutcome = { id: ResonanceId; status: 'available' | 'attempted' | 'resolved' | 'missed'; reason?: MissedReason }

const slots: readonly SlotId[] = ['primary', 'q', 'e']
const classes: readonly ClassId[] = ['forgeguard', 'shadowline-hunter']
const zeroInvestment = (): Investment => ({ primary: 0, q: 0, e: 0 })

// 每張卡都以非數值的幾何、路徑、時序、位置或風險改寫表示。
export const classCards: readonly ClassCard[] = [
  { id: 'bulwark-hammer', classId: 'forgeguard', slot: 'primary', type: 'shape', changes: ['third_arc', 'push_to_nail'], creates: ['pressure_ring'], consumes: [], tradeoff: 'loses forward pursuit', resonanceTags: ['zone-rebound'] },
  { id: 'heated-rotation', classId: 'forgeguard', slot: 'primary', type: 'timing', changes: ['zone_only_rotation'], creates: ['zone_ring'], consumes: ['forge_zone'], tradeoff: 'requires staying in zone', resonanceTags: ['zone-rebound'] },
  { id: 'anchored-riposte', classId: 'forgeguard', slot: 'primary', type: 'position', changes: ['retreat_to_nail', 'shield_edge_start'], creates: ['fire_tether'], consumes: [], tradeoff: 'gives up chase', resonanceTags: ['zone-rebound'] },
  { id: 'shield-wedge', classId: 'forgeguard', slot: 'primary', type: 'risk', changes: ['narrow_thrust', 'facing_lock'], creates: ['breach_point'], consumes: [], tradeoff: 'cannot turn during heavy strike', resonanceTags: ['wedge-pivot'] },
  { id: 'double-nail-seal', classId: 'forgeguard', slot: 'q', type: 'shape', changes: ['two_nails', 'chain_wall'], creates: ['forge_zone', 'seal_chain'], consumes: [], tradeoff: 'smaller single-zone coverage', resonanceTags: ['seal-recovery'] },
  { id: 'fire-hook', classId: 'forgeguard', slot: 'q', type: 'position', changes: ['edge_pull'], creates: ['forge_zone', 'pulled_enemy'], consumes: [], tradeoff: 'gives up fast redeploy', resonanceTags: ['seal-recovery'] },
  { id: 'ring-forged-boundary', classId: 'forgeguard', slot: 'q', type: 'shape', changes: ['arc_wall', 'guard_inside'], creates: ['arc_wall', 'forge_zone'], consumes: [], tradeoff: 'leaves a visible gap', resonanceTags: ['zone-rebound'] },
  { id: 'reforge-relocation', classId: 'forgeguard', slot: 'q', type: 'path', changes: ['drag_nail'], creates: ['nail_trail'], consumes: ['forge_zone'], tradeoff: 'old safe zone extinguishes', resonanceTags: ['wedge-pivot'] },
  { id: 'pressure-furnace-roar', classId: 'forgeguard', slot: 'e', type: 'shape', changes: ['nail_origin_rebound'], creates: ['nail_rebound'], consumes: ['forge_zone', 'pressure_ring'], tradeoff: 'narrow personal shockwave', resonanceTags: ['zone-rebound'] },
  { id: 'iron-curtain-recall', classId: 'forgeguard', slot: 'e', type: 'position', changes: ['pull_to_hammer_zone'], creates: ['recovered_enemies'], consumes: ['pressure_ring'], tradeoff: 'no payoff without pressured enemies', resonanceTags: ['seal-recovery'] },
  { id: 'corner-pivot', classId: 'forgeguard', slot: 'e', type: 'path', changes: ['nail_axis_sweep'], creates: ['pivot_sweep'], consumes: ['breach_point'], tradeoff: 'delays immediate relief', resonanceTags: ['wedge-pivot'] },
  { id: 'molten-lock-retreat', classId: 'forgeguard', slot: 'e', type: 'risk', changes: ['return_to_nail', 'lock_retreat_line'], creates: ['lock_chain'], consumes: [], tradeoff: 'cancels forward rebound', resonanceTags: ['zone-rebound'] },
  { id: 'crossed-sheath', classId: 'shadowline-hunter', slot: 'primary', type: 'timing', changes: ['side_slide_return_slash'], creates: ['long_residual_cut'], consumes: ['line_mark'], tradeoff: 'loses direct pass-through', resonanceTags: ['line-harvest'] },
  { id: 'broken-shadow-step', classId: 'shadowline-hunter', slot: 'primary', type: 'path', changes: ['marked_target_reposition'], creates: ['residual_cut'], consumes: ['line_mark'], tradeoff: 'does not move without a mark', resonanceTags: ['line-harvest'] },
  { id: 'stitched-corner', classId: 'shadowline-hunter', slot: 'primary', type: 'position', changes: ['line_intersection_cut'], creates: ['corner_trace'], consumes: ['line_mark'], tradeoff: 'third strike fails without a line', resonanceTags: ['return-execution'] },
  { id: 'pinned-body-swap', classId: 'shadowline-hunter', slot: 'primary', type: 'risk', changes: ['marked_target_swap'], creates: ['residual_cut'], consumes: ['line_mark'], tradeoff: 'lands behind the target', resonanceTags: ['line-harvest'] },
  { id: 'double-line-return', classId: 'shadowline-hunter', slot: 'q', type: 'path', changes: ['two_short_lines', 'return_node'], creates: ['line_mark', 'return_node'], consumes: [], tradeoff: 'shorter line lifetime', resonanceTags: ['return-execution'] },
  { id: 'gap-marking', classId: 'shadowline-hunter', slot: 'q', type: 'timing', changes: ['bright_telegraph_mark'], creates: ['line_mark', 'telegraph_anchor'], consumes: [], tradeoff: 'cannot pass through obstacles', resonanceTags: ['line-harvest'] },
  { id: 'loop-tether', classId: 'shadowline-hunter', slot: 'q', type: 'shape', changes: ['moving_arc_line'], creates: ['arc_line', 'line_mark'], consumes: [], tradeoff: 'only one line', resonanceTags: ['line-harvest'] },
  { id: 'reverse-mark-anchor', classId: 'shadowline-hunter', slot: 'q', type: 'risk', changes: ['enemy_moving_anchor'], creates: ['line_mark', 'telegraph_anchor'], consumes: [], tradeoff: 'fast enemy can move escape route', resonanceTags: ['hanging-escape'] },
  { id: 'returning-rend', classId: 'shadowline-hunter', slot: 'e', type: 'timing', changes: ['return_slash'], creates: ['return_slash'], consumes: ['line_mark', 'return_node'], tradeoff: 'longer recovery window', resonanceTags: ['return-execution'] },
  { id: 'residual-collection', classId: 'shadowline-hunter', slot: 'e', type: 'position', changes: ['cut_collection_pull'], creates: ['line_pull'], consumes: ['residual_cut'], tradeoff: 'weaker without cuts', resonanceTags: ['line-harvest'] },
  { id: 'terminal-drop', classId: 'shadowline-hunter', slot: 'e', type: 'path', changes: ['early_terminal', 'return_line'], creates: ['return_line'], consumes: ['line_mark'], tradeoff: 'gives up full traversal', resonanceTags: ['hanging-escape'] },
  { id: 'cross-line-borrow', classId: 'shadowline-hunter', slot: 'e', type: 'risk', changes: ['far_endpoint_swap'], creates: ['endpoint_pair'], consumes: ['return_node'], tradeoff: 'cannot cast with one line', resonanceTags: ['return-execution'] },
]

const resonanceRules: readonly ResonanceRule[] = [
  { id: 'zone-rebound', classId: 'forgeguard', requiredCards: ['bulwark-hammer', 'pressure-furnace-roar'], visibleResult: 'pressure_ring_to_nail_rebound' },
  { id: 'seal-recovery', classId: 'forgeguard', requiredCards: ['double-nail-seal', 'iron-curtain-recall'], visibleResult: 'seal_chain_to_recovered_enemies' },
  { id: 'wedge-pivot', classId: 'forgeguard', requiredCards: ['shield-wedge', 'corner-pivot'], visibleResult: 'breach_point_to_pivot_sweep' },
  { id: 'line-harvest', classId: 'shadowline-hunter', requiredCards: ['broken-shadow-step', 'residual-collection'], visibleResult: 'line_mark_to_residual_cut_to_line_pull' },
  { id: 'return-execution', classId: 'shadowline-hunter', requiredCards: ['double-line-return', 'returning-rend'], visibleResult: 'return_node_to_return_slash' },
  { id: 'hanging-escape', classId: 'shadowline-hunter', requiredCards: ['reverse-mark-anchor', 'terminal-drop'], visibleResult: 'telegraph_anchor_to_return_line' },
]

export const pendingBalanceParameters = [
  '敵方 HP、傷害、波次密度、預兆時長、關卡間恢復量',
  'Space 冷卻與無敵窗',
  '熔衛：爐釘半徑／持續／上限、受壓條件、格擋窗、反震範圍與冷卻',
  '影線：線長／壽命／上限、殘切壽命、E 冷卻與落點危險係數',
  '每張卡供給權重與共鳴前置的可見窗口',
  'Boss 各階段對防區／線路的考題比例與轉場預算',
] as const

function cardsFor(classId: ClassId, slot: SlotId): ClassCard[] {
  return classCards.filter((card) => card.classId === classId && card.slot === slot)
}

function legalTarget(target: Investment): boolean {
  return slots.every((slot) => Number.isInteger(target[slot]) && target[slot] >= 0 && target[slot] <= 4) && slots.reduce((sum, slot) => sum + target[slot], 0) === 6
}

export const targetInvestments: readonly Investment[] = [
  { primary: 4, q: 1, e: 1 }, { primary: 1, q: 4, e: 1 }, { primary: 1, q: 1, e: 4 },
  { primary: 3, q: 2, e: 1 }, { primary: 3, q: 1, e: 2 }, { primary: 2, q: 3, e: 1 },
  { primary: 1, q: 3, e: 2 }, { primary: 2, q: 1, e: 3 }, { primary: 1, q: 2, e: 3 },
  { primary: 2, q: 2, e: 2 },
]

function offerForSlot(rng: Rng, classId: ClassId, slot: SlotId, selected: readonly string[], investment: Investment, target: Investment, draft: number): DraftOffer {
  const legal = cardsFor(classId, slot).filter((card) => !selected.includes(card.id))
  if (legal.length === 0) return { slot, cardId: null, supplyReason: 'slot-forged' }
  const neededForTarget = investment[slot] < target[slot]
  const resonanceNeeded = draft === 2 && !resonanceRules.some((rule) => rule.classId === classId && rule.requiredCards.every((id) => selected.includes(id)))
  return { slot, cardId: rng.pick(legal).id, supplyReason: resonanceNeeded && slot !== 'primary' ? 'resonance-prerequisite' : neededForTarget ? 'target-investment' : 'normal-rotation' }
}

function chooseOffer(offers: readonly DraftOffer[], investment: Investment, target: Investment): DraftOffer {
  return offers.find((offer) => offer.cardId !== null && investment[offer.slot] < target[offer.slot]) ?? offers.find((offer) => offer.cardId !== null) ?? offers[0]!
}

function resonanceOutcomes(classId: ClassId, selected: readonly string[]): ResonanceOutcome[] {
  return resonanceRules.filter((rule) => rule.classId === classId).map((rule) => {
    if (rule.requiredCards.every((id) => selected.includes(id))) return { id: rule.id, status: 'resolved' as const }
    const anyOwned = rule.requiredCards.some((id) => selected.includes(id))
    return { id: rule.id, status: 'missed' as const, reason: anyOwned ? 'card-not-picked' : 'missing-prerequisite' }
  })
}

export function validateClassExpansion(): string[] {
  const issues: string[] = []
  for (const classId of classes) {
    const cards = classCards.filter((card) => card.classId === classId)
    if (cards.length !== 12) issues.push(`${classId} 必須剛好有 12 張卡`)
    for (const slot of slots) if (cards.filter((card) => card.slot === slot).length !== 4) issues.push(`${classId}/${slot} 必須剛好有 4 張卡`)
    if (new Set(cards.map((card) => card.id)).size !== cards.length) issues.push(`${classId} 有重複卡 ID`)
  }
  for (const card of classCards) {
    if (card.changes.length === 0 || card.changes.every((change) => /^\d/.test(change))) issues.push(`${card.id} 缺少非數值改寫`)
    if (!card.tradeoff) issues.push(`${card.id} 缺少取捨`)
  }
  return issues
}

export type ExpansionRun = { classId: ClassId; targetInvestment: Investment; selected: readonly string[]; offers: readonly (readonly DraftOffer[])[]; slotInvestments: Investment; resonanceEvents: readonly ResonanceOutcome[]; decisionSignature: string }

export function runClassExpansion(rng: Rng, forcedClass?: ClassId, target: Investment = targetInvestments[0]!): ExpansionRun {
  if (!legalTarget(target)) throw new Error('targetInvestment 必須是總和 6、每槽 0–4 的合法分配')
  const classId = forcedClass ?? rng.pick(classes)
  const selected: string[] = []
  const offers: DraftOffer[][] = []
  const investment = zeroInvestment()
  for (let draft = 0; draft < 6; draft += 1) {
    const row = slots.map((slot) => offerForSlot(rng.fork(`draft-${draft}-${slot}`), classId, slot, selected, investment, target, draft))
    const choice = chooseOffer(row, investment, target)
    if (choice.cardId !== null) { selected.push(choice.cardId); investment[choice.slot] += 1 }
    offers.push(row)
  }
  const resonanceEvents = resonanceOutcomes(classId, selected)
  return { classId, targetInvestment: { ...target }, selected, offers, slotInvestments: investment, resonanceEvents, decisionSignature: `${classId}|${slots.map((slot) => `${slot}:${investment[slot]}`).join('|')}|${resonanceEvents.filter((event) => event.status === 'resolved').map((event) => event.id).join('+')}` }
}

export type ExpansionSummary = {
  seed: string; runs: number; legalContentViolations: string[]; offerRate: Record<string, number>; selectionRate: Record<string, number>
  targetCompletionRate: Record<string, number>; resonanceReachRate: Record<ResonanceId, number>; resonanceMissReasons: Record<MissedReason, number>
  decisionSignatures: Record<string, number>; selectionHealth: { status: 'structurally-healthy'; reason: string }; determinismDigest: string
  relativeWinRate: null; difficultyCurve: null; pendingBalanceParameters: readonly string[]
}

const targetKey = (target: Investment) => slots.map((slot) => target[slot]).join('/')
export function runClassExpansionPrototype(runs: number, seed = 'embers-class-expansion-gate2-v2'): ExpansionSummary {
  const report = simulate((rng) => { const target = rng.pick(targetInvestments); return runClassExpansion(rng, undefined, target) }, { runs, seed })
  const offered = Object.fromEntries(classCards.map((card) => [card.id, 0])) as Record<string, number>
  const selected = Object.fromEntries(classCards.map((card) => [card.id, 0])) as Record<string, number>
  const completed = Object.fromEntries(targetInvestments.map((target) => [targetKey(target), 0])) as Record<string, number>
  const attempted = Object.fromEntries(targetInvestments.map((target) => [targetKey(target), 0])) as Record<string, number>
  const resonance = Object.fromEntries(resonanceRules.map((rule) => [rule.id, 0])) as Record<ResonanceId, number>
  const missed: Record<MissedReason, number> = { 'missing-prerequisite': 0, 'card-not-picked': 0, 'held-by-policy': 0 }
  const signatures: Record<string, number> = {}
  for (const run of report.results) {
    const key = targetKey(run.targetInvestment); attempted[key] = (attempted[key] ?? 0) + 1
    if (slots.every((slot) => run.slotInvestments[slot] === run.targetInvestment[slot])) completed[key] = (completed[key] ?? 0) + 1
    run.offers.flat().forEach((offer) => { if (offer.cardId !== null) offered[offer.cardId] = (offered[offer.cardId] ?? 0) + 1 })
    run.selected.forEach((id) => { selected[id] = (selected[id] ?? 0) + 1 })
    run.resonanceEvents.forEach((event) => { if (event.status === 'resolved') resonance[event.id] = (resonance[event.id] ?? 0) + 1; else if (event.reason) missed[event.reason] = (missed[event.reason] ?? 0) + 1 })
    signatures[run.decisionSignature] = (signatures[run.decisionSignature] ?? 0) + 1
  }
  const digest = report.results.slice(0, 32).map((run) => `${run.classId}:${run.selected.join(',')}:${run.resonanceEvents.map((event) => `${event.id}-${event.status}`).join(',')}`).join('|')
  return {
    seed, runs, legalContentViolations: validateClassExpansion(),
    offerRate: Object.fromEntries(Object.entries(offered).map(([id, count]) => [id, count / runs])),
    selectionRate: Object.fromEntries(Object.entries(selected).map(([id, count]) => [id, count / runs])),
    targetCompletionRate: Object.fromEntries(Object.entries(completed).map(([key, count]) => [key, count / (attempted[key] ?? 1)])),
    resonanceReachRate: Object.fromEntries(Object.entries(resonance).map(([id, count]) => [id, count / runs])) as Record<ResonanceId, number>,
    resonanceMissReasons: missed, decisionSignatures: signatures,
    selectionHealth: { status: 'structurally-healthy', reason: '每槽四張不可重複具名卡；六次 Draft 以目標投資選取時，所有合法 4/1/1、3/2/1、2/2/2 均可完成。' },
    determinismDigest: digest, relativeWinRate: null, difficultyCurve: null, pendingBalanceParameters,
  }
}
