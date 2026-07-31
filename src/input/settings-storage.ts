/**
 * 自訂鍵位的版本化保存。硬規定：一律透過 `@rogue-paradise/platform-sdk` 的
 * Storage API，禁止直接使用 `localStorage`/`sessionStorage`/`indexedDB`——
 * 平台日後接雲端存檔時，走 SDK 的遊戲不需要逐款改。
 *
 * `serializeBindings`/`deserializeBindings` 是純函式（好測試）；
 * `loadBindings`/`saveBindings` 是唯一碰 `sdk.storage` 的地方（副作用薄殼）。
 */
import type { PlatformSdk } from '@rogue-paradise/platform-sdk'
import { ACTION_IDS, defaultBindingsState, isBindable, isReservedSecondaryCode } from './bindings.js'
import type { ActionId, BindingsConfig, BindingsState } from './bindings.js'

export const BINDINGS_STORAGE_KEY = 'input-bindings'
const SCHEMA_VERSION = 1

export type StoredBindings = {
  readonly schemaVersion: number
  readonly primaries: Readonly<Record<string, string | null>>
}

export function serializeBindings(bindings: BindingsState): StoredBindings {
  return { schemaVersion: SCHEMA_VERSION, primaries: bindings }
}

function isValidStoredCode(value: unknown, config: BindingsConfig): value is string {
  return typeof value === 'string' && isBindable(value, config) && !isReservedSecondaryCode(value, config)
}

/**
 * 還原保存的鍵位。任何缺失或不合法的欄位——版本不對、整包不是物件、
 * 個別動作的值型別不對、或綁到後來變成禁綁/保留鍵——一律**逐動作**退回
 * 該動作的預設鍵，不是整包放棄。對應 bindings.json 的
 * `invalid_or_missing_falls_back_to: "default_codes"`。
 */
export function deserializeBindings(raw: unknown, config: BindingsConfig): BindingsState {
  const fallback = defaultBindingsState(config)
  if (typeof raw !== 'object' || raw === null) return fallback

  const candidate = raw as Partial<StoredBindings>
  if (candidate.schemaVersion !== SCHEMA_VERSION) return fallback
  if (typeof candidate.primaries !== 'object' || candidate.primaries === null) return fallback

  const primaries = candidate.primaries as Record<string, unknown>
  const result = { ...fallback } as Record<ActionId, string | null>
  for (const id of ACTION_IDS) {
    const value = primaries[id]
    if (value === null) {
      result[id] = null
    } else if (isValidStoredCode(value, config)) {
      result[id] = value
    }
    // 其餘情況（undefined、型別不對、非法鍵）維持 fallback 的預設值。
  }
  return result
}

export async function loadBindings(
  sdk: Pick<PlatformSdk, 'storage'>,
  config: BindingsConfig,
): Promise<BindingsState> {
  const raw = await sdk.storage.get<StoredBindings>(BINDINGS_STORAGE_KEY)
  if (raw === null) return defaultBindingsState(config)
  return deserializeBindings(raw, config)
}

export async function saveBindings(
  sdk: Pick<PlatformSdk, 'storage'>,
  bindings: BindingsState,
): Promise<void> {
  await sdk.storage.set(BINDINGS_STORAGE_KEY, serializeBindings(bindings))
}

export type SaveBindingsResult = { readonly ok: true } | { readonly ok: false; readonly error: unknown }

/**
 * UI 邊界用的安全保存：瀏覽器不能讓拒絕的 Promise 漂成 unhandled rejection。
 * 呼叫端仍取得原始錯誤，以便顯示可行動的提示。
 */
export async function saveBindingsSafely(
  sdk: Pick<PlatformSdk, 'storage'>,
  bindings: BindingsState,
): Promise<SaveBindingsResult> {
  try {
    await saveBindings(sdk, bindings)
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}
