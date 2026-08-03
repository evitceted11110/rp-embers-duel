import { ARENA_BOUNDS, type EnemyKind, type MarkId, type Vector2 } from '../core/index.js'

export const DUNGEON_WIDTH = 640
export const DUNGEON_HEIGHT = 360
export const WORLD_PIXELS_PER_UNIT = 22
export const WORLD_ANCHOR = { x: 320, y: 212 } as const
/** Render-space walkable rectangle derived from core arena bounds; HUD does not affect it. */
export const DUNGEON_ARENA_RECT = {
  left: WORLD_ANCHOR.x + ARENA_BOUNDS.left * WORLD_PIXELS_PER_UNIT,
  right: WORLD_ANCHOR.x + ARENA_BOUNDS.right * WORLD_PIXELS_PER_UNIT,
  top: WORLD_ANCHOR.y + ARENA_BOUNDS.top * WORLD_PIXELS_PER_UNIT,
  bottom: WORLD_ANCHOR.y + ARENA_BOUNDS.bottom * WORLD_PIXELS_PER_UNIT,
} as const

export const PIXEL_PALETTE = {
  void: '#100f16', wall: '#211f2a', wallTop: '#393642', floorDark: '#45404a', floor: '#5a5150',
  edge: '#746765', outline: '#17151c', bone: '#e6dcc4', silver: '#aeb4b4', hair: '#76513b',
  ember: '#e85d32', flame: '#ffd37a', blood: '#7d2d32', coal: '#2b2528', brick: '#754139',
  shadow: '#79658e', cyan: '#74d4cf', guard: '#f2df9b', wood: '#5b392d', iron: '#302f37',
} as const

export type DungeonRoom =
  | 'forge-entry'
  | 'forge-hall'
  | 'forge-altar'
  | 'shadow-gallery'
  | 'shadow-vault'
  | 'shadow-altar'
  | 'arena-approach'
  | 'arena-core'
  | 'arena-altar'
  | 'boss-sanctum'
  | 'exit'
export type SpritePose = 'idle' | 'move' | 'strafe' | 'dash' | 'recovery' | 'attack1' | 'attack2' | 'attack3' | 'dodge' | 'hurt' | 'death' | 'telegraph'
export type CardinalDirection = 'up' | 'down' | 'left' | 'right'

export function cardinalDirection(facing: Vector2): CardinalDirection {
  if (Math.abs(facing.y) > Math.abs(facing.x)) return facing.y < 0 ? 'up' : 'down'
  return facing.x < 0 ? 'left' : 'right'
}

function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function line(ctx: CanvasRenderingContext2D, color: string, points: readonly (readonly [number, number])[], width = 1): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  const first = points[0]
  if (first === undefined) return
  ctx.moveTo(Math.round(first[0]), Math.round(first[1]))
  for (const point of points.slice(1)) ctx.lineTo(Math.round(point[0]), Math.round(point[1]))
  ctx.stroke()
}

export function worldToDungeon(position: Vector2): { readonly x: number; readonly y: number } {
  return { x: WORLD_ANCHOR.x + position.x * WORLD_PIXELS_PER_UNIT, y: WORLD_ANCHOR.y + position.y * WORLD_PIXELS_PER_UNIT }
}

function tileFloor(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  rect(ctx, PIXEL_PALETTE.floorDark, x, y, width, height)
  const tileW = 20
  const tileH = 14
  for (let row = 0; row < Math.ceil(height / tileH); row += 1) {
    for (let column = 0; column < Math.ceil(width / tileW); column += 1) {
      const tx = x + column * tileW + (row % 2) * 6
      const ty = y + row * tileH
      const hash = (column * 19 + row * 31 + column * row * 7) % 11
      rect(ctx, hash < 3 ? PIXEL_PALETTE.floorDark : PIXEL_PALETTE.floor, tx + 1, ty + 1, tileW - 2, tileH - 2)
      if (hash === 0) line(ctx, PIXEL_PALETTE.edge, [[tx + 3, ty + 3], [tx + 7, ty + 4], [tx + 9, ty + 7]])
      if (hash === 5) rect(ctx, PIXEL_PALETTE.wall, tx + 15, ty + 9, 3, 2)
      if (hash === 8) rect(ctx, PIXEL_PALETTE.edge, tx + 3, ty + 10, 5, 1)
    }
  }
}

type ZoneArt = 'forge' | 'shadow' | 'arena' | 'exit'

export function roomZone(room: DungeonRoom): ZoneArt {
  if (room.startsWith('forge')) return 'forge'
  if (room.startsWith('shadow')) return 'shadow'
  if (room.startsWith('arena') || room === 'boss-sanctum') return 'arena'
  return 'exit'
}

const ZONE_OVERLAY: Readonly<Record<ZoneArt, string>> = {
  forge: 'rgba(116,54,28,0.16)',
  shadow: 'rgba(50,39,91,0.22)',
  arena: 'rgba(104,77,25,0.16)',
  exit: 'rgba(255,232,174,0.10)',
}

function backWall(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
  rect(ctx, PIXEL_PALETTE.wall, x, y, width, 34)
  rect(ctx, PIXEL_PALETTE.wallTop, x - 4, y - 6, width + 8, 8)
  rect(ctx, PIXEL_PALETTE.edge, x, y - 6, width, 2)
  for (let bx = x + 6; bx < x + width - 8; bx += 28) {
    rect(ctx, PIXEL_PALETTE.floorDark, bx, y + 7 + ((bx / 28) % 2) * 12, 21, 9)
    rect(ctx, PIXEL_PALETTE.wallTop, bx + 1, y + 8 + ((bx / 28) % 2) * 12, 19, 1)
  }
}

function sideWalls(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  rect(ctx, PIXEL_PALETTE.wall, x, y, 16, height)
  rect(ctx, PIXEL_PALETTE.wallTop, x + 12, y, 7, height)
  rect(ctx, PIXEL_PALETTE.wall, x + width - 16, y, 16, height)
  rect(ctx, PIXEL_PALETTE.wallTop, x + width - 19, y, 7, height)
  rect(ctx, PIXEL_PALETTE.wallTop, x, y + height - 7, width, 7)
  rect(ctx, PIXEL_PALETTE.edge, x, y + height - 7, width, 2)
}

function door(ctx: CanvasRenderingContext2D, x: number, y: number, open: boolean, sealed = false): void {
  rect(ctx, PIXEL_PALETTE.wallTop, x - 8, y - 8, 56, 54)
  rect(ctx, PIXEL_PALETTE.outline, x - 3, y - 3, 46, 49)
  if (open) {
    rect(ctx, PIXEL_PALETTE.flame, x + 3, y + 2, 34, 40)
    rect(ctx, '#9a643d', x + 7, y + 4, 26, 38)
    rect(ctx, PIXEL_PALETTE.void, x + 10, y + 5, 20, 37)
  } else {
    rect(ctx, PIXEL_PALETTE.wood, x + 2, y + 2, 36, 40)
    for (let plank = 0; plank < 4; plank += 1) rect(ctx, '#704738', x + 4 + plank * 9, y + 4, 6, 36)
    rect(ctx, PIXEL_PALETTE.iron, x, y + 10, 40, 5)
    rect(ctx, PIXEL_PALETTE.iron, x, y + 29, 40, 5)
  }
  if (sealed) {
    line(ctx, PIXEL_PALETTE.blood, [[x + 4, y + 5], [x + 35, y + 38]], 3)
    line(ctx, PIXEL_PALETTE.ember, [[x + 35, y + 5], [x + 4, y + 38]], 2)
    rect(ctx, PIXEL_PALETTE.flame, x + 18, y + 19, 4, 4)
  }
}

function brazier(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, lit = true): void {
  rect(ctx, 'rgba(255,174,78,0.08)', x - 18, y - 18, 36, 31)
  rect(ctx, PIXEL_PALETTE.outline, x - 10, y, 20, 5)
  rect(ctx, PIXEL_PALETTE.iron, x - 8, y + 1, 16, 4)
  line(ctx, PIXEL_PALETTE.iron, [[x - 7, y + 4], [x - 10, y + 14]], 2)
  line(ctx, PIXEL_PALETTE.iron, [[x + 7, y + 4], [x + 10, y + 14]], 2)
  if (!lit) {
    rect(ctx, PIXEL_PALETTE.coal, x - 5, y - 3, 10, 3)
    rect(ctx, PIXEL_PALETTE.wallTop, x + 2, y - 9 - (Math.floor(tick / 20) % 2), 2, 4)
    return
  }
  const frame = Math.floor(tick / 8) % 4
  rect(ctx, PIXEL_PALETTE.ember, x - 6 + (frame === 2 ? 1 : 0), y - 10, 12, 10)
  rect(ctx, PIXEL_PALETTE.flame, x - 3 + (frame === 1 ? -1 : 0), y - 14 - (frame % 2), 6, 11)
  rect(ctx, '#fff0ad', x - 1, y - 7, 3, 6)
}

function brokenPillar(ctx: CanvasRenderingContext2D, x: number, y: number, height = 34): void {
  rect(ctx, 'rgba(10,9,13,0.35)', x - 9, y + 4, 28, 7)
  rect(ctx, PIXEL_PALETTE.wallTop, x - 10, y, 20, 6)
  rect(ctx, PIXEL_PALETTE.floorDark, x - 7, y - height, 14, height)
  rect(ctx, PIXEL_PALETTE.edge, x - 7, y - height, 4, height)
  rect(ctx, PIXEL_PALETTE.wall, x + 4, y - height + 4, 3, height - 4)
  line(ctx, PIXEL_PALETTE.outline, [[x - 7, y - height], [x - 2, y - height + 4], [x + 2, y - height - 2], [x + 7, y - height + 3]])
}

function crack(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  line(ctx, PIXEL_PALETTE.outline, [[x, y], [x + 7, y + 9], [x + 3, y + 19], [x + 14, y + 29], [x + 10, y + 45]], 2)
  line(ctx, PIXEL_PALETTE.blood, [[x + 7, y + 9], [x + 16, y + 13], [x + 21, y + 20]])
  line(ctx, PIXEL_PALETTE.outline, [[x + 3, y + 19], [x - 8, y + 25], [x - 13, y + 35]])
}

function altar(ctx: CanvasRenderingContext2D, tick: number): void {
  rect(ctx, 'rgba(10,9,13,0.4)', 269, 179, 105, 17)
  rect(ctx, PIXEL_PALETTE.wallTop, 278, 160, 84, 24)
  rect(ctx, PIXEL_PALETTE.edge, 286, 148, 68, 19)
  rect(ctx, PIXEL_PALETTE.floorDark, 296, 137, 48, 17)
  const pulse = Math.floor(tick / 14) % 2
  rect(ctx, PIXEL_PALETTE.ember, 309, 142 - pulse, 8, 7)
  rect(ctx, PIXEL_PALETTE.shadow, 319, 139 + pulse, 8, 9)
  rect(ctx, PIXEL_PALETTE.guard, 329, 142 - pulse, 8, 7)
  line(ctx, '#9b5d42', [[313, 151], [265, 242]], 2)
  line(ctx, '#655b84', [[323, 151], [320, 252]], 2)
  line(ctx, '#a9955e', [[333, 151], [375, 242]], 2)
}

function throneMosaic(ctx: CanvasRenderingContext2D): void {
  rect(ctx, PIXEL_PALETTE.wallTop, 278, 178, 84, 54)
  rect(ctx, PIXEL_PALETTE.floor, 283, 183, 74, 44)
  rect(ctx, PIXEL_PALETTE.edge, 315, 188, 10, 30)
  rect(ctx, PIXEL_PALETTE.blood, 304, 196, 9, 9)
  rect(ctx, PIXEL_PALETTE.blood, 327, 196, 9, 9)
  line(ctx, PIXEL_PALETTE.outline, [[285, 185], [304, 195], [294, 226]])
  line(ctx, PIXEL_PALETTE.outline, [[355, 185], [336, 195], [346, 226]])
}

function stairs(ctx: CanvasRenderingContext2D): void {
  for (let step = 0; step < 5; step += 1) {
    rect(ctx, PIXEL_PALETTE.wallTop, 82 + step * 5, 270 + step * 8, 92 - step * 10, 7)
    rect(ctx, PIXEL_PALETTE.wall, 82 + step * 5, 276 + step * 8, 92 - step * 10, 3)
  }
}

export function drawDungeonRoom(ctx: CanvasRenderingContext2D, room: DungeonRoom, tick: number, doorsOpen: boolean): void {
  rect(ctx, PIXEL_PALETTE.void, 0, 0, DUNGEON_WIDTH, DUNGEON_HEIGHT)
  const zone = roomZone(room)
  const wideRoom = room === 'forge-hall' || room === 'shadow-vault' || room === 'arena-core' || room === 'boss-sanctum'
  const x = wideRoom ? 34 : 54
  const y = room === 'exit' ? 38 : 48
  const width = wideRoom ? 572 : 532
  const height = room === 'exit' ? 286 : 284
  tileFloor(ctx, x, y, width, height)
  rect(ctx, ZONE_OVERLAY[zone], x, y, width, height)
  backWall(ctx, x, y, width)
  sideWalls(ctx, x, y, width, height)

  if (room === 'forge-entry' || room === 'forge-hall') {
    stairs(ctx)
    door(ctx, 494, 44, doorsOpen, !doorsOpen)
    brazier(ctx, 118, 112, tick, false)
    brazier(ctx, 514, 125, tick)
    brokenPillar(ctx, 150, 236, 24)
    brokenPillar(ctx, 500, 265, 36)
    crack(ctx, 392, 80)
    rect(ctx, PIXEL_PALETTE.wood, 213, 208, 18, 28)
    rect(ctx, PIXEL_PALETTE.edge, 209, 207, 26, 5)
    rect(ctx, PIXEL_PALETTE.wood, 216, 236, 4, 11)
    rect(ctx, PIXEL_PALETTE.wood, 226, 236, 4, 11)
    if (room === 'forge-hall') {
      brazier(ctx, 320, 92, tick)
      crack(ctx, 260, 126)
    }
  } else if (room === 'forge-altar' || room === 'shadow-altar' || room === 'arena-altar') {
    door(ctx, 70, 210, false)
    door(ctx, 514, 84, doorsOpen)
    altar(ctx, tick)
    brazier(ctx, 130, 112, tick, zone !== 'shadow')
    brazier(ctx, 508, 248, tick, zone !== 'shadow')
    brokenPillar(ctx, 178, 160, 22)
    brokenPillar(ctx, 462, 160, 22)
    if (zone === 'shadow') {
      line(ctx, PIXEL_PALETTE.cyan, [[106, 286], [222, 205], [320, 252], [438, 205], [534, 286]], 2)
    } else if (zone === 'arena') {
      for (let spike = 0; spike < 6; spike += 1) rect(ctx, PIXEL_PALETTE.guard, 220 + spike * 40, 294, 4, 13)
    }
  } else if (room === 'shadow-gallery' || room === 'shadow-vault') {
    door(ctx, 38, 214, false)
    door(ctx, 536, 48, doorsOpen, !doorsOpen)
    brazier(ctx, 108, 116, tick, false)
    brazier(ctx, 526, 116, tick, false)
    for (let column = 0; column < 5; column += 1) {
      const cx = 126 + column * 98
      line(ctx, column % 2 === 0 ? PIXEL_PALETTE.cyan : PIXEL_PALETTE.shadow, [[cx, 78], [cx + 22, 150], [cx - 18, 250]], 2)
    }
    brokenPillar(ctx, 162, 185, 40)
    brokenPillar(ctx, 476, 238, 29)
  } else if (room === 'arena-approach' || room === 'arena-core' || room === 'boss-sanctum') {
    door(ctx, 38, 214, false)
    door(ctx, 536, 48, doorsOpen, !doorsOpen)
    throneMosaic(ctx)
    brazier(ctx, 108, 116, tick)
    brazier(ctx, 526, 116, tick)
    brazier(ctx, 105, 281, tick, false)
    brazier(ctx, 531, 281, tick)
    brokenPillar(ctx, 162, 185, 40)
    brokenPillar(ctx, 476, 238, 29)
    crack(ctx, 414, 77)
    ringMosaic(ctx, 320, 220, room === 'boss-sanctum' ? 92 : 68)
    if (room === 'boss-sanctum') {
      for (let banner = 0; banner < 4; banner += 1) {
        rect(ctx, PIXEL_PALETTE.blood, 116 + banner * 136, 57, 28, 55)
        rect(ctx, PIXEL_PALETTE.flame, 128 + banner * 136, 68, 4, 26)
      }
    }
  } else {
    door(ctx, 73, 232, true)
    for (let beam = 0; beam < 5; beam += 1) rect(ctx, `rgba(255,240,190,${0.08 + beam * 0.035})`, 418 + beam * 18, 42, 25, 270)
    door(ctx, 488, 39, true)
    brazier(ctx, 138, 245, tick)
    brokenPillar(ctx, 232, 182, 46)
    rect(ctx, PIXEL_PALETTE.edge, 360, 70, 64, 3)
    rect(ctx, PIXEL_PALETTE.bone, 379, 62, 26, 4)
  }
}

function ringMosaic(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.strokeStyle = PIXEL_PALETTE.guard
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = PIXEL_PALETTE.blood
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, radius - 10, 0, Math.PI * 2)
  ctx.stroke()
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
  rect(ctx, 'rgba(9,8,12,0.45)', x - width / 2, y - 3, width, 6)
}

export function drawHero(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Vector2, pose: SpritePose, tick: number, mark: MarkId | null, flash = false): void {
  const cardinal = cardinalDirection(facing)
  const direction = cardinal === 'left' ? -1 : 1
  const moving = pose === 'move'
  const bob = pose === 'idle' ? Math.floor(tick / 18) % 2 : moving ? Math.floor(tick / 6) % 2 : 0
  const crouch = pose === 'dodge' ? 6 : pose === 'death' ? 12 : 0
  const hurtX = pose === 'hurt' ? -Math.round(facing.x * 3) : 0
  const hurtY = pose === 'hurt' ? -Math.round(facing.y * 2) : 0
  const px = Math.round(x + hurtX)
  const py = Math.round(y + bob + crouch + hurtY)
  shadow(ctx, px, y, pose === 'dodge' ? 30 : 20)
  if (pose === 'death') {
    rect(ctx, PIXEL_PALETTE.bone, px - 11, py - 8, 17, 7)
    rect(ctx, PIXEL_PALETTE.silver, px - 6, py - 13, 10, 7)
    rect(ctx, PIXEL_PALETTE.outline, px + 6, py - 2, 17, 3)
    rect(ctx, PIXEL_PALETTE.ember, px - 11, py - 5, 3, 2)
    return
  }
  const armor = flash ? '#fff8dd' : PIXEL_PALETTE.silver
  const capeX = cardinal === 'right' ? px - 10 : cardinal === 'left' ? px + 5 : px - 7
  const capeY = cardinal === 'up' ? py - 20 : py - 23
  const capeW = cardinal === 'up' || cardinal === 'down' ? 14 : 9
  const capeH = cardinal === 'up' ? 19 : cardinal === 'down' ? 16 : 21
  rect(ctx, PIXEL_PALETTE.outline, capeX - 2, capeY - 1, capeW + 3, capeH + 2)
  rect(ctx, PIXEL_PALETTE.bone, capeX, capeY, capeW, capeH)
  rect(ctx, PIXEL_PALETTE.ember, capeX + 1, capeY + capeH - 4 + (moving ? bob : 0), capeW - 3, 3)
  rect(ctx, PIXEL_PALETTE.outline, px - (cardinal === 'up' ? 8 : 7), py - 20, cardinal === 'up' ? 16 : 14, 18)
  rect(ctx, armor, px - 5, py - 18, 10, 13)
  rect(ctx, PIXEL_PALETTE.edge, px - 8, py - 19, 4, 5)
  rect(ctx, PIXEL_PALETTE.edge, px + 4, py - 19, 4, 5)
  rect(ctx, PIXEL_PALETTE.hair, cardinal === 'right' ? px - 5 : px + 1, py - 25, 4, 5)
  rect(ctx, PIXEL_PALETTE.outline, px - 7, py - 32, 14, 12)
  rect(ctx, armor, px - 5, py - 31, 10, 9)
  if (cardinal === 'up') {
    rect(ctx, PIXEL_PALETTE.outline, px - 5, py - 32, 5, 3)
    rect(ctx, PIXEL_PALETTE.hair, px - 3, py - 24, 6, 2)
  } else if (cardinal === 'down') {
    rect(ctx, PIXEL_PALETTE.void, px - 4, py - 27, 8, 3)
    rect(ctx, PIXEL_PALETTE.flame, px - 2, py - 26, 1, 1)
    rect(ctx, PIXEL_PALETTE.flame, px + 2, py - 26, 1, 1)
  } else {
    rect(ctx, PIXEL_PALETTE.outline, px + 2 * direction, py - 31, 6, 3)
    rect(ctx, PIXEL_PALETTE.void, px + (direction > 0 ? 0 : -5), py - 27, 5, 2)
    rect(ctx, PIXEL_PALETTE.flame, px + 2 * direction, py - 27, 2, 1)
  }
  const foot = moving ? (Math.floor(tick / 6) % 2) * 3 : 0
  if (cardinal === 'up' || cardinal === 'down') {
    rect(ctx, PIXEL_PALETTE.outline, px - 7 - foot, py - 5, 6, 7)
    rect(ctx, PIXEL_PALETTE.outline, px + 2 + foot, py - 5, 6, 7)
  } else {
    rect(ctx, PIXEL_PALETTE.outline, px - 6, py - 5, 5, 6 + foot)
    rect(ctx, PIXEL_PALETTE.outline, px + 2, py - 5, 5, 9 - foot)
  }

  const baseAngle = Math.atan2(facing.y, facing.x)
  const attackOffset = pose === 'attack1' ? -0.58 : pose === 'attack2' ? 0.7 : 0
  const swordAngle = baseAngle + attackOffset
  const swordLength = pose === 'attack3' ? 29 : pose.startsWith('attack') ? 23 : 18
  const handX = px + Math.cos(baseAngle + Math.PI / 2) * 5
  const handY = py - 15 + Math.sin(baseAngle + Math.PI / 2) * 4
  const tipX = handX + Math.cos(swordAngle) * swordLength
  const tipY = handY + Math.sin(swordAngle) * swordLength
  line(ctx, PIXEL_PALETTE.outline, [[handX, handY], [tipX, tipY]], pose === 'attack3' ? 6 : 5)
  line(ctx, pose.startsWith('attack') ? PIXEL_PALETTE.flame : PIXEL_PALETTE.silver, [[handX, handY], [tipX, tipY]], pose === 'attack3' ? 3 : 2)
  rect(ctx, PIXEL_PALETTE.ember, handX - 2, handY - 2, 5, 4)
  if (mark === 'ember-core') rect(ctx, PIXEL_PALETTE.ember, px - 2, py - 18, 4, 3)
  if (mark === 'precision-afterimage') rect(ctx, PIXEL_PALETTE.cyan, capeX, py - 15, 2, 5)
  if (mark === 'charged-retaliation') rect(ctx, PIXEL_PALETTE.guard, px - direction * 8, py - 18, 3, 8)
}

export function drawEnemy(ctx: CanvasRenderingContext2D, kind: EnemyKind, x: number, y: number, facing: Vector2, pose: SpritePose, tick: number, deathProgress = 0, flash = false): void {
  const identity = enemySpriteIdentity(kind)
  if (identity === 'thrall-hammer') drawThrall(ctx, x, y, facing, pose, tick, deathProgress, flash)
  else if (identity === 'shade-dual-blade') drawSkirmisher(ctx, x, y, facing, pose, tick, deathProgress, flash)
  else if (identity === 'bulwark-tower-shield') drawBulwark(ctx, x, y, facing, pose, tick, deathProgress, flash)
  else drawWarlord(ctx, x, y, facing, pose, tick, deathProgress, flash)
}

export function enemySpriteIdentity(kind: EnemyKind): 'thrall-hammer' | 'shade-dual-blade' | 'bulwark-tower-shield' | 'warlord-crown-axe' {
  if (kind === 'ember-thrall') return 'thrall-hammer'
  if (kind === 'shade-skirmisher') return 'shade-dual-blade'
  if (kind === 'bulwark-sentinel') return 'bulwark-tower-shield'
  return 'warlord-crown-axe'
}

function drawThrall(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Vector2, pose: SpritePose, tick: number, death: number, flash: boolean): void {
  const direction = cardinalDirection(facing)
  const side = direction === 'left' ? -1 : 1
  const bob = Math.floor(tick / 12) % 2
  const sink = pose === 'death' ? Math.round(death * 13) : pose === 'hurt' ? 3 : 0
  shadow(ctx, x, y, 30 - death * 10)
  const body = flash ? '#f4e6cd' : PIXEL_PALETTE.brick
  rect(ctx, PIXEL_PALETTE.outline, x - 14, y - 22 + sink, 25, 20 - sink / 2)
  rect(ctx, body, x - 11, y - 20 + sink, 20, 15)
  rect(ctx, PIXEL_PALETTE.coal, x - 12, y - 31 + bob + sink, 18, 13)
  rect(ctx, PIXEL_PALETTE.outline, x - 10, y - 33 + bob + sink, 15, 5)
  rect(ctx, PIXEL_PALETTE.ember, direction === 'up' ? x - 1 : x - 5 * side, y - 27 + bob + sink, direction === 'down' ? 7 : 3, direction === 'up' ? 3 : 7)
  rect(ctx, PIXEL_PALETTE.flame, x - side * 4, y - 25 + bob + sink, 1, 3)
  rect(ctx, PIXEL_PALETTE.wallTop, x - 17, y - 19 + sink, 8, 12)
  rect(ctx, PIXEL_PALETTE.edge, x - 19, y - 16 + sink, 5, 6)
  const raised = pose === 'telegraph' ? -16 : pose === 'attack3' ? 7 : 0
  const hammerX = direction === 'up' || direction === 'down' ? x + 8 : x + side * 9
  rect(ctx, PIXEL_PALETTE.coal, hammerX, y - 19 + sink + raised, 5, 15)
  rect(ctx, PIXEL_PALETTE.outline, hammerX - 2, y - 25 + sink + raised, 12, 9)
  rect(ctx, pose === 'telegraph' ? PIXEL_PALETTE.ember : PIXEL_PALETTE.wallTop, hammerX, y - 23 + sink + raised, 8, 6)
  rect(ctx, PIXEL_PALETTE.outline, x - 9, y - 6 + sink, 7, 8)
  rect(ctx, PIXEL_PALETTE.outline, x + 3, y - 6 + sink, 7, 8)
  if (death > 0.55) {
    rect(ctx, PIXEL_PALETTE.coal, x - 18, y - 3, 5, 4)
    rect(ctx, PIXEL_PALETTE.coal, x + 14, y - 1, 4, 3)
  }
}

function drawSkirmisher(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Vector2, pose: SpritePose, tick: number, death: number, flash: boolean): void {
  const direction = cardinalDirection(facing)
  const side = direction === 'left' ? -1 : 1
  const slide = pose === 'move' || pose === 'strafe' || pose === 'dash' ? Math.floor(tick / (pose === 'dash' ? 2 : 5)) % 2 : 0
  const crouch = pose === 'telegraph' ? 6 : Math.round(death * 12)
  shadow(ctx, x, y, 21)
  const body = flash ? '#e5e0eb' : PIXEL_PALETTE.shadow
  rect(ctx, PIXEL_PALETTE.outline, x - 7, y - 26 + crouch, 14, 24)
  rect(ctx, body, x - 5, y - 24 + crouch, 10, 20)
  rect(ctx, PIXEL_PALETTE.outline, x - 8, y - 35 + crouch, 16, 12)
  rect(ctx, '#353040', x - 6, y - 33 + crouch, 12, 9)
  rect(ctx, PIXEL_PALETTE.cyan, direction === 'up' ? x - 2 : x - 4 * side, y - 29 + crouch, direction === 'up' ? 4 : 9, 2)
  rect(ctx, PIXEL_PALETTE.shadow, x - 8, y - 5 + crouch, 3, 10 + slide)
  rect(ctx, PIXEL_PALETTE.shadow, x + 5, y - 5 + crouch, 3, 11 - slide)
  rect(ctx, PIXEL_PALETTE.outline, x - 15 * side, y - 19 + crouch, 10, 3)
  rect(ctx, PIXEL_PALETTE.silver, x - 20 * side, y - 21 + crouch, 8, 2)
  rect(ctx, PIXEL_PALETTE.outline, x + 5 * side, y - 14 + crouch, 11, 3)
  rect(ctx, PIXEL_PALETTE.silver, x + 14 * side, y - 16 + crouch, 9, 2)
  rect(ctx, PIXEL_PALETTE.shadow, x - 8, y - 4 + crouch, 3, 12)
  rect(ctx, PIXEL_PALETTE.shadow, x + 5, y - 3 + crouch, 3, 10)
  if (death > 0.55) {
    rect(ctx, PIXEL_PALETTE.shadow, x - 14, y - 10, 3, 3)
    rect(ctx, PIXEL_PALETTE.cyan, x + 11, y - 5, 2, 2)
  }
}

function drawBulwark(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Vector2, pose: SpritePose, tick: number, death: number, flash: boolean): void {
  const side = cardinalDirection(facing) === 'left' ? -1 : 1
  const brace = pose === 'telegraph' ? 5 : pose === 'recovery' ? 3 : 0
  const sink = Math.round(death * 15)
  shadow(ctx, x, y, 46)
  rect(ctx, PIXEL_PALETTE.outline, x - 18, y - 35 + sink, 36, 33)
  rect(ctx, flash ? '#fff2cd' : PIXEL_PALETTE.iron, x - 15, y - 32 + sink, 30, 28)
  rect(ctx, PIXEL_PALETTE.guard, x - 10, y - 29 + sink, 20, 5)
  rect(ctx, PIXEL_PALETTE.outline, x - 13, y - 45 + sink, 26, 14)
  rect(ctx, PIXEL_PALETTE.wallTop, x - 10, y - 42 + sink, 20, 9)
  rect(ctx, PIXEL_PALETTE.flame, x - 5 * side, y - 38 + sink, 4, 2)
  const shieldX = x + side * (pose === 'telegraph' ? 13 : 18)
  rect(ctx, PIXEL_PALETTE.outline, shieldX - 10, y - 32 + brace + sink, 20, 30)
  rect(ctx, PIXEL_PALETTE.silver, shieldX - 7, y - 29 + brace + sink, 14, 24)
  rect(ctx, PIXEL_PALETTE.blood, shieldX - 2, y - 25 + brace + sink, 4, 16)
  line(ctx, PIXEL_PALETTE.guard, [[shieldX - 6, y - 17 + brace + sink], [shieldX + 6, y - 17 + brace + sink]], 2)
  rect(ctx, PIXEL_PALETTE.outline, x - 12, y - 6 + sink, 9, 8)
  rect(ctx, PIXEL_PALETTE.outline, x + 4, y - 6 + sink, 9, 8)
  if (tick % 30 < 4 && pose !== 'death') rect(ctx, PIXEL_PALETTE.guard, shieldX - 9, y - 34 + brace, 18, 2)
}

function drawWarlord(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Vector2, pose: SpritePose, tick: number, death: number, flash: boolean): void {
  const side = cardinalDirection(facing) === 'left' ? -1 : 1
  const rise = pose === 'telegraph' ? -7 : 0
  const sink = Math.round(death * 22)
  shadow(ctx, x, y, 62)
  rect(ctx, PIXEL_PALETTE.outline, x - 24, y - 50 + sink, 48, 48)
  rect(ctx, flash ? '#fff5d8' : PIXEL_PALETTE.blood, x - 20, y - 46 + sink, 40, 40)
  rect(ctx, PIXEL_PALETTE.iron, x - 15, y - 43 + sink, 30, 34)
  rect(ctx, PIXEL_PALETTE.flame, x - 3, y - 39 + sink, 6, 24)
  rect(ctx, PIXEL_PALETTE.outline, x - 17, y - 64 + sink, 34, 18)
  rect(ctx, PIXEL_PALETTE.wallTop, x - 13, y - 60 + sink, 26, 11)
  rect(ctx, PIXEL_PALETTE.flame, x - 7, y - 56 + sink, 4, 3)
  rect(ctx, PIXEL_PALETTE.flame, x + 4, y - 56 + sink, 4, 3)
  line(ctx, PIXEL_PALETTE.guard, [[x - 13, y - 64 + sink], [x - 19, y - 73 + sink]], 4)
  line(ctx, PIXEL_PALETTE.guard, [[x + 13, y - 64 + sink], [x + 19, y - 73 + sink]], 4)
  const axeX = x + side * 24
  line(ctx, PIXEL_PALETTE.outline, [[axeX, y - 42 + rise + sink], [axeX + side * 5, y - 4 + sink]], 7)
  rect(ctx, PIXEL_PALETTE.outline, axeX - 13, y - 50 + rise + sink, 26, 13)
  rect(ctx, PIXEL_PALETTE.ember, axeX - 10, y - 47 + rise + sink, 20, 7)
  rect(ctx, PIXEL_PALETTE.outline, x - 17, y - 7 + sink, 12, 9)
  rect(ctx, PIXEL_PALETTE.outline, x + 6, y - 7 + sink, 12, 9)
  if (tick % 20 < 7 && pose !== 'death') rect(ctx, PIXEL_PALETTE.flame, x - 21, y - 48, 3, 15)
}

export function drawMarkGlyph(ctx: CanvasRenderingContext2D, mark: MarkId, x: number, y: number, scale = 1): void {
  const emberMarks: readonly MarkId[] = ['ember-core', 'cracking-flame-combo', 'twin-core-resonance', 'ember-sacrifice']
  const shadowMarks: readonly MarkId[] = ['precision-afterimage', 'pursuit-strike', 'phantom-reset', 'shadow-harvest']
  const color = emberMarks.includes(mark) ? PIXEL_PALETTE.ember : shadowMarks.includes(mark) ? PIXEL_PALETTE.cyan : PIXEL_PALETTE.guard
  const index = (emberMarks.includes(mark) ? emberMarks : shadowMarks.includes(mark) ? shadowMarks : ['charged-retaliation', 'aftershock-shield', 'mirror-plating', 'bulwark-chain'] as const).indexOf(mark as never)
  if (index === 0) {
    rect(ctx, color, x - 2 * scale, y - 8 * scale, 4 * scale, 16 * scale)
    rect(ctx, color, x - 8 * scale, y - 2 * scale, 16 * scale, 4 * scale)
  } else if (index === 1) {
    line(ctx, color, [[x - 8 * scale, y + 6 * scale], [x, y - 8 * scale], [x + 8 * scale, y + 6 * scale]], 3 * scale)
    line(ctx, color, [[x - 6 * scale, y - 4 * scale], [x + 6 * scale, y + 4 * scale]], 2 * scale)
  } else if (index === 2) {
    rect(ctx, color, x - 8 * scale, y - 5 * scale, 6 * scale, 10 * scale)
    rect(ctx, color, x + 2 * scale, y - 5 * scale, 6 * scale, 10 * scale)
    line(ctx, color, [[x - 2 * scale, y], [x + 2 * scale, y]], 2 * scale)
  } else {
    line(ctx, color, [[x, y - 9 * scale], [x - 8 * scale, y + 6 * scale], [x + 8 * scale, y + 6 * scale], [x, y - 9 * scale]], 2 * scale)
    rect(ctx, color, x - 2 * scale, y - 1 * scale, 4 * scale, 8 * scale)
  }
  rect(ctx, PIXEL_PALETTE.outline, x - scale, y - scale, 2 * scale, 2 * scale)
}

export function markGlyphIdentity(mark: MarkId): string {
  const all: readonly MarkId[] = [
    'ember-core', 'cracking-flame-combo', 'twin-core-resonance', 'ember-sacrifice',
    'precision-afterimage', 'pursuit-strike', 'phantom-reset', 'shadow-harvest',
    'charged-retaliation', 'aftershock-shield', 'mirror-plating', 'bulwark-chain',
  ]
  return `mark-glyph-${all.indexOf(mark)}`
}
