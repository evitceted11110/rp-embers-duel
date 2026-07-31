/**
 * 把真正的 `CanvasRenderingContext2D` 包成 `src/visual/world-layer.ts`／
 * `judgment-layer.ts` 要求的最小介面（`WorldPaintTarget`／`JudgmentPaintTarget`）。
 *
 * 這兩個介面刻意宣告 `fillStyle: string`（純字串），但真正的
 * `CanvasRenderingContext2D.fillStyle` 是 `string | CanvasGradient | CanvasPattern`——
 * 可寫入屬性在結構型別中要求雙向相容，兩個型別對不上，因此不能把 ctx 直接傳進去，
 * 需要這一層薄轉接（`src/visual/` 的模組本來就是為了「方便測試用純物件替換」才
 * 刻意不依賴 DOM 型別，見 `world-layer.ts`／`judgment-layer.ts` 頂端註解）。
 *
 * 純接線，不含邏輯，比照 `src/input/rebind-panel.ts` 的既有慣例不另外寫測試——
 * 所有可驗證的邏輯都已經在 `world-layer.test.ts`／`judgment-layer.test.ts`
 * （對應介面的行為）與本專案其餘測試（實際畫什麼）覆蓋。
 */
import type { JudgmentPaintTarget } from '../visual/judgment-layer.js'
import type { WorldPaintTarget } from '../visual/world-layer.js'

export function toWorldPaintTarget(ctx: CanvasRenderingContext2D): WorldPaintTarget {
  return {
    get fillStyle(): string {
      return typeof ctx.fillStyle === 'string' ? ctx.fillStyle : ''
    },
    set fillStyle(value: string) {
      ctx.fillStyle = value
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      ctx.fillRect(x, y, w, h)
    },
  }
}

export function toJudgmentPaintTarget(ctx: CanvasRenderingContext2D): JudgmentPaintTarget {
  return {
    get strokeStyle(): string {
      return typeof ctx.strokeStyle === 'string' ? ctx.strokeStyle : ''
    },
    set strokeStyle(value: string) {
      ctx.strokeStyle = value
    },
    get fillStyle(): string {
      return typeof ctx.fillStyle === 'string' ? ctx.fillStyle : ''
    },
    set fillStyle(value: string) {
      ctx.fillStyle = value
    },
    get globalAlpha(): number {
      return ctx.globalAlpha
    },
    set globalAlpha(value: number) {
      ctx.globalAlpha = value
    },
    get lineWidth(): number {
      return ctx.lineWidth
    },
    set lineWidth(value: number) {
      ctx.lineWidth = value
    },
    beginPath(): void {
      ctx.beginPath()
    },
    moveTo(x: number, y: number): void {
      ctx.moveTo(x, y)
    },
    lineTo(x: number, y: number): void {
      ctx.lineTo(x, y)
    },
    arc(x: number, y: number, radius: number, startAngleRad: number, endAngleRad: number): void {
      ctx.arc(x, y, radius, startAngleRad, endAngleRad)
    },
    closePath(): void {
      ctx.closePath()
    },
    stroke(): void {
      ctx.stroke()
    },
    fill(): void {
      ctx.fill()
    },
  }
}
