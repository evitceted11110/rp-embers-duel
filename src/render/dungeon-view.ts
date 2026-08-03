import {
  BASE_E_HALF_ANGLE_RAD,
  BASE_E_RANGE_UNITS,
  BASE_Q_TARGET_RANGE_UNITS,
  EMBER_CORE,
  GUARD_E_RADIUS_UNITS,
  PRECISION_AFTERIMAGE,
  Q_LUNGE_DISTANCE_UNITS,
  TICK_SECONDS,
  createPlayerAttackGeometry,
  type EnemyState,
  type EnemyAttackGeometry,
  type GameState,
  type MarkId,
  type PlayerAttackGeometry,
  type RunPhase,
  type Vector2,
} from '../core/index.js'
import {
  DUNGEON_HEIGHT,
  DUNGEON_WIDTH,
  PIXEL_PALETTE,
  WORLD_PIXELS_PER_UNIT,
  drawDungeonRoom,
  drawEnemy,
  drawHero,
  drawMarkGlyph,
  worldToDungeon,
  type DungeonRoom,
  type SpritePose,
} from '../visual/dungeon-art.js'
import { telegraphSeconds } from './enemy-content.js'
import { impactVfxTier, type VfxState } from './vfx-tracker.js'

export type DungeonSceneDescription = {
  readonly room: DungeonRoom
  readonly roomName: string
  readonly objective: string
  readonly nextDoorOpen: boolean
}

export function describeDungeonScene(phase: RunPhase, aliveEnemies: number, encounterIndex = 0): DungeonSceneDescription {
  if (phase === 'encounter1') return { room: 'forge-entry', roomName: '溶爐前庭・熄火前室', objective: `擊敗焰奴 ${aliveEnemies === 0 ? '1/1' : '0/1'}`, nextDoorOpen: aliveEnemies === 0 }
  if (phase === 'encounter2') return { room: 'forge-hall', roomName: '溶爐前庭・鑄火大廳', objective: `擊敗敵人 ${3 - aliveEnemies}/3`, nextDoorOpen: aliveEnemies === 0 }
  if (phase === 'encounter3') return { room: 'shadow-gallery', roomName: '熾影迴廊・鏡影廊', objective: `清除雙影 ${2 - aliveEnemies}/2`, nextDoorOpen: aliveEnemies === 0 }
  if (phase === 'encounter4') return { room: 'shadow-vault', roomName: '熾影迴廊・甲衛庫', objective: `擊敗守軍 ${2 - aliveEnemies}/2`, nextDoorOpen: aliveEnemies === 0 }
  if (phase === 'encounter5') return { room: 'arena-approach', roomName: '決鬥場核心・王座前庭', objective: `擊敗精英 ${2 - aliveEnemies}/2`, nextDoorOpen: aliveEnemies === 0 }
  if (phase === 'encounter6') return { room: 'arena-core', roomName: '決鬥場核心・三軍試煉', objective: `擊敗三軍 ${3 - aliveEnemies}/3`, nextDoorOpen: aliveEnemies === 0 }
  if (phase === 'boss') return { room: 'boss-sanctum', roomName: '灰燼王座', objective: '擊敗灰燼君主・留意三種攻勢', nextDoorOpen: aliveEnemies === 0 }
  if (phase === 'draft') {
    const room = encounterIndex < 2 ? 'forge-altar' : encounterIndex < 4 ? 'shadow-altar' : 'arena-altar'
    const roomName = encounterIndex < 2 ? '鑄火祭壇' : encounterIndex < 4 ? '鏡影祭壇' : '王座祭壇'
    return { room, roomName, objective: `第 ${encounterIndex + 1} 次刻印・選擇合法印記`, nextDoorOpen: false }
  }
  if (phase === 'victory') return { room: 'exit', roomName: '晨光長廊', objective: '走向地城出口', nextDoorOpen: true }
  return { room: 'boss-sanctum', roomName: '灰燼王座', objective: '餘火正在熄滅', nextDoorOpen: false }
}

export function heroPose(state: GameState, vfx: VfxState): SpritePose {
  if (state.phase === 'defeat') return 'death'
  if (vfx.playerHit !== undefined && state.tick - vfx.playerHit.spawnTick <= 12) return 'hurt'
  if (state.player.dodge.active) return 'dodge'
  if (state.player.combo.hitIndex === 1 && state.player.combo.phase !== 'idle') return 'attack1'
  if (state.player.combo.hitIndex === 2 && state.player.combo.phase !== 'idle') return 'attack2'
  if (state.player.combo.hitIndex === 3 && state.player.combo.phase !== 'idle') return 'attack3'
  const moving = Math.abs(state.previousInput.moveX) + Math.abs(state.previousInput.moveY) > 0
  return moving ? 'move' : 'idle'
}

function enemyPose(enemy: EnemyState, state: GameState, vfx: VfxState): SpritePose {
  if (vfx.enemyHit?.id === enemy.id && state.tick - vfx.enemyHit.spawnTick <= 10) return 'hurt'
  if (enemy.attackState === 'telegraph') return 'telegraph'
  if (enemy.locomotion === 'dash') return 'dash'
  if (enemy.locomotion === 'strafe' || enemy.locomotion === 'retreat') return 'strafe'
  if (enemy.locomotion === 'recover') return 'recovery'
  return Math.hypot(enemy.velocity.x, enemy.velocity.y) > 0.05 ? 'move' : 'idle'
}

function line(ctx: CanvasRenderingContext2D, color: string, points: readonly (readonly [number, number])[], width = 1): void {
  const first = points[0]
  if (first === undefined) return
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(Math.round(first[0]), Math.round(first[1]))
  for (const point of points.slice(1)) ctx.lineTo(Math.round(point[0]), Math.round(point[1]))
  ctx.stroke()
}

function ring(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, radius: number, width = 2): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.arc(Math.round(x), Math.round(y), Math.round(radius), 0, Math.PI * 2)
  ctx.stroke()
}

function telegraphProgress(enemy: EnemyState): number {
  return Math.max(0, Math.min(1, 1 - enemy.timerTicks * TICK_SECONDS / telegraphSeconds(enemy.kind)))
}

export type TelegraphCue = {
  readonly progress: number
  readonly outlined: true
  readonly directional: true
  readonly finalWarning: boolean
  readonly shape: 'cone' | 'lane' | 'shield-fan' | 'boss-smash' | 'boss-charge' | 'boss-summon'
  readonly geometry: EnemyAttackGeometry | null
}

export function telegraphCue(enemy: EnemyState): TelegraphCue {
  const progress = telegraphProgress(enemy)
  const shape = enemy.kind === 'ember-thrall' ? 'cone'
    : enemy.kind === 'shade-skirmisher' ? 'lane'
      : enemy.kind === 'bulwark-sentinel' ? 'shield-fan'
        : enemy.bossAttack === 'charge' ? 'boss-charge'
          : enemy.bossAttack === 'summon' ? 'boss-summon' : 'boss-smash'
  return { progress, outlined: true, directional: true, finalWarning: progress >= 0.8, shape, geometry: enemy.telegraphGeometry }
}

export type AttackWindowCue = PlayerAttackGeometry

export function attackWindowCue(state: GameState): AttackWindowCue | null {
  const combo = state.player.combo
  if (combo.hitIndex === 0 || (combo.phase !== 'startup' && combo.phase !== 'active')) return null
  if (combo.attackGeometry !== undefined) return combo.attackGeometry
  const selectedMarks = state.selectedMarks.length > 0
    ? state.selectedMarks
    : state.selectedMark === null ? [] : [state.selectedMark]
  return createPlayerAttackGeometry({
    position: state.player.position,
    facing: state.player.facing,
    hitIndex: combo.hitIndex,
    selectedMarks,
    pursuitActive: state.player.pursuitTicksRemaining > 0,
    guardStacks: state.player.guardStacks,
  })
}

function drawSector(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: Vector2,
  radius: number,
  halfAngle: number,
  fill: string,
  stroke: string,
  lineWidth = 1,
): void {
  const angle = Math.atan2(facing.y, facing.x)
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(Math.round(x), Math.round(y))
  ctx.arc(Math.round(x), Math.round(y), Math.round(radius), angle - halfAngle, angle + halfAngle)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

function drawAttackWindow(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cue = attackWindowCue(state)
  if (cue === null) return
  const p = worldToDungeon(cue.origin)
  const colors = cue.hitIndex === 1
    ? ['rgba(230,220,196,0.12)', PIXEL_PALETTE.bone]
    : cue.hitIndex === 2
      ? ['rgba(232,93,50,0.13)', PIXEL_PALETTE.ember]
      : ['rgba(255,211,122,0.16)', PIXEL_PALETTE.flame]
  drawSector(ctx, p.x, p.y, cue.facing, cue.range * WORLD_PIXELS_PER_UNIT, cue.halfAngle, colors[0]!, colors[1]!, cue.hitIndex === 3 ? 2 : 1)
  const angle = Math.atan2(cue.facing.y, cue.facing.x)
  const endX = p.x + Math.cos(angle) * cue.range * WORLD_PIXELS_PER_UNIT
  const endY = p.y + Math.sin(angle) * cue.range * WORLD_PIXELS_PER_UNIT
  rectSpark(ctx, colors[1]!, endX, endY, cue.hitIndex === 3 ? 5 : 3)
}

function drawTelegraph(ctx: CanvasRenderingContext2D, enemy: EnemyState, tick: number): void {
  if (enemy.attackState !== 'telegraph' || enemy.hp <= 0) return
  const cue = telegraphCue(enemy)
  const geometry = cue.geometry
  if (geometry === null) return
  const progress = cue.progress
  if (geometry.kind === 'cone') {
    const origin = worldToDungeon(geometry.origin)
    const color = enemy.kind === 'bulwark-sentinel' ? PIXEL_PALETTE.guard : PIXEL_PALETTE.blood
    drawSector(ctx, origin.x, origin.y, geometry.direction, geometry.radius * WORLD_PIXELS_PER_UNIT, geometry.halfAngleRad, `rgba(232,93,50,${0.08 + progress * 0.2})`, cue.finalWarning && tick % 8 < 4 ? PIXEL_PALETTE.bone : color, cue.finalWarning ? 4 : 2)
    for (let rib = -1; rib <= 1; rib += 1) {
      const angle = Math.atan2(geometry.direction.y, geometry.direction.x) + rib * geometry.halfAngleRad
      line(ctx, color, [[origin.x, origin.y], [origin.x + Math.cos(angle) * geometry.radius * WORLD_PIXELS_PER_UNIT * progress, origin.y + Math.sin(angle) * geometry.radius * WORLD_PIXELS_PER_UNIT * progress]], 1)
    }
  } else if (geometry.kind === 'lane') {
    const origin = worldToDungeon(geometry.origin)
    const angle = Math.atan2(geometry.direction.y, geometry.direction.x)
    const laneColor = enemy.kind === 'shade-skirmisher' ? PIXEL_PALETTE.cyan : PIXEL_PALETTE.guard
    ctx.save()
    ctx.translate(origin.x, origin.y)
    ctx.rotate(angle)
    ctx.fillStyle = `rgba(116,212,207,${0.06 + progress * 0.18})`
    ctx.strokeStyle = cue.finalWarning && tick % 6 < 3 ? PIXEL_PALETTE.bone : laneColor
    ctx.lineWidth = cue.finalWarning ? 4 : 2
    const width = geometry.halfWidth * 2 * WORLD_PIXELS_PER_UNIT
    ctx.fillRect(0, -width / 2, geometry.length * WORLD_PIXELS_PER_UNIT, width)
    ctx.strokeRect(0, -width / 2, geometry.length * WORLD_PIXELS_PER_UNIT, width)
    ctx.restore()
  } else if (geometry.kind === 'circle') {
    const center = worldToDungeon(geometry.center)
    const radius = geometry.radius * WORLD_PIXELS_PER_UNIT
    ctx.fillStyle = `rgba(125,45,50,${0.1 + progress * 0.22})`
    ctx.beginPath()
    ctx.arc(Math.round(center.x), Math.round(center.y), radius, 0, Math.PI * 2)
    ctx.fill()
    ring(ctx, cue.finalWarning ? PIXEL_PALETTE.flame : PIXEL_PALETTE.blood, center.x, center.y, radius, cue.finalWarning ? 5 : 3)
    rectSpark(ctx, PIXEL_PALETTE.ember, center.x, center.y, Math.max(6, radius - 5))
  } else {
    for (const circle of geometry.circles) {
      const center = worldToDungeon(circle.center)
      ring(ctx, cue.finalWarning ? PIXEL_PALETTE.flame : PIXEL_PALETTE.ember, center.x, center.y, circle.radius * WORLD_PIXELS_PER_UNIT * (0.55 + progress * 0.45), cue.finalWarning ? 4 : 2)
    }
  }
}

function drawEnemyMotion(ctx: CanvasRenderingContext2D, enemy: EnemyState, tick: number): void {
  const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y)
  if (speed <= 0.05) return
  const p = worldToDungeon(enemy.position)
  const direction = { x: enemy.velocity.x / speed, y: enemy.velocity.y / speed }
  if (enemy.locomotion === 'dash') {
    for (let ghost = 1; ghost <= 3; ghost += 1) {
      ctx.globalAlpha = 0.35 / ghost
      const x = p.x - direction.x * ghost * 12
      const y = p.y - direction.y * ghost * 12
      drawEnemy(ctx, enemy.kind, x, y, direction, 'dash', tick - ghost * 2)
    }
    ctx.globalAlpha = 1
  }
  if ((tick + enemy.id.length) % 10 < 2) {
    ctx.fillStyle = enemy.locomotion === 'strafe' ? PIXEL_PALETTE.shadow : PIXEL_PALETTE.floorDark
    ctx.fillRect(Math.round(p.x - direction.x * 10 - direction.y * 3), Math.round(p.y - direction.y * 5), 4, 2)
    ctx.fillRect(Math.round(p.x - direction.x * 13 + direction.y * 4), Math.round(p.y - direction.y * 7), 2, 2)
  }
}

function drawEnemyDashSnapshots(ctx: CanvasRenderingContext2D, state: GameState, vfx: VfxState): void {
  for (const dash of vfx.enemyDashes ?? []) {
    const age = state.tick - dash.spawnTick
    if (age < 0 || age > 18) continue
    const from = worldToDungeon(dash.from)
    const to = worldToDungeon(dash.to)
    ctx.globalAlpha = 0.52 * (1 - age / 19)
    for (let ghost = 1; ghost <= 3; ghost += 1) {
      const t = ghost / 4
      drawEnemy(ctx, dash.kind, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, dash.direction, 'dash', state.tick - ghost * 2)
    }
    ctx.globalAlpha = 1
  }
}

function drawEnemyHealth(ctx: CanvasRenderingContext2D, enemy: EnemyState, state: GameState, vfx: VfxState): void {
  if (enemy.hp <= 0) return
  const threatened = enemy.attackState === 'telegraph' || enemy.hp < enemy.maxHp || vfx.enemyHit?.id === enemy.id
  if (!threatened) return
  const p = worldToDungeon(enemy.position)
  const width = enemy.kind === 'ashen-warlord' ? 80 : enemy.kind === 'bulwark-sentinel' ? 44 : enemy.kind === 'ember-thrall' ? 30 : 24
  ctx.fillStyle = PIXEL_PALETTE.outline
  ctx.fillRect(Math.round(p.x - width / 2 - 1), Math.round(p.y - 43), width + 2, 5)
  ctx.fillStyle = PIXEL_PALETTE.blood
  ctx.fillRect(Math.round(p.x - width / 2), Math.round(p.y - 42), Math.round(width * Math.max(0, enemy.hp / enemy.maxHp)), 3)
  if (state.tick - (vfx.enemyHit?.spawnTick ?? -1000) <= 7 && vfx.enemyHit?.id === enemy.id) {
    ctx.fillStyle = PIXEL_PALETTE.flame
    ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 47), 4, 2)
  }
}

function hasMark(state: GameState, mark: MarkId): boolean {
  return state.selectedMarks.includes(mark) || state.selectedMark === mark
}

function drawAfterimages(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!hasMark(state, 'precision-afterimage')) return
  for (const afterimage of state.player.afterimages) {
    const p = worldToDungeon(afterimage.position)
    ctx.globalAlpha = Math.max(0.18, Math.min(0.62, afterimage.ticksRemaining / 160))
    drawHero(ctx, p.x, p.y, state.player.facing, 'dodge', state.tick, 'precision-afterimage')
  }
  ctx.globalAlpha = 1
}

function drawDodgeTrail(ctx: CanvasRenderingContext2D, state: GameState, vfx: VfxState): void {
  const trail = vfx.dodgeTrail
  if (trail === null) return
  const age = state.tick - trail.spawnTick
  if (age < 0 || age > 32) return
  const start = worldToDungeon(trail.startPosition)
  const end = worldToDungeon(trail.endPosition)
  ctx.globalAlpha = 0.65 * (1 - age / 33)
  for (let ghost = 1; ghost <= 3; ghost += 1) {
    const t = ghost / 4
    let x = start.x + (end.x - start.x) * t
    let y = start.y + (end.y - start.y) * t
    if (trail.bendTarget !== null) {
      const bend = worldToDungeon(trail.bendTarget)
      const curve = Math.sin(t * Math.PI) * 0.28
      x += (bend.x - x) * curve
      y += (bend.y - y) * curve
    }
    drawHero(ctx, x, y, state.player.facing, 'dodge', state.tick - ghost * 3, state.selectedMark)
  }
  ctx.globalAlpha = 1
  if (vfx.precisionDodge !== undefined && state.tick - vfx.precisionDodge.spawnTick <= 18) {
    const p = worldToDungeon(vfx.precisionDodge.position)
    ring(ctx, PIXEL_PALETTE.cyan, p.x, p.y - 12, 15 + (state.tick - vfx.precisionDodge.spawnTick), 2)
  }
}

function drawResources(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const core of state.player.emberCores) {
    const p = worldToDungeon(core.position)
    ctx.fillStyle = PIXEL_PALETTE.outline
    ctx.fillRect(Math.round(p.x - 7), Math.round(p.y - 7), 14, 14)
    ctx.fillStyle = core.armTicksRemaining > 0 ? PIXEL_PALETTE.blood : PIXEL_PALETTE.ember
    ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 5), 10, 10)
    if (core.armTicksRemaining <= 0) {
      rectSpark(ctx, PIXEL_PALETTE.flame, p.x, p.y, 11)
      ring(ctx, PIXEL_PALETTE.ember, p.x, p.y, 10, 2)
    }
  }
  if (hasMark(state, 'twin-core-resonance') && state.player.emberCores.length === 2 && state.player.emberCores.every((core) => core.armTicksRemaining <= 0)) {
    const first = worldToDungeon(state.player.emberCores[0]!.position)
    const second = worldToDungeon(state.player.emberCores[1]!.position)
    line(ctx, PIXEL_PALETTE.flame, [[first.x, first.y], [second.x, second.y]], 3)
  }
  if (hasMark(state, 'charged-retaliation')) {
    const p = worldToDungeon(state.player.position)
    for (let stack = 0; stack < state.player.guardStacks; stack += 1) {
      const angle = (-135 + stack * 135) * Math.PI / 180
      const x = p.x + Math.cos(angle) * 19
      const y = p.y - 15 + Math.sin(angle) * 12
      ctx.fillStyle = PIXEL_PALETTE.guard
      ctx.beginPath()
      ctx.moveTo(Math.round(x), Math.round(y - 6))
      ctx.lineTo(Math.round(x + 5), Math.round(y))
      ctx.lineTo(Math.round(x), Math.round(y + 6))
      ctx.lineTo(Math.round(x - 3), Math.round(y))
      ctx.closePath()
      ctx.fill()
    }
    if (hasMark(state, 'aftershock-shield') && state.player.guardStacks >= 3) ring(ctx, PIXEL_PALETTE.flame, p.x, p.y - 13, 27, 3)
  }
  const p = worldToDungeon(state.player.position)
  if (hasMark(state, 'precision-afterimage')) for (let charge = 0; charge < state.player.afterimages.length; charge += 1) drawMarkGlyph(ctx, 'precision-afterimage', p.x - 12 + charge * 24, p.y + 14, 0.65)
  if (hasMark(state, 'pursuit-strike') && state.player.pursuitTicksRemaining > 0) {
    line(ctx, PIXEL_PALETTE.cyan, [[p.x - 22, p.y + 7], [p.x, p.y + 13], [p.x + 22, p.y + 7]], 3)
  }
  if (hasMark(state, 'phantom-reset') && state.player.dodge.wasPrecision && state.player.dodge.cooldownTicksRemaining === 0) ring(ctx, PIXEL_PALETTE.shadow, p.x, p.y - 12, 23, 2)
  if (hasMark(state, 'mirror-plating') && state.player.mirrorStanceTicksRemaining > 0) drawSector(ctx, p.x, p.y - 10, state.player.facing, 30, 0.72, 'rgba(242,223,155,0.24)', PIXEL_PALETTE.guard, 4)
  if (state.player.aftershockBonusReady) rectSpark(ctx, PIXEL_PALETTE.flame, p.x, p.y - 13, 27)
}

export type MarkVisualCue = { readonly mark: MarkId; readonly visible: boolean; readonly channel: 'world' | 'attack' | 'dodge' | 'skill' | 'status' }

export function markVisualCues(state: GameState): readonly MarkVisualCue[] {
  const marks = state.selectedMarks.length > 0 ? state.selectedMarks : state.selectedMark === null ? [] : [state.selectedMark]
  return marks.map((mark) => ({
    mark,
    visible: mark === 'ember-core' || mark === 'twin-core-resonance' || mark === 'ember-sacrifice' ? state.player.emberCores.length > 0 || mark === 'ember-sacrifice'
      : mark === 'precision-afterimage' || mark === 'shadow-harvest' ? state.player.afterimages.length > 0 || mark === 'shadow-harvest'
        : mark === 'pursuit-strike' ? state.player.pursuitTicksRemaining > 0
          : mark === 'phantom-reset' ? state.player.dodge.wasPrecision
            : mark === 'charged-retaliation' || mark === 'aftershock-shield' || mark === 'bulwark-chain' ? state.player.guardStacks > 0
              : mark === 'mirror-plating' ? state.player.mirrorStanceTicksRemaining > 0
                : state.player.combo.hitIndex > 0,
    channel: mark === 'ember-core' || mark === 'twin-core-resonance' ? 'world'
      : mark === 'cracking-flame-combo' || mark === 'pursuit-strike' || mark === 'bulwark-chain' ? 'attack'
        : mark === 'precision-afterimage' || mark === 'phantom-reset' || mark === 'charged-retaliation' || mark === 'aftershock-shield' ? 'dodge'
          : mark === 'ember-sacrifice' || mark === 'shadow-harvest' || mark === 'mirror-plating' ? 'skill' : 'status',
  }))
}

function rectSpark(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, radius: number): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x - radius), Math.round(y), 5, 2)
  ctx.fillRect(Math.round(x + radius - 5), Math.round(y), 5, 2)
  ctx.fillRect(Math.round(x), Math.round(y - radius), 2, 5)
  ctx.fillRect(Math.round(x), Math.round(y + radius - 5), 2, 5)
}

function drawAttackVfx(ctx: CanvasRenderingContext2D, state: GameState, vfx: VfxState): void {
  const attack = vfx.attack
  if (attack === undefined) return
  const age = state.tick - attack.spawnTick
  if (age < 0 || age > 12) return
  const geometry = attack.geometry
  const p = worldToDungeon(geometry.origin)
  const direction = Math.atan2(geometry.facing.y, geometry.facing.x)
  const pursuit = geometry.variant === 'pursuit'
  const bulwark = geometry.variant === 'bulwark'
  const radius = geometry.range * WORLD_PIXELS_PER_UNIT
  const halfAngle = geometry.halfAngle
  const reverse = attack.hitIndex === 2
  ctx.globalAlpha = 1 - age / 13
  const start = reverse ? direction + halfAngle : direction - halfAngle
  const end = reverse ? direction - halfAngle : direction + halfAngle
  const outerWidth = geometry.strokeHalfWidthUnits * WORLD_PIXELS_PER_UNIT * 2
  const widths = attack.hitIndex === 3 ? [outerWidth, 7, 3] : attack.hitIndex === 2 ? [outerWidth, 6, 2] : [outerWidth, 5, 2]
  const colors = pursuit ? [PIXEL_PALETTE.shadow, PIXEL_PALETTE.cyan, PIXEL_PALETTE.bone] : bulwark ? [PIXEL_PALETTE.guard, PIXEL_PALETTE.cyan, PIXEL_PALETTE.bone] : [PIXEL_PALETTE.ember, PIXEL_PALETTE.bone, PIXEL_PALETTE.flame]
  drawSector(ctx, p.x, p.y, geometry.facing, radius, halfAngle, 'rgba(255,211,122,0.035)', colors[0]!, 1)
  for (let layer = 0; layer < 3; layer += 1) {
    ctx.strokeStyle = colors[layer]!
    ctx.lineWidth = widths[layer]!
    ctx.beginPath()
    ctx.arc(Math.round(p.x), Math.round(p.y), Math.round(radius - layer * 2), start, end, reverse)
    ctx.stroke()
  }
  ctx.globalAlpha *= 0.38
  ctx.strokeStyle = PIXEL_PALETTE.ember
  ctx.lineWidth = Math.max(2, widths[0]! - 4)
  ctx.beginPath()
  ctx.arc(Math.round(p.x - geometry.facing.x * age), Math.round(p.y - geometry.facing.y * age), Math.round(radius - 6), start, end, reverse)
  ctx.stroke()
  if (attack.hit && vfx.enemyHit !== undefined) {
    const hit = worldToDungeon(vfx.enemyHit.position)
    ctx.globalAlpha = 1 - age / 13
    const impactY = hit.y - 14
    const profile = impactVfxTier(attack.hitIndex)
    const flashRadius = attack.tier === 'heavy' ? 10 : 6
    ctx.fillStyle = attack.tier === 'heavy' ? '#fff8dd' : PIXEL_PALETTE.bone
    ctx.fillRect(Math.round(hit.x - flashRadius), Math.round(impactY - 2), flashRadius * 2, 4)
    ctx.fillRect(Math.round(hit.x - 2), Math.round(impactY - flashRadius), 4, flashRadius * 2)
    ring(ctx, PIXEL_PALETTE.flame, hit.x, impactY, 5 + age * (attack.tier === 'heavy' ? 2.1 : 1.4), attack.tier === 'heavy' ? 4 : 2)
    line(ctx, PIXEL_PALETTE.bone, [[hit.x - 9 - age, impactY - 7], [hit.x + 9 + age, impactY + 7]], 3)
    line(ctx, PIXEL_PALETTE.flame, [[hit.x + 8 + age, impactY - 8], [hit.x - 8 - age, impactY + 8]], 2)
    for (let spark = 0; spark < profile.debrisCount; spark += 1) {
      const lateral = (spark - (profile.debrisCount - 1) / 2) * 3
      const forward = 7 + age + (spark % 3) * 3
      const sx = hit.x + geometry.facing.x * forward - geometry.facing.y * lateral
      const sy = impactY + geometry.facing.y * forward + geometry.facing.x * lateral
      ctx.fillStyle = spark % 2 === 0 ? PIXEL_PALETTE.flame : PIXEL_PALETTE.ember
      ctx.fillRect(Math.round(sx), Math.round(sy), spark % 3 === 0 ? 4 : 2, 2)
    }
    ctx.fillStyle = PIXEL_PALETTE.bone
    ctx.font = 'bold 10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`-${Math.round(vfx.enemyHit.damage)}`, Math.round(hit.x), Math.round(hit.y - 35 - age))
  }
  ctx.globalAlpha = 1
}

function drawSkillVfx(ctx: CanvasRenderingContext2D, state: GameState, vfx: VfxState): void {
  const skill = vfx.skill
  if (skill !== undefined) {
    const age = state.tick - skill.spawnTick
    if (age >= 0 && age <= 24) {
      const p = worldToDungeon(skill.position)
      ctx.globalAlpha = 1 - age / 25
      const color = hasMark(state, 'precision-afterimage') ? PIXEL_PALETTE.cyan : hasMark(state, 'charged-retaliation') ? PIXEL_PALETTE.guard : PIXEL_PALETTE.ember
      if (skill.key === 'q') {
        const f = skill.facing
        const range = hasMark(state, 'ember-core') ? EMBER_CORE.placeDistanceUnits : BASE_Q_TARGET_RANGE_UNITS
        const length = range * WORLD_PIXELS_PER_UNIT
        line(ctx, PIXEL_PALETTE.outline, [[p.x, p.y - 10], [p.x + f.x * length, p.y + f.y * length - 10]], 8)
        line(ctx, color, [[p.x, p.y - 10], [p.x + f.x * length, p.y + f.y * length - 10]], 4)
        if (!hasMark(state, 'ember-core')) {
          const lunge = Q_LUNGE_DISTANCE_UNITS * WORLD_PIXELS_PER_UNIT
          line(ctx, PIXEL_PALETTE.bone, [[p.x + f.x * (lunge - 5), p.y + f.y * (lunge - 5) - 10], [p.x + f.x * lunge, p.y + f.y * lunge - 10]], 6)
        }
      } else {
        if (hasMark(state, 'shadow-harvest')) {
          for (const image of state.player.afterimages) {
            const imagePoint = worldToDungeon(image.position)
            ring(ctx, PIXEL_PALETTE.cyan, imagePoint.x, imagePoint.y - 10, 8 + age, 3)
          }
        } else if (hasMark(state, 'precision-afterimage')) {
          ring(ctx, color, p.x, p.y - 8, PRECISION_AFTERIMAGE.eTeleportRadiusUnits * WORLD_PIXELS_PER_UNIT, 3)
          line(ctx, color, [[p.x - 17, p.y - 22], [p.x + 17, p.y + 5]], 3)
          line(ctx, color, [[p.x + 17, p.y - 22], [p.x - 17, p.y + 5]], 3)
        } else if (hasMark(state, 'charged-retaliation')) {
          ring(ctx, color, p.x, p.y - 8, GUARD_E_RADIUS_UNITS * WORLD_PIXELS_PER_UNIT, 4)
        } else {
          drawSector(ctx, p.x, p.y, skill.facing, BASE_E_RANGE_UNITS * WORLD_PIXELS_PER_UNIT, BASE_E_HALF_ANGLE_RAD, 'rgba(232,93,50,0.12)', color, 3)
        }
      }
      ctx.globalAlpha = 1
    }
  }
  const teleport = vfx.teleportStreak
  if (teleport !== null) {
    const age = state.tick - teleport.spawnTick
    if (age >= 0 && age <= 20) {
      const from = worldToDungeon(teleport.from)
      const to = worldToDungeon(teleport.to)
      ctx.globalAlpha = 0.75 * (1 - age / 21)
      line(ctx, PIXEL_PALETTE.outline, [[from.x, from.y - 14], [to.x, to.y - 14]], 7)
      line(ctx, PIXEL_PALETTE.cyan, [[from.x, from.y - 14], [to.x, to.y - 14]], 3)
      ctx.globalAlpha = 1
    }
  }
  const detonation = vfx.coreDetonation
  if (detonation !== undefined) {
    const age = state.tick - detonation.spawnTick
    if (age >= 0 && age <= 32) {
      const p = worldToDungeon(detonation.position)
      ctx.globalAlpha = 1 - age / 33
      ring(ctx, PIXEL_PALETTE.ember, p.x, p.y, 8 + age * 2.2, 5)
      ring(ctx, PIXEL_PALETTE.flame, p.x, p.y, 5 + age * 1.3, 2)
      ctx.globalAlpha = 1
    }
  }
  if (vfx.blocked !== undefined && state.tick - vfx.blocked.spawnTick <= 18) {
    const p = worldToDungeon(vfx.blocked.position)
    const age = state.tick - vfx.blocked.spawnTick
    rectSpark(ctx, PIXEL_PALETTE.guard, p.x, p.y - 14, 16 + age)
    ring(ctx, PIXEL_PALETTE.guard, p.x, p.y - 13, 17 + age, 2)
  }
}

function drawBossTransition(ctx: CanvasRenderingContext2D, state: GameState, vfx: VfxState): void {
  const transition = vfx.bossTransition
  if (transition === undefined) return
  const age = state.tick - transition.spawnTick
  if (age < 0 || age > 90) return
  const p = worldToDungeon(transition.position)
  const progress = age / 90
  ctx.globalAlpha = 1 - progress
  for (let ray = 0; ray < 12; ray += 1) {
    const angle = ray / 12 * Math.PI * 2 + progress
    line(ctx, transition.phase === 2 ? PIXEL_PALETTE.ember : PIXEL_PALETTE.flame, [[p.x, p.y - 30], [p.x + Math.cos(angle) * (45 + age), p.y - 30 + Math.sin(angle) * (45 + age)]], transition.phase === 3 ? 5 : 3)
  }
  ring(ctx, PIXEL_PALETTE.bone, p.x, p.y - 30, 22 + age * 1.2, 4)
  ctx.fillStyle = PIXEL_PALETTE.bone
  ctx.font = 'bold 20px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(transition.phase === 2 ? '第二階段・王火甦醒' : '第三階段・灰燼暴走', DUNGEON_WIDTH / 2, 88)
  ctx.globalAlpha = 1
}

function drawDeathSnapshots(ctx: CanvasRenderingContext2D, state: GameState, vfx: VfxState): void {
  for (const death of vfx.deaths ?? []) {
    const age = state.tick - death.spawnTick
    const p = worldToDungeon(death.position)
    ctx.globalAlpha = Math.max(0, 1 - age / 46)
    drawEnemy(ctx, death.kind, p.x, p.y, death.facing, 'death', state.tick, age / 45)
  }
  ctx.globalAlpha = 1
}

function drawMarkArrival(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.selectedMark === null || state.phase === 'draft' || state.phase === 'victory' || state.phase === 'defeat') return
  const recentSelection = state.events.some((event) => event.type === 'markSelected') || state.tick <= 90
  if (!recentSelection) return
  const p = worldToDungeon(state.player.position)
  const t = Math.min(1, state.tick / 70)
  const y = 104 + (p.y - 130) * t
  drawMarkGlyph(ctx, state.selectedMark, p.x, y, 1)
}

function drawEquippedBuild(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.selectedMarks.length === 0) return
  const p = worldToDungeon(state.player.position)
  const count = state.selectedMarks.length
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI + index / Math.max(1, count - 1) * Math.PI
    drawMarkGlyph(ctx, state.selectedMarks[index]!, p.x + Math.cos(angle) * 31, p.y + 9 + Math.sin(angle) * 9, 0.42)
  }
}

export function paintDungeon(ctx: CanvasRenderingContext2D, state: GameState, vfx: VfxState): DungeonSceneDescription {
  const aliveEnemies = state.enemies.filter((enemy) => enemy.hp > 0).length
  const scene = describeDungeonScene(state.phase, aliveEnemies, state.encounterIndex)
  drawDungeonRoom(ctx, scene.room, state.tick, scene.nextDoorOpen)

  for (const enemy of state.enemies) drawTelegraph(ctx, enemy, state.tick)
  drawAttackWindow(ctx, state)
  drawAfterimages(ctx, state)
  drawDodgeTrail(ctx, state, vfx)
  drawEnemyDashSnapshots(ctx, state, vfx)
  drawResources(ctx, state)

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue
    drawEnemyMotion(ctx, enemy, state.tick)
    const p = worldToDungeon(enemy.position)
    const hitReaction = vfx.enemyHit?.id === enemy.id ? vfx.enemyHit : undefined
    const reactionProfile = hitReaction === undefined ? undefined : impactVfxTier(hitReaction.tier === 'heavy' ? 3 : 1)
    const reactionAge = hitReaction === undefined ? Number.POSITIVE_INFINITY : state.tick - hitReaction.spawnTick
    const flash = hitReaction !== undefined && reactionAge <= reactionProfile!.flashTicks
    const moving = Math.hypot(enemy.velocity.x, enemy.velocity.y) > 0.05
    const dx = moving ? enemy.velocity.x : state.player.position.x - enemy.position.x
    const dy = moving ? enemy.velocity.y : state.player.position.y - enemy.position.y
    const length = Math.hypot(dx, dy) || 1
    if (hitReaction !== undefined && reactionAge <= reactionProfile!.flashTicks) {
      const reaction = reactionProfile!.reactionScale * (1 - reactionAge / (reactionProfile!.flashTicks + 1))
      ctx.save()
      ctx.translate(-hitReaction.facing.x * reaction * 4, -hitReaction.facing.y * reaction * 3 + reaction * 5)
      ctx.scale(1 + reaction * 0.1, 1 - reaction * 0.14)
    }
    drawEnemy(ctx, enemy.kind, p.x, p.y, { x: dx / length, y: dy / length }, enemyPose(enemy, state, vfx), state.tick, 0, flash)
    if (hitReaction !== undefined && reactionAge <= reactionProfile!.flashTicks) ctx.restore()
    drawEnemyHealth(ctx, enemy, state, vfx)
  }
  drawDeathSnapshots(ctx, state, vfx)

  const player = worldToDungeon(state.player.position)
  const playerFlash = vfx.playerHit !== undefined && state.tick - vfx.playerHit.spawnTick <= 4
  drawHero(ctx, player.x, player.y, state.player.facing, heroPose(state, vfx), state.tick, state.selectedMark, playerFlash)
  drawEquippedBuild(ctx, state)
  drawMarkArrival(ctx, state)
  drawAttackVfx(ctx, state, vfx)
  drawSkillVfx(ctx, state, vfx)
  drawBossTransition(ctx, state, vfx)

  if (vfx.playerHit !== undefined) {
    const age = state.tick - vfx.playerHit.spawnTick
    if (age >= 0 && age <= 18) {
      ctx.fillStyle = `rgba(125,45,50,${0.24 * (1 - age / 19)})`
      ctx.fillRect(0, 0, DUNGEON_WIDTH, 12)
      ctx.fillRect(0, DUNGEON_HEIGHT - 12, DUNGEON_WIDTH, 12)
      ctx.fillRect(0, 0, 12, DUNGEON_HEIGHT)
      ctx.fillRect(DUNGEON_WIDTH - 12, 0, 12, DUNGEON_HEIGHT)
    }
  }
  return scene
}
