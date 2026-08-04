import { CLASS_CARDS, type ClassId } from '../core/class-expansion.js'

/**
 * Gate 3 前的非文字視覺契約。這份表是 renderer fixture 的資料源，而不是另一份
 * 卡片規則：它只描述玩家在戰場中央應看見什麼，讓 card ID、世界物件與混戰層級
 * 可以被自動稽核。
 */
export type ClassVisualLayer = 'ground' | 'path' | 'target' | 'impact' | 'danger'
export type SuccessSignal = 'class-effect-event' | 'world-state'

export type ClassVisualCue = Readonly<{
  cardId: string
  classId: ClassId
  /** 對應成功 event 時才可精確供 HUD／audio／replay 消費；world-state 仍有 renderer fixture。 */
  successSignal: SuccessSignal
  /** 不是文字或 HUD 的戰場辨識物。 */
  object: string
  layer: ClassVisualLayer
  palette: 'ember' | 'flame' | 'guard' | 'shadow' | 'cyan' | 'bone'
  /** 面對危險／位置承諾時，必須在混戰中維持的幾何提示。 */
  dangerCue: string | null
}>

type CueDefinition = Omit<ClassVisualCue, 'cardId' | 'classId'>

const CUES: Readonly<Record<string, CueDefinition>> = {
  'bulwark-hammer': { successSignal: 'class-effect-event', object: '受壓敵環＋重錘寬扇', layer: 'target', palette: 'flame', dangerCue: '防區邊界' },
  'heated-rotation': { successSignal: 'class-effect-event', object: '防區外掃環', layer: 'impact', palette: 'ember', dangerCue: '僅防區內有效' },
  'anchored-riposte': { successSignal: 'class-effect-event', object: '火索回防路徑', layer: 'path', palette: 'flame', dangerCue: '回到爐釘' },
  'shield-wedge': { successSignal: 'class-effect-event', object: '裂盾楔點＋朝向桿', layer: 'ground', palette: 'guard', dangerCue: '轉掃軸點' },
  'double-nail-seal': { successSignal: 'class-effect-event', object: '第二爐釘＋低熔鏈', layer: 'path', palette: 'flame', dangerCue: '鏈帶成立區' },
  'fire-hook': { successSignal: 'class-effect-event', object: '防區邊緣拉扯環', layer: 'target', palette: 'flame', dangerCue: '邊緣目標' },
  'ring-forged-boundary': { successSignal: 'class-effect-event', object: '有缺口的弧牆', layer: 'ground', palette: 'ember', dangerCue: '缺口漏人方向' },
  'reforge-relocation': { successSignal: 'class-effect-event', object: '移釘前後的熔火軌跡', layer: 'path', palette: 'flame', dangerCue: '舊防區熄滅' },
  'pressure-furnace-roar': { successSignal: 'class-effect-event', object: '爐釘反震外環', layer: 'impact', palette: 'guard', dangerCue: '需成功格擋' },
  'iron-curtain-recall': { successSignal: 'class-effect-event', object: '雙釘中點收束', layer: 'impact', palette: 'flame', dangerCue: '熔鏈內受壓目標' },
  'corner-pivot': { successSignal: 'class-effect-event', object: '金白轉掃弧', layer: 'impact', palette: 'bone', dangerCue: '成功格擋後' },
  'molten-lock-retreat': { successSignal: 'class-effect-event', object: '退讓鎖鏈＋端點環', layer: 'path', palette: 'guard', dangerCue: '取消前方反震' },
  'crossed-sheath': { successSignal: 'class-effect-event', object: '側滑回斬＋殘切十字', layer: 'target', palette: 'cyan', dangerCue: '已標定目標' },
  'broken-shadow-step': { successSignal: 'class-effect-event', object: '窄長切線＋殘切標記', layer: 'path', palette: 'cyan', dangerCue: '必須穿過影線' },
  'stitched-corner': { successSignal: 'class-effect-event', object: '折角影線', layer: 'path', palette: 'shadow', dangerCue: '無線第三段落空' },
  'pinned-body-swap': { successSignal: 'class-effect-event', object: '敵後換位殘切', layer: 'impact', palette: 'cyan', dangerCue: '僅標定敵' },
  'double-line-return': { successSignal: 'class-effect-event', object: '第二折返線＋端點環', layer: 'path', palette: 'shadow', dangerCue: '短命折返端' },
  'gap-marking': { successSignal: 'class-effect-event', object: '窄幅標定線＋目標亮框', layer: 'target', palette: 'cyan', dangerCue: '只命中線上目標' },
  'loop-tether': { successSignal: 'class-effect-event', object: '弧線環扣', layer: 'path', palette: 'cyan', dangerCue: '線端承諾' },
  'reverse-mark-anchor': { successSignal: 'class-effect-event', object: '危險吊點脈衝', layer: 'danger', palette: 'flame', dangerCue: '高速敵會帶走端點' },
  'returning-rend': { successSignal: 'class-effect-event', object: '狹窄回斬線', layer: 'impact', palette: 'bone', dangerCue: '必須回到正確端點' },
  'residual-collection': { successSignal: 'class-effect-event', object: '殘切標記回收', layer: 'target', palette: 'cyan', dangerCue: '無殘切無收益' },
  'terminal-drop': { successSignal: 'class-effect-event', object: '落刃回走線', layer: 'path', palette: 'bone', dangerCue: '吊點預兆' },
  'cross-line-borrow': { successSignal: 'class-effect-event', object: '跨線借位光橋', layer: 'path', palette: 'cyan', dangerCue: '需第二線與換位殘切' },
}

/** 全卡 renderer fixture：新卡未有戰場中央識別物時，這裡會立刻使測試失敗。 */
export function classVisualCues(): readonly ClassVisualCue[] {
  return CLASS_CARDS.map((card) => {
    const cue = CUES[card.id]
    if (cue === undefined) throw new Error(`缺少 ${card.id} 的戰場視覺契約`)
    return { cardId: card.id, classId: card.classId, ...cue }
  })
}

export type ResonanceVisualCue = Readonly<{
  classId: ClassId
  resonance: string
  prerequisiteObject: string
  actionObject: string
  resultObject: string
  rejectedByGeometry: true
}>

/** 八條共鳴都必須能由「留下物 → 按鍵作用 → 中央結果」讀出，不能只依 HUD 字串。 */
export const RESONANCE_VISUAL_CUES: readonly ResonanceVisualCue[] = [
  { classId: 'forgeguard', resonance: '防區反震', prerequisiteObject: '爐釘／受壓環', actionObject: '格擋碎光', resultObject: '反震外環', rejectedByGeometry: true },
  { classId: 'forgeguard', resonance: '封口回收', prerequisiteObject: '雙釘熔鏈', actionObject: '格擋碎光', resultObject: '中點收束', rejectedByGeometry: true },
  { classId: 'forgeguard', resonance: '楔點轉掃', prerequisiteObject: '裂盾楔點', actionObject: '格擋碎光', resultObject: '金白轉掃', rejectedByGeometry: true },
  { classId: 'forgeguard', resonance: '錨索退讓', prerequisiteObject: '爐釘火索', actionObject: '格擋碎光', resultObject: '鎖鏈退讓', rejectedByGeometry: true },
  { classId: 'shadowline-hunter', resonance: '線路收割', prerequisiteObject: '影線／殘切', actionObject: '端點回身', resultObject: '回收切線', rejectedByGeometry: true },
  { classId: 'shadowline-hunter', resonance: '折返處刑', prerequisiteObject: '雙線／標定', actionObject: '折返端落點', resultObject: '狹窄回斬', rejectedByGeometry: true },
  { classId: 'shadowline-hunter', resonance: '吊點脫身', prerequisiteObject: '危險吊點', actionObject: '預兆端落點', resultObject: '回走落刃', rejectedByGeometry: true },
  { classId: 'shadowline-hunter', resonance: '交線換身', prerequisiteObject: '換位殘切／第二線', actionObject: '跨線借位', resultObject: '端點光橋', rejectedByGeometry: true },
]
