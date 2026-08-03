import type { ForgeCoreId, ForgeLoadout, ForgeSlotId } from './types.js'

export type ForgeCard = { readonly id: string; readonly slot: ForgeSlotId; readonly kind: 'replace' | 'extend'; readonly name: string; readonly purpose: string; readonly before: string; readonly after: string }

export const FORGE_CARDS: readonly ForgeCard[] = [
  { id: 'spinning-ember', slot: 'attack', kind: 'replace', name: '旋燼劍式', purpose: '群體收尾', before: '前方重弧', after: '360° 圓環' },
  { id: 'double-reversal', slot: 'attack', kind: 'extend', name: '二重回鋒', purpose: '群體追擊', before: '一圈', after: '反向半圈' },
  { id: 'moving-spin', slot: 'attack', kind: 'extend', name: '移動旋斬', purpose: '追群', before: '定點', after: '移動圓環' },
  { id: 'heated-ring', slot: 'attack', kind: 'extend', name: '灼熱圓環', purpose: '切割地形', before: '收尾', after: '地面火圈' },
  { id: 'ember-core-forge', slot: 'q', kind: 'replace', name: '餘燼核心', purpose: '布置／引爆', before: '突進劍痕', after: '核心爆炸' },
  { id: 'dual-core', slot: 'q', kind: 'extend', name: '雙核序列', purpose: '雙點控制', before: '一枚', after: '① ②' },
  { id: 'quick-arm', slot: 'q', kind: 'extend', name: '快速武裝', purpose: '即時切割', before: '等待', after: '落地武裝' },
  { id: 'resonance', slot: 'q', kind: 'extend', name: '共振引爆', purpose: '連鎖爆發', before: '單爆', after: '雙拍爆炸' },
  { id: 'mirror-stance', slot: 'e', kind: 'replace', name: '鏡甲架勢', purpose: '架盾／反震', before: '擊退扇', after: '正面盾牌' },
  { id: 'deflect-step', slot: 'e', kind: 'extend', name: '偏折步', purpose: '格擋位移', before: '原地', after: '短滑步' },
  { id: 'stored-shock', slot: 'e', kind: 'extend', name: '蓄勢反震', purpose: '盾瓣爆發', before: '單震', after: '三瓣擴震' },
  { id: 'shield-break', slot: 'e', kind: 'extend', name: '裂盾釋放', purpose: '主動解圍', before: '等待', after: '前方震波' },
]

export const DEFAULT_FORGE: ForgeLoadout = { attack: { core: 'mercenary-blade', extensions: [] }, q: { core: 'cinder-dash', extensions: [] }, e: { core: 'breakline-shock', extensions: [] } }

export function forgeChoices(loadout: ForgeLoadout): readonly ForgeCard[] {
  return (['attack', 'q', 'e'] as const).map((slot) => {
    const current = loadout[slot]
    const replacement = FORGE_CARDS.find((card) => card.slot === slot && card.kind === 'replace' && card.id !== current.core)
    return replacement ?? FORGE_CARDS.find((card) => card.slot === slot && card.kind === 'extend' && !current.extensions.includes(card.id))!
  })
}

export function applyForgeCard(loadout: ForgeLoadout, id: string): ForgeLoadout {
  const card = FORGE_CARDS.find((candidate) => candidate.id === id)
  if (card === undefined) return loadout
  const slot = loadout[card.slot]
  if (card.kind === 'replace') return { ...loadout, [card.slot]: { core: card.id as ForgeCoreId, extensions: slot.extensions } }
  return slot.extensions.includes(card.id) ? loadout : { ...loadout, [card.slot]: { ...slot, extensions: [...slot.extensions, card.id] } }
}
