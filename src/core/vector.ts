/**
 * 世界座標向量數學。core 的座標是遊戲世界的邏輯浮點座標，不做任何像素量化——
 * 量化成 WorldCell 是渲染層 `src/visual/world-grid.ts` 的職責，core 完全不認識螢幕。
 */

export type Vector2 = {
  readonly x: number
  readonly y: number
}

export const ZERO_VECTOR: Vector2 = { x: 0, y: 0 }

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(a: Vector2, s: number): Vector2 {
  return { x: a.x * s, y: a.y * s }
}

export function length(a: Vector2): number {
  return Math.sqrt(a.x * a.x + a.y * a.y)
}

export function distance(a: Vector2, b: Vector2): number {
  return length(sub(a, b))
}

/** 零向量回傳零向量（不丟例外），呼叫端已知輸入可能是「無輸入方向」時使用。 */
export function normalize(a: Vector2): Vector2 {
  const len = length(a)
  if (len === 0) return ZERO_VECTOR
  return { x: a.x / len, y: a.y / len }
}

export function lerp(a: Vector2, b: Vector2, t: number): Vector2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * 二次貝茲曲線，t∈[0,1]，t=0 回傳 start、t=1 回傳 end。
 * 用於餘燼核心 keystone：閃避路徑朝武裝核心彎曲的弧線幾何。
 * 這是 core 自己的權威遊戲邏輯座標計算（決定玩家實際移動到哪、掃過核心與否），
 * 與 `src/visual/shapes/arc-trail.ts` 的同名曲線公式各自獨立——後者只負責畫面
 * 取樣點的視覺呈現，不是同一份權威資料，core 不 import 它（見硬規定：core 禁止
 * 依賴 render/visual）。
 */
export function quadraticBezier(start: Vector2, control: Vector2, end: Vector2, t: number): Vector2 {
  const u = 1 - t
  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
  }
}
