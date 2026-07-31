import { describe, expect, it } from 'vitest'
import type { PlatformSdk } from '@rogue-paradise/platform-sdk'
import { BINDINGS_CONFIG, defaultBindingsState } from './bindings.js'
import {
  BINDINGS_STORAGE_KEY,
  deserializeBindings,
  loadBindings,
  saveBindings,
  serializeBindings,
} from './settings-storage.js'

/** 最小假 storage，模擬 platform-sdk 的 Storage API 形狀（不是 localStorage）。 */
function fakeStorage(): PlatformSdk['storage'] & { readonly values: Map<string, unknown> } {
  const values = new Map<string, unknown>()
  return {
    values,
    async get<T>(key: string): Promise<T | null> {
      return values.has(key) ? (values.get(key) as T) : null
    },
    async set(key: string, value: unknown): Promise<void> {
      values.set(key, value)
    },
    async remove(key: string): Promise<void> {
      values.delete(key)
    },
  }
}

describe('serializeBindings / deserializeBindings 往返', () => {
  it('序列化再還原得到相同的鍵位', () => {
    const original = { ...defaultBindingsState(BINDINGS_CONFIG), skillQ: 'KeyF' }
    const restored = deserializeBindings(serializeBindings(original), BINDINGS_CONFIG)
    expect(restored).toEqual(original)
  })
})

describe('deserializeBindings：缺失或不合法一律退回預設鍵，逐動作降級', () => {
  it('完全沒有保存過（null）時回傳預設值', () => {
    expect(deserializeBindings(null, BINDINGS_CONFIG)).toEqual(defaultBindingsState(BINDINGS_CONFIG))
  })

  it('schemaVersion 不符時整包回退預設值', () => {
    const result = deserializeBindings({ schemaVersion: 999, primaries: { skillQ: 'KeyF' } }, BINDINGS_CONFIG)
    expect(result).toEqual(defaultBindingsState(BINDINGS_CONFIG))
  })

  it('單一動作的值型別不對時，只有那個動作退回預設，其餘保留', () => {
    const result = deserializeBindings(
      { schemaVersion: 1, primaries: { skillQ: 12345, skillE: 'KeyF' } },
      BINDINGS_CONFIG,
    )
    expect(result.skillQ).toBe('KeyQ') // 預設值
    expect(result.skillE).toBe('KeyF')
  })

  it('保存的鍵後來變成禁綁鍵時退回預設（例如未來 non_bindable_codes 擴充）', () => {
    const result = deserializeBindings(
      { schemaVersion: 1, primaries: { skillQ: 'Escape' } },
      BINDINGS_CONFIG,
    )
    expect(result.skillQ).toBe('KeyQ')
  })

  it('null 值代表玩家手動取消綁定，予以保留', () => {
    const result = deserializeBindings({ schemaVersion: 1, primaries: { skillQ: null } }, BINDINGS_CONFIG)
    expect(result.skillQ).toBeNull()
  })
})

describe('loadBindings / saveBindings：透過假 platform-sdk storage', () => {
  it('尚未保存過時載入預設鍵位', async () => {
    const sdk = { storage: fakeStorage() }
    const bindings = await loadBindings(sdk, BINDINGS_CONFIG)
    expect(bindings).toEqual(defaultBindingsState(BINDINGS_CONFIG))
  })

  it('save 之後 load 可以拿回相同的鍵位', async () => {
    const sdk = { storage: fakeStorage() }
    const custom = { ...defaultBindingsState(BINDINGS_CONFIG), dodge: 'KeyV' }
    await saveBindings(sdk, custom)
    const loaded = await loadBindings(sdk, BINDINGS_CONFIG)
    expect(loaded).toEqual(custom)
  })

  it('保存時使用固定的 storage key（不是 localStorage，走 sdk.storage）', async () => {
    const sdk = { storage: fakeStorage() }
    await saveBindings(sdk, defaultBindingsState(BINDINGS_CONFIG))
    expect(sdk.storage.values.has(BINDINGS_STORAGE_KEY)).toBe(true)
  })
})
