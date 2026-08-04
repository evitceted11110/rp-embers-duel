# Runtime telemetry 初步對照（RT-01）

日期：2026-08-04  
執行者：Gameplay Engineer  
範圍：雙職業 runtime 的真實 core input／crash replay；不修改卡片、敵人或冷卻數值。

## 產物與用法

`src/core/runtime-telemetry.ts` 的 `collectRuntimeTelemetry(dump)` 從既有的 `CrashDump`
重播完整輸入序列，輸出純 JSON：

- run：seed、職業、最終 build、可用共鳴、總 tick／秒、勝敗、承傷與死亡；
- room：每關起訖 tick／秒、承傷、受擊、擊殺與 cleared／defeat 狀態；
- card：每張已選卡的真實槽位按鍵次數、成功／失敗輸出，以及 event 明示的直接效果與目標數；
- resonance：resolved、rejected，以及每個 rejected reason 的計數。

同槽多卡共同改寫一次操作，所以 `successfulExecutions` 是**槽位輸出**，不猜測如何將傷害
切分給卡片；只有 `directEffectResolutions` 使用帶有 `cardId` 的 runtime event。這可避免用
模型假設偽造「每卡成功率」。

在遊戲 repo 根目錄執行：

```bash
pnpm exec tsx sim/runtime-telemetry-report.ts
```

QA 或 Gate 3 可從實際 recorder 的 `dump()` 呼叫 `collectRuntimeTelemetry(dump)`，將輸出連同
crash dump 保存；重播相同 dump 必須得到位元相同的 telemetry。這份資料可再彙整到多 seed／
技巧檔，對照 BL-01 的關卡時間、承傷、死亡與共鳴分布。

## RT-01 固定輸入樣本

命令以固定 seed 各跑一段 900 tick 的真實輸入（選第一張 Draft、瞄準存活敵人、攻擊／閃避／
Q／E）。這不是 AI 模型，也不是 Gate 3 的玩家試玩；目的只是驗證 runtime 指標真的來自
core replay。

| 職業 | Seed | 時間 | 狀態 | 承傷／受擊／死亡 | 擊殺 | 已選卡 |
|---|---|---:|---|---:|---:|---|
| 熔衛 | `runtime-trace-forgeguard-0` | 9.01 s | in-progress | 20 / 2 / 0 | 8 | 定錨回擊 |
| 影線獵人 | `runtime-trace-shadowline-hunter-0` | 9.01 s | in-progress | 10 / 1 / 0 | 8 | 交錯收刀 |

兩段 trace 都留下 180 次 primary input、3 次第三段命中與 3 次第三段空揮。此數值只證明
記錄器抓到了真實操作與命中結果，**不能**與 BL-01 的 10,000 局模型通關率或 10–12 分鐘
目標直接比較，也沒有據此調整任何平衡數值。

## 自動驗收

`src/core/runtime-telemetry.test.ts` 驗證：

1. class run 的真實 recorder dump 能重播成穩定的逐房、承傷、構築與槽位資料；
2. 同一 JSON dump 重算後完全相同；
3. 1.0 dump 維持空的職業卡／共鳴資料，不把舊路徑誤判為雙職業內容。

本輪實測：52 test files／397 tests 通過（telemetry 測試的 Vitest 解析會載入全測試集）。
後續由 Balance 以有策略的完整六關 replay 樣本擴大 RT-01，再決定是否需要數值調整。
