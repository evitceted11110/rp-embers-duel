# 《餘燼決鬥場》PL-01 standalone／平台 iframe 驗收

## 2026-08-04 PL-01-01 修正複驗（Platform Engineer hand-off）

- 稽核角色：QA（唯讀；未修改遊戲／平台程式，未 commit、push 或 deploy）
- 結論：**PL-01-01 靜態／自動契約通過；PL-01-02 真實瀏覽器仍未驗證，故 PL-01 與 Gate 3 維持不放行。**

### 實際執行

| 項目 | 結果 | 證據與界線 |
|---|---|---|
| focus hand-off 定向契約 | 通過 | `pnpm vitest run tools/test/platform-focus.test.ts tools/test/static-game-handshake.test.ts tools/test/platform-host.test.ts packages/platform-sdk/test/contract.test.ts`：**4 files / 20 tests** 通過。純 helper 只在 armed 且 handshake 成功時呼叫 `focus({ preventScroll: true })`；null／未 armed 不呼叫。 |
| focus 一次性與取消條件 | 通過（靜態／契約） | `openLauncher` 只在使用者啟動／重試設 `focusArmedRef.current = true`；handshake 成功後先消費為 false。`pointerdown`、任意 `keydown`（Escape 再關閉）、`blur`、`visibilitychange`、iframe `focus`／`pointerdown` 均取消待定 focus；static handshake test 有 exact source assertion。 |
| platform checks | 通過 | `pnpm check:platform`：3 款靜態遊戲發布、registry／static check、platform lint（既有 `<img>` LCP warning，0 error）、platform rendered HTML **4/4**。修正後另跑 `npm --prefix platform run lint && npm --prefix platform test`，同樣 0 error、4/4。 |
| 遊戲唯一驗證入口 | 通過 | `games/embers-duel` 執行 `pnpm verify`：lint、typecheck、Vitest **52 files / 403 tests**、production build；JavaScript gzip **55,955 / 65,536 bytes**。 |
| standalone／iframe 實機 handshake、storage namespace、1280×720 無捲軸、reload console 0 error、實際輸入 | **未驗證** | 本環境沒有可用 Chromium／browser binding；不以 mock、HTTP、無頭測試或靜態 CSS 冒充真實瀏覽器證據。 |

### PL-01-01 放行界線

PL-01-01 的首次 iframe focus 已有可重播的純函式與靜態 source 契約，且具 `preventScroll: true`、使用者啟動 armed、handshake success、一次性消費與 pointer／keyboard／close（含 Escape）取消證據。這只解除原先「focus 未實作」的工程阻斷，**不等同**瀏覽器焦點真的進入 iframe。

PL-01-02 仍待可用的可見 Chromium：以同一 production build 實際開啟 standalone 與平台 launcher，記錄首次載入／reload 的 console 與 network，驗證 iframe handshake／slug namespace、首次鍵盤輸入焦點、1280×720 無滾軸。完成前不放行 PL-01、Gate 3 或公開發佈。

- 日期：2026-08-04
- 稽核角色：QA（唯讀；未修改遊戲／平台程式，未 commit、push 或 deploy）
- 結論：**不通過；Gate 3 前平台放行維持關閉。** 靜態發布、SDK 契約、storage namespace 與可重播 crash dump 的自動證據均通過；但平台啟動器缺少首次 iframe focus 的實作，另因本環境沒有可用 Chromium，無法取得 standalone／iframe 的實機 handshake、reload console 與 1280×720 無捲軸證據。

## 實際執行

| 項目 | 結果 | 證據與界線 |
|---|---|---|
| 遊戲唯一驗證入口 | 通過 | `pnpm verify`（遊戲 repo）：lint、兩組 typecheck、Vitest **52 files / 403 tests**、production build 均通過；bundle gzip **55,955 / 65,536 bytes**。 |
| 定向 replay／crash dump／輸入／SDK storage | 通過 | `pnpm vitest run src/core/crash-dump.test.ts src/input/controller.test.ts src/input/settings-storage.test.ts src/render/runtime-safety.test.ts`：**4 files / 50 tests** 通過。包含 class／legacy crash-dump round-trip、iframe blur／hidden／pointercancel held-state 清除、鍵位以 `sdk.storage` 保存，以及 runtime crash 同時 console＋SDK storage 的失敗處理。 |
| SDK 與 platform host 契約 | 通過（模擬環境） | 根目錄執行 `pnpm vitest run packages/platform-sdk/test/contract.test.ts tools/test/platform-host.test.ts tools/test/static-game-handshake.test.ts`：**3 files / 17 tests** 通過。SDK 驗 standalone slug namespace、embedded handshake、指定 parent/origin、timeout 不靜默降級；host 驗 slug 隔離與 protocol v1。現有 `static-game-handshake` 的遊戲清單未含 `embers-duel`，故本項對本遊戲的 entry 另以原始碼與建置產物人工核對。 |
| production standalone 靜態入口 | 通過（HTTP／檔案層） | `pnpm exec vite preview --host 127.0.0.1 --port 9997` 後 `GET /` 與 `GET /assets/index-BFRaKVPR.js` 均為 200；`index.html` 指向相對 `./assets/index-BFRaKVPR.js`。這不能證明瀏覽器 console、輸入或視覺結果。 |
| platform 靜態發布與 manifest | 通過（建置／檔案層） | `pnpm check:platform` 完成 `publish:games`、registry sync、static games check、platform lint/test/build；`platform/dist/firebase/games/embers-duel/index.html` 與 bundle 存在。`game.json` 為 `slug: embers-duel`、`version: 1.0.0`、`entry: index.html`，且 platform registry 為同 slug/version、`/games/embers-duel/`。平台 lint 僅有既有 `<img>` 的 LCP warning，無 error。 |
| 遊戲 SDK 接線與 storage 紅線 | 通過（靜態） | production entry `src/render/dungeon-main.ts` 以 `connect({ gameSlug: 'embers-duel' })` 建立 SDK；settings 與 crash dump 僅使用 `sdk.storage`。對遊戲 `src/` 搜尋未發現直接 `localStorage`／`sessionStorage`／`indexedDB` 或 `Math.random()` 呼叫；`pnpm verify` lint 亦通過。 |
| embedded handshake／namespace 實機 | 未驗證 | 可驗證的是 SDK/host 契約，非實際 iframe session。本環境無可用 Chromium，因此未將 mock `postMessage` 或 HTTP 結果冒充 iframe handshake 通過。 |
| 首次 iframe focus | **失敗（靜態可證）** | `platform/app/platform-client.tsx` 建立 `iframeRef`、驗證 `contentWindow` 與 handshake，但程式內沒有 `iframeRef.current.focus()`、`onLoad` focus 或其他等價 focus 移交。故首次開啟後的鍵盤輸入焦點沒有可證明的實作。 |
| 1280×720 無捲軸、reload console 0 error、實際鍵盤／滑鼠 | 未驗證 | CSS 已使 launcher stage `overflow: hidden`、iframe `width/height: 100%`，遊戲 root 亦為 100vw/100vh；這是靜態前置，不是 1280×720 browser 實測。無 Chromium 時不能取得 scroll、console 或 reload 證據。 |

## 阻斷項與重現

1. **PL-01-01：首次 iframe focus 未實作（阻斷 Gate 3 前平台驗收）。**
   - 依據：Gate 2 QA matrix 的 PL-01 要求「首次 iframe focus」。
   - 重現：`rg -n "iframeRef|focus\\(" platform/app/platform-client.tsx`。檔案只有 ref、message-source 比對與 iframe onLoad 狀態更新，沒有 focus 呼叫。
   - 修正交接：Platform Engineer 在 iframe 真的可接收輸入的載入／handshake 時點，將焦點明確交給 iframe，並補 DOM 或可見 Chromium regression；不可只把 `autoFocus` 寫在 JSX 而未驗證載入後行為。

2. **PL-01-02：雙模式瀏覽器整合證據缺失（阻斷 Gate 3 前平台驗收）。**
   - 依據：QA 規範要求 standalone 可執行、無 console error；matrix PL-01 要求 standalone／iframe handshake、storage namespace、1280×720 無捲軸與 reload console 0 error。
   - 重現：在有可見 Chromium 的環境開啟 production standalone 與平台 launcher，錄製首次載入和 reload 的 console/network，並分別讀寫 bindings／crash dump namespace；目前執行環境回覆沒有可用 browser binding，故此步無法實作。
   - 處置：環境限制不是程式 defect，但未取得實測前不得放行 PL-01 或 Gate 3。

## 非阻斷建議

- 將 `embers-duel` 納入 `tools/test/static-game-handshake.test.ts` 的遊戲清單，避免共用靜態 handshake smoke 只覆蓋前兩款遊戲而漏掉第三款入口。

## 放行結論

**不放行 PL-01、Gate 3 或公開發佈。** 先由 Platform Engineer 修復并自動測試 PL-01-01；待可見 Chromium 可用後，再以同一 production build 完成 standalone 與 iframe 的實機 smoke。此次 `check:platform` 僅生成本機靜態產物，沒有公開部署。
