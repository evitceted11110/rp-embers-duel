import { runClassExpansionPrototype } from './class-expansion-prototype.js'

// 用法：pnpm exec tsx sim/class-expansion-report.ts
// 此報告不輸出勝率；數值與波次尚未在 Gate 2 規格中核准。
const summary = runClassExpansionPrototype(10_000, 'embers-class-expansion-gate2-v1')
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
