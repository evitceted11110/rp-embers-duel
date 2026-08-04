import { runClassBalanceBaseline } from './class-expansion-balance.js'

// 用法：pnpm exec tsx sim/class-expansion-balance-report.ts
process.stdout.write(`${JSON.stringify(runClassBalanceBaseline(10_000), null, 2)}\n`)
