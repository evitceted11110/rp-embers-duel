import type { PlatformSdk } from '@rogue-paradise/platform-sdk'
import type { CrashDump } from '../core/index.js'

export const RUNTIME_CRASH_STORAGE_KEY = 'runtime-crash-latest'

export type ErrorLogger = {
  error(message: string, ...details: unknown[]): void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function persistRuntimeCrash(
  sdk: Pick<PlatformSdk, 'storage'>,
  dump: CrashDump,
  error: unknown,
  logger: ErrorLogger = console,
): Promise<void> {
  logger.error('餘燼決鬥場 runtime crash', error, dump)
  try {
    await sdk.storage.set(RUNTIME_CRASH_STORAGE_KEY, {
      schemaVersion: 1,
      message: errorMessage(error),
      dump,
    })
  } catch (saveError) {
    logger.error('runtime crash dump 保存失敗', saveError)
  }
}
