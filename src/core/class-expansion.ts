import { createRng } from '@rogue-paradise/rng'

/** Gate 2 runtime 切片的純資料卡池；不讀 sim，讓遊戲 repo 可獨立執行。 */
export type ClassId = 'forgeguard' | 'shadowline-hunter'
export type ClassSlot = 'primary' | 'q' | 'e'
export type ClassCard = Readonly<{ id: string; classId: ClassId; slot: ClassSlot; name: string; creates: string; consumes: string | null; tradeoff: string }>

const forgeguard: readonly (readonly [string, ClassSlot, string, string, string | null, string])[] = [
  ['bulwark-hammer','primary','壁壘重錘','受壓環',null,'放棄前追'], ['heated-rotation','primary','灼鐵回旋','防區旋環','防區','必須守區'], ['anchored-riposte','primary','定錨回擊','火索',null,'放棄追擊'], ['shield-wedge','primary','裂盾楔擊','裂盾點',null,'重擊不能轉身'],
  ['double-nail-seal','q','雙釘封口','熔鏈','防區','單釘範圍較小'], ['fire-hook','q','引火鉤','防區','邊緣敵人','較長冷卻'], ['ring-forged-boundary','q','環鑄界線','弧牆',null,'留下缺口'], ['reforge-relocation','q','回爐移釘','移釘軌跡','舊防區','舊安全點熄滅'],
  ['pressure-furnace-roar','e','反壓爐鳴','爐釘反震','受壓環','自身反震變窄'], ['iron-curtain-recall','e','鐵幕回收','回收敵群','受壓環','沒有受壓敵人無收益'], ['corner-pivot','e','守角轉軸','轉掃','裂盾點','延後立即解圍'], ['molten-lock-retreat','e','熔鎖退讓','鎖鏈','爐釘','取消前方反震'],
]
const hunter: readonly (readonly [string, ClassSlot, string, string, string | null, string])[] = [
  ['crossed-sheath','primary','交錯收刀','殘切','影線標記','不再直穿'], ['broken-shadow-step','primary','斷影追步','殘切','影線標記','未標記不換位'], ['stitched-corner','primary','縫影折角','折角痕','影線','無線第三段落空'], ['pinned-body-swap','primary','釘身換位','殘切','影線標記','落在敵後'],
  ['double-line-return','q','雙線折返','折返節點',null,'影線壽命短'], ['gap-marking','q','獵隙標定','亮預兆',null,'不能穿障礙'], ['loop-tether','q','環扣索','弧線',null,'只能一條線'], ['reverse-mark-anchor','q','逆標吊點','危險吊點',null,'高速敵人會帶走線端'],
  ['returning-rend','e','回身割裂','回斬','折返節點','恢復較長'], ['residual-collection','e','殘切回收','線路拉扯','殘切','無殘切較弱'], ['terminal-drop','e','斷端落刃','回走線','影線標記','放棄全程穿梭'], ['cross-line-borrow','e','跨線借位','端點配對','折返節點','單線不能施放'],
]

function materialize(classId: ClassId, rows: readonly (readonly [string, ClassSlot, string, string, string | null, string])[]): readonly ClassCard[] {
  return rows.map(([id, slot, name, creates, consumes, tradeoff]) => ({ id, classId, slot, name, creates, consumes, tradeoff }))
}
export const CLASS_CARDS: readonly ClassCard[] = [...materialize('forgeguard', forgeguard), ...materialize('shadowline-hunter', hunter)]
export const CLASS_LABELS: Readonly<Record<ClassId, string>> = { forgeguard: '熔衛｜佔點反擊', 'shadowline-hunter': '影線獵人｜高速切線' }

export function classDraftOptions(seed: string, classId: ClassId, draftIndex: number, owned: readonly string[]): readonly string[] {
  return (['primary', 'q', 'e'] as const).map((slot) => {
    const candidates = CLASS_CARDS.filter((card) => card.classId === classId && card.slot === slot && !owned.includes(card.id))
    return candidates.length === 0 ? null : createRng(seed).fork(`class-${classId}-draft-${draftIndex}-${slot}`).pick(candidates).id
  }).filter((id): id is string => id !== null)
}

export function classCard(id: string): ClassCard | undefined { return CLASS_CARDS.find((card) => card.id === id) }

export function resonanceFor(classId: ClassId, owned: readonly string[]): readonly string[] {
  const pairs: readonly (readonly [string, string, string])[] = classId === 'forgeguard'
    ? [['bulwark-hammer','pressure-furnace-roar','防區反震'], ['double-nail-seal','iron-curtain-recall','封口回收'], ['shield-wedge','corner-pivot','楔點轉掃'], ['anchored-riposte','molten-lock-retreat','錨索退讓']]
    : [['broken-shadow-step','residual-collection','線路收割'], ['double-line-return','returning-rend','折返處刑'], ['reverse-mark-anchor','terminal-drop','吊點脫身'], ['pinned-body-swap','cross-line-borrow','交線換身']]
  return pairs.filter(([a,b]) => owned.includes(a) && owned.includes(b)).map(([, , name]) => name)
}
