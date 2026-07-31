import { describe, expect, it, vi } from 'vitest'
import type { PlatformSdk } from '@rogue-paradise/platform-sdk'
import type { CrashDump } from '../core/index.js'
import { persistRuntimeCrash, RUNTIME_CRASH_STORAGE_KEY } from './runtime-safety.js'

const dump: CrashDump = { seed: 'runtime-crash-seed', inputLog: [] }

function storage(set: PlatformSdk['storage']['set']): PlatformSdk['storage'] {
  return {
    async get(): Promise<null> {
      return null
    },
    set,
    async remove(): Promise<void> {},
  }
}

describe('persistRuntimeCrash', () => {
  it('把錯誤與可重播 dump 同時送到 console 與 platform-sdk storage', async () => {
    const error = new Error('render exploded')
    const logger = { error: vi.fn() }
    const set = vi.fn<PlatformSdk['storage']['set']>().mockResolvedValue(undefined)

    await persistRuntimeCrash({ storage: storage(set) }, dump, error, logger)

    expect(logger.error).toHaveBeenCalledWith('餘燼決鬥場 runtime crash', error, dump)
    expect(set).toHaveBeenCalledWith(
      RUNTIME_CRASH_STORAGE_KEY,
      expect.objectContaining({ schemaVersion: 1, dump, message: 'render exploded' }),
    )
  })

  it('storage 保存失敗仍保留原始 crash console，並另外記錄保存失敗', async () => {
    const error = new Error('render exploded')
    const saveError = new Error('storage unavailable')
    const logger = { error: vi.fn() }

    await expect(
      persistRuntimeCrash(
        { storage: storage(async () => Promise.reject(saveError)) },
        dump,
        error,
        logger,
      ),
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenNthCalledWith(1, '餘燼決鬥場 runtime crash', error, dump)
    expect(logger.error).toHaveBeenNthCalledWith(2, 'runtime crash dump 保存失敗', saveError)
  })
})
