export const JAVASCRIPT_GZIP_BUDGET_BYTES = 64 * 1024

export function assertBundleWithinBudget(gzipBytes: number, budgetBytes: number): void {
  if (!Number.isInteger(gzipBytes) || gzipBytes < 0) {
    throw new Error(`gzip bytes 必須是非負整數，收到 ${gzipBytes}`)
  }
  if (gzipBytes > budgetBytes) {
    throw new Error(`JavaScript gzip ${gzipBytes} bytes 超過 bundle 預算 ${budgetBytes} bytes`)
  }
}
