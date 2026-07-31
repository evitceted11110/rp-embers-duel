/**
 * 色彩系統。
 *
 * 流派色（SchoolColor）與敵人預兆色（EnemyTelegraphColor）分屬不同的型別命名空間，
 * 即使兩者底層都只是字串，TypeScript 仍會把它們視為互不相容的型別——
 * 這避免了「日後有人拿流派色當預兆色用」（design/visual-proposals.md §3 的衝突點），
 * 且是編譯期會擋下來的事，不是文件約定。
 *
 * 五個色彩值全部取自 design/visual-proposals.md §7.2 決策紀錄，不得自行更動語意。
 */

declare const schoolColorBrand: unique symbol
declare const enemyTelegraphColorBrand: unique symbol
declare const neutralColorBrand: unique symbol

/** 三條流派（裂焰／影步／守勢）專用色，只能附著在角色本體／武器上的效果使用。 */
export type SchoolColor = string & { readonly [schoolColorBrand]: true }

/** 敵人／Boss 預兆色，語意固定（見 content/enemies.json），只能用於投影在地面的硬邊幾何。 */
export type EnemyTelegraphColor = string & { readonly [enemyTelegraphColorBrand]: true }

/** 場景中性色（地面、牆體），不帶流派或敵意語意。 */
export type NeutralColor = string & { readonly [neutralColorBrand]: true }

function schoolColor(hex: string): SchoolColor {
  return hex as SchoolColor
}

function enemyTelegraphColor(hex: string): EnemyTelegraphColor {
  return hex as EnemyTelegraphColor
}

function neutralColor(hex: string): NeutralColor {
  return hex as NeutralColor
}

export const NEUTRAL_COLORS = {
  /** 黑曜岩底色，整體場景基底。 */
  obsidianFloor: neutralColor('#14110F'),
  /** 環境暗石色，地磚／牆體，與背景拉開一階明度。 */
  duskStone: neutralColor('#3A3229'),
} as const

export const SCHOOL_COLORS = {
  /** 裂焰：琥珀橙，核心武裝／扇形連擊，刻意偏離敵人警戒紅。 */
  ember: schoolColor('#FF8C3C'),
  /** 影步：藍紫，殘影／瞬移特效。 */
  shadow: schoolColor('#7C5CFF'),
  /** 守勢：鋼青藍，護環基色，刻意偏離敵人衝撞藍。 */
  guard: schoolColor('#5C8FAE'),
  /** 守勢蓄能滿層時的描邊色（金）。 */
  guardFullStackRim: schoolColor('#E8C14D'),
} as const

export const ENEMY_TELEGRAPH_COLORS = {
  /** 焰奴蓄力光暈／Boss 紅圈重擊。 */
  warningRed: enemyTelegraphColor('#E6283C'),
  /** Boss 藍線突進衝撞。 */
  chargeBlue: enemyTelegraphColor('#2E6FE6'),
  /** Boss 綠符文召喚。 */
  summonGreen: enemyTelegraphColor('#3ECB6B'),
  /** 甲衛地面扇形預警。 */
  sentinelWhite: enemyTelegraphColor('#F2EFE6'),
  /** 影刺客下蹲蓄勢殘影軌跡。 */
  assassinDark: enemyTelegraphColor('#1A1620'),
} as const

export type Hsl = {
  readonly hueDegrees: number
  readonly saturation: number
  readonly lightness: number
}

/** 把 6 碼 hex 色碼轉為 HSL（saturation/lightness 為 0–1）。純函式，方便 style-guide 規則自動檢查。 */
export function hexToHsl(hex: string): Hsl {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (match === null) throw new Error(`不是合法的 6 碼 hex 色碼: ${hex}`)
  const value = match[1] as string
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const diff = max - min
  const lightness = (max + min) / 2

  let hueDegrees = 0
  if (diff !== 0) {
    if (max === r) hueDegrees = 60 * (((g - b) / diff) % 6)
    else if (max === g) hueDegrees = 60 * ((b - r) / diff + 2)
    else hueDegrees = 60 * ((r - g) / diff + 4)
  }
  if (hueDegrees < 0) hueDegrees += 360

  const saturation = diff === 0 ? 0 : diff / (1 - Math.abs(2 * lightness - 1))

  return { hueDegrees, saturation, lightness }
}

/** 兩個色相角度之間的最短環狀距離，結果落在 [0, 180] 度。 */
export function hueDistance(aDegrees: number, bDegrees: number): number {
  const diff = Math.abs(aDegrees - bDegrees) % 360
  return diff > 180 ? 360 - diff : diff
}
