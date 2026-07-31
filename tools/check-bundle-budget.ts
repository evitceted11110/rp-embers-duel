import { readdir, readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { assertBundleWithinBudget, JAVASCRIPT_GZIP_BUDGET_BYTES } from './bundle-budget.js'

const assetsDirectory = new URL('../dist/assets/', import.meta.url)
const files = await readdir(assetsDirectory)
const javascriptFiles = files.filter((file) => file.endsWith('.js'))
let totalGzipBytes = 0

for (const file of javascriptFiles) {
  totalGzipBytes += gzipSync(await readFile(new URL(file, assetsDirectory))).byteLength
}

assertBundleWithinBudget(totalGzipBytes, JAVASCRIPT_GZIP_BUDGET_BYTES)
console.log(`bundle 預算通過：JavaScript gzip ${totalGzipBytes} / ${JAVASCRIPT_GZIP_BUDGET_BYTES} bytes`)
