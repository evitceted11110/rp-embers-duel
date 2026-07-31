/** 高更新率螢幕可能在 core 尚未推進時觸發多次 rAF；同一 tick 不重建整份繪圖配置。 */
export function shouldRenderTick(lastRenderedTick: number | null, currentTick: number): boolean {
  return lastRenderedTick === null || lastRenderedTick !== currentTick
}
