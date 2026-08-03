import type { Vector2 } from './vector.js'

/**
 * Core world-space walkable bounds. They map to the visible 640×360 room floor while
 * reserving enough room for the complete hero/enemy sprite around each foot point.
 * HUD is deliberately excluded: it overlays the canvas and never changes these bounds.
 */
export const ARENA_BOUNDS = {
  left: -11.2,
  right: 11.2,
  top: -5.5,
  bottom: 5,
} as const

export function clampToArena(position: Vector2, margin = 0): Vector2 {
  const safeMargin = Math.max(0, margin)
  return {
    x: Math.min(ARENA_BOUNDS.right - safeMargin, Math.max(ARENA_BOUNDS.left + safeMargin, position.x)),
    y: Math.min(ARENA_BOUNDS.bottom - safeMargin, Math.max(ARENA_BOUNDS.top + safeMargin, position.y)),
  }
}

export function isInsideArena(position: Vector2, margin = 0): boolean {
  const clamped = clampToArena(position, margin)
  return clamped.x === position.x && clamped.y === position.y
}