/**
 * 鍵位設定：純資料 + 純函式。這個檔案完全不碰 DOM——不掛
 * `addEventListener`、不讀 platform-sdk。副作用（監聽鍵盤/滑鼠、保存設定）
 * 分別在 `controller.ts` 與 `settings-storage.ts`。
 *
 * 讀取 `content/bindings.json` 的方式沿用 `src/core/content.ts` 的既有慣例：
 * 缺欄位在載入當下就丟例外，不靜默回退成猜測值。
 */
import bindingsJson from '../../content/bindings.json'

export type ActionId =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'attack'
  | 'dodge'
  | 'skillQ'
  | 'skillE'

export const ACTION_IDS: readonly ActionId[] = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'attack',
  'dodge',
  'skillQ',
  'skillE',
]

function isActionId(value: string): value is ActionId {
  return (ACTION_IDS as readonly string[]).includes(value)
}

export type ActionBindingConfig = {
  readonly id: ActionId
  /** 可重綁的預設鍵（`default_codes[0]`）。 */
  readonly defaultCode: string
  /**
   * 方向鍵固定備援（僅移動動作有）。永遠額外生效、不可重綁移除，
   * 對應 bindings.json 的 `secondary_fixed`。
   */
  readonly secondaryFixed: string | null
}

export type BindingsConfig = {
  readonly judgementProperty: 'code'
  readonly actions: readonly ActionBindingConfig[]
  readonly nonBindableCodes: readonly string[]
  readonly pointerCodes: readonly string[]
}

type RawAction = {
  id: string
  default_codes: string[]
  rebindable: boolean
  secondary_fixed?: string
}

type RawBindings = {
  judgement_property: string
  actions: RawAction[]
  non_bindable_codes: string[]
  pointer_codes: string[]
}

const raw = bindingsJson as RawBindings

if (raw.judgement_property !== 'code') {
  throw new Error(
    `content/bindings.json 的 judgement_property 必須是 "code"（支援輸入法），收到 "${raw.judgement_property}"`,
  )
}

function toActionBindingConfig(action: RawAction): ActionBindingConfig {
  if (!isActionId(action.id)) {
    throw new Error(`content/bindings.json 出現本輸入層不認識的 action id：${action.id}`)
  }
  if (!action.rebindable) {
    throw new Error(
      `本輸入層假設 content/bindings.json 所有動作皆可重綁；action ${action.id} 的 rebindable 為 false，` +
        '這是新規則，需要工程師先確認處理方式，不能默默忽略。',
    )
  }
  const defaultCode = action.default_codes[0]
  if (defaultCode === undefined) {
    throw new Error(`content/bindings.json 的 action ${action.id} 缺少 default_codes`)
  }
  return {
    id: action.id,
    defaultCode,
    secondaryFixed: action.secondary_fixed ?? null,
  }
}

export const BINDINGS_CONFIG: BindingsConfig = {
  judgementProperty: 'code',
  actions: raw.actions.map(toActionBindingConfig),
  nonBindableCodes: raw.non_bindable_codes,
  pointerCodes: raw.pointer_codes,
}

for (const id of ACTION_IDS) {
  if (!BINDINGS_CONFIG.actions.some((action) => action.id === id)) {
    throw new Error(`content/bindings.json 缺少必要動作 ${id}`)
  }
}

// ---------------------------------------------------------------------------
// 綁定狀態：actionId -> 目前的可重綁主鍵（null 代表玩家手動取消綁定）。
// 方向鍵固定備援不存在這裡——它不是「可變狀態」，永遠從 BindingsConfig 取得。
// ---------------------------------------------------------------------------

export type BindingsState = Readonly<Record<ActionId, string | null>>

export function defaultBindingsState(config: BindingsConfig): BindingsState {
  const state = {} as Record<ActionId, string | null>
  for (const action of config.actions) {
    state[action.id] = action.defaultCode
  }
  return state as BindingsState
}

function fixedSecondaryCodes(config: BindingsConfig): ReadonlySet<string> {
  const set = new Set<string>()
  for (const action of config.actions) {
    if (action.secondaryFixed !== null) set.add(action.secondaryFixed)
  }
  return set
}

export function isBindable(code: string, config: BindingsConfig): boolean {
  return !config.nonBindableCodes.includes(code)
}

/**
 * 方向鍵固定備援（ArrowUp/Down/Left/Right）永遠保留給對應的移動動作，任何動作
 * （包含它自己的 primary 欄位）都不可以把這幾個鍵指派給別的動作——規格用語是
 * 「不可被重綁移除」，這裡把它實作成「整條規則都不給碰」，比允許某些例外更單純、
 * 也更難不小心破壞這條規格。
 */
export function isReservedSecondaryCode(code: string, config: BindingsConfig): boolean {
  return fixedSecondaryCodes(config).has(code)
}

export type RebindOutcome =
  | { readonly status: 'rejected'; readonly reason: 'non-bindable' | 'reserved-secondary' }
  | { readonly status: 'conflict'; readonly conflictingActionIds: readonly ActionId[] }
  | { readonly status: 'applied'; readonly bindings: BindingsState }

/**
 * 純函式：提出一次重綁請求，不做任何猜測式的自動解衝——遇到另一個動作已經佔用
 * 同一個鍵時一律回傳 `'conflict'`，交由呼叫端（UI）明確要求 `resolveConflict` 的
 * swap/override/cancel 之一，滿足 bindings.json 的 `silent_rebind_allowed: false`。
 */
export function proposeRebind(
  bindings: BindingsState,
  actionId: ActionId,
  code: string,
  config: BindingsConfig,
): RebindOutcome {
  if (!isBindable(code, config)) {
    return { status: 'rejected', reason: 'non-bindable' }
  }
  if (isReservedSecondaryCode(code, config)) {
    return { status: 'rejected', reason: 'reserved-secondary' }
  }

  const conflictingActionIds = ACTION_IDS.filter(
    (id) => id !== actionId && bindings[id] === code,
  )

  if (conflictingActionIds.length > 0) {
    return { status: 'conflict', conflictingActionIds }
  }

  return { status: 'applied', bindings: { ...bindings, [actionId]: code } }
}

/**
 * 純函式：衝突的明確處置。
 * - `swap`：`actionId` 與衝突動作互換彼此目前的鍵。
 * - `override`：`actionId` 取得該鍵；原本持有該鍵的動作變成未綁定（`null`），
 *   等玩家自己重新指派——不會有兩個動作同時佔用一個鍵的狀態。
 * - `cancel`：完全不變動，回傳原本的 `bindings`。
 *
 * 只應該在先呼叫 `proposeRebind` 得到 `'conflict'` 之後才呼叫本函式；
 * 沒有辦法在不知道衝突對象的情況下呼叫這個函式來「靜默」套用一個衝突鍵。
 */
export function resolveConflict(
  bindings: BindingsState,
  actionId: ActionId,
  code: string,
  conflictingActionIds: readonly ActionId[],
  resolution: 'swap' | 'override' | 'cancel',
): BindingsState {
  if (resolution === 'cancel') return bindings

  if (resolution === 'override') {
    const next = { ...bindings, [actionId]: code }
    for (const id of conflictingActionIds) next[id] = null
    return next
  }

  // swap：任一鍵在 bindings 裡最多對應一個動作（proposeRebind 的不變量），
  // 所以 conflictingActionIds 長度恆為 1；仍防禦性地只處理第一個。
  const previousCode = bindings[actionId]
  const next = { ...bindings, [actionId]: code }
  const [conflictingId] = conflictingActionIds
  if (conflictingId !== undefined) next[conflictingId] = previousCode
  return next
}
