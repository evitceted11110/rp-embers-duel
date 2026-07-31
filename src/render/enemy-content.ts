/**
 * 讀取 `content/enemies.json` 取出判定層畫敵人預兆需要的秒數。
 * 與 `mark-content.ts` 同一慣例：獨立讀取 JSON，不深入 import `src/core/content.ts`。
 */
import enemiesJson from '../../content/enemies.json'
import type { EnemyKind } from '../core/index.js'

type EnemyJson = {
  readonly id: string
  readonly telegraph_ms: number
}

const enemies = enemiesJson.enemies as readonly EnemyJson[]

function findEnemy(kind: EnemyKind): EnemyJson {
  const enemy = enemies.find((candidate) => candidate.id === kind)
  if (enemy === undefined) throw new Error(`content/enemies.json 缺少敵人 ${kind}`)
  return enemy
}

/** 敵人從進入 `telegraph` 狀態到判定生效需要的秒數（`telegraph_ms` 換算）。 */
export function telegraphSeconds(kind: EnemyKind): number {
  return findEnemy(kind).telegraph_ms / 1000
}
