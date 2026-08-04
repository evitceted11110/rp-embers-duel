# PF-01 Chromium Runtime／輸入／視覺驗收

- 日期：2026-08-04
- 稽核角色：QA（唯讀）
- 對象：雙職業擴充的本機 dev (`127.0.0.1:9998`) 與 production preview (`127.0.0.1:9997`)
- 結論：**未通過／證據不足；不得據此放行 Gate 3。** 本環境沒有可控制的 Chromium 瀏覽器，故無法誠實完成真實輸入、畫面可讀性與 60 秒 compositor trace。未修改遊戲程式、未 commit／push／deploy。

## 已完成的唯讀驗證

| 項目 | 結果 | 直接證據與限制 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify` 實際完成 lint、core/app typecheck、Vitest **52 files / 398 tests**、production build；JavaScript gzip **54,254 / 65,536 bytes**。這證明靜態／無頭契約，不是瀏覽器實機。 |
| 本機 dev 啟動 | 通過 | `pnpm dev --host 127.0.0.1 --port 9998` 成功提供 HTTP。沒有瀏覽器時不可觀察 Canvas、console 或輸入。 |
| production preview 與主要資產 | 通過 | `pnpm exec vite preview --host 127.0.0.1 --port 9997`；`GET /` 回 `200`, `514` bytes，`GET /assets/index-Ca_luvt3.js` 回 `200`, `163,566` bytes。這只涵蓋首頁和單一 bundle，非 DevTools network panel。 |
| 60 秒 HTTP 可用性 | 通過（非效能證據） | preview 存活期間每秒取一次首頁，共 **57** 次 `200`、`0` 次失敗，最大觀測 HTTP 時間約 **25 ms**。這只檢查 server 可用性；不量測 rAF、frame time、long task、GPU、記憶體或遊戲狀態。 |
| 24 卡／8 共鳴的 typed 視覺契約 | 通過（先前自動證據回歸） | `pnpm verify` 內的 398 項測試含 class visual contract、renderer fixture、crash-dump/replay。它能證明資料事件與 renderer 消費契約，不能替代 24 卡與 8 共鳴的 Chromium 畫面擷取或混戰遮擋判讀。 |

## 未能執行的必要實機項目

啟動 Browser runtime 後，對 `http://127.0.0.1:9998/` 的瀏覽器選擇回覆為 **`No browser is available`**。依瀏覽器驗收規範，沒有可用 Chromium 時不得改以非瀏覽器自動化或以背景 rAF／HTTP 數字冒充實機結果。因此下列項目均是**未驗證**，不是通過也不是產品失敗：

| PF-01 必要檢查 | 狀態 | 需要的實際重現／補證據方式 |
|---|---|---|
| 熔衛、影線獵人二選一；職業 Draft；既有 1.0 Draft | 未驗證 | 在可見 Chromium 開啟 dev 或 preview，滑鼠與 Enter 分別選兩職並走至職業 Draft；另從既有 1.0 入口走 Draft。錄製每一步畫面與 console。 |
| LMB、Space、Q、E、Enter 及滑鼠輸入 | 未驗證 | 逐鍵實按，包含空施放、命中、Draft focus／Enter；確認輸入後 Canvas/HUD 對應反應，不只 dispatch synthetic event。 |
| 60 秒混戰 trace | 未驗證 | 1280×720 Chromium DevTools Performance 錄製至少 60 秒，涵蓋雙釘、雙弧線、殘切、四條共鳴、Boss；報平均與 P95 frame time、long frames／long task、console、network。 |
| 記憶體 | 未驗證 | 同一 trace 以 Memory／performance counter 可得指標記錄；若裝置不提供，明記 unavailable，不從 bundle 或 HTTP 推論。 |
| 24 卡與 8 共鳴的實畫面可讀性 | 未驗證 | 用固定 seed 逐張 Draft，於畫面截取 before／after、留下物、按鍵兌現與中央結果；在混戰確認敵方預兆未被遮擋。 |
| console／network asset failure | 未驗證 | DevTools Console／Network reload 至 idle，確認 error 為 0、資產皆成功；本次 curl 只驗首頁／主 bundle HTTP。 |
| blur、hidden、pointercancel 與重綁後 Draft 提示 | 未驗證 | 實機按住移動／攻擊後觸發各事件，再回前景；確認 held state 清除，並重綁後檢視 Draft slot hint。 |

## 分級與交接

### 阻斷 Gate 3 前驗收

1. **PF-01-01：沒有可用 Chromium，故沒有真實 60 秒 compositor 效能、輸入、console、記憶體或畫面證據。**
   - 依據：`agents/qa/AGENT.md` 的 60fps／standalone／console 要求，以及 Gate 2 matrix PF-01 的 1280×720 真實 Chromium 指定。
   - 重現：在本 QA 環境嘗試連線至本機 Vite URL；browser runtime 回覆 `No browser is available`。
   - 修正驗收：提供可用 Chromium 後，依上表在同一 build 實跑並將量測附至本報；不可用 HTTP 或無頭 fixed-step 替代。

### 應修但不阻斷

- 無新增產品缺陷。首頁與主 JS bundle 的本機 preview HTTP 可達；此結論不延伸到遊戲執行期間的 assets、console 或畫面。

### 建議

- 將 PF-01 與後續 AU-01／PL-01 放在同一可見 Chromium session 執行，可共享真實輸入、console、network 和 1280×720 screenshot 證據；仍須各自保留獨立通過條件。
