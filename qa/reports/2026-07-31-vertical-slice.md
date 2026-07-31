# 《餘燼決鬥場》Vertical Slice QA 稽核

- 日期：2026-07-31
- 稽核 commit：`b98eef5 feat(render): 接上渲染層與遊戲迴圈，Vertical Slice 可玩`
- 稽核範圍：standalone、輸入／存檔紅線、`game.json`、console 風險、60fps／bundle 預算、音訊
- 結論：**暫不放行出貨；Gate 3 真人試玩前至少須補音訊，並完成真實瀏覽器驗收。**
- 稽核限制：本次執行環境沒有可連接的瀏覽器，故不能以 DevTools 實測 console、幀率、輸入與 standalone 儲存。此限制不以「應該可行」代替驗證，相關項目明列為缺口。

## 驗證摘要

| 項目 | 結果 | 證據 |
|---|---|---|
| `pnpm verify` | 通過 | lint、core/app typecheck、30 個測試檔／213 項測試、Vite build 全綠 |
| 決定性重播 | 通過 | 同 seed＋輸入序列逐 tick 相同；不同 seed 反向驗證也通過 |
| core 隔離 | 通過 | ESLint、獨立 `tsconfig.core.json`、靜態掃描未發現 DOM／render／visual／platform-sdk 依賴 |
| 禁 `Math.random()` | 通過 | ESLint 與靜態掃描未發現違規 |
| 禁遊戲直接存取 storage | 通過 | 遊戲只呼叫 `sdk.storage.get/set`；未發現直接 `localStorage`／`sessionStorage`／`indexedDB` |
| 輸入紅線 | 通過（單元層） | `KeyboardEvent.code`、IME、滑鼠左鍵、blur、hidden、pointercancel、重綁與衝突測試通過 |
| `game.json` | 通過 | slug／title／tagline／version／entry 完整，根 repo schema 檢查 18 個檔案通過 |
| standalone HTTP | 部分通過 | `pnpm dev --host 127.0.0.1` 啟動，`GET /` 與 `/src/render/main.ts` 均為 200 |
| production bundle | 通過（大小） | `dist/index.html` 0.49 kB；JS 62.07 kB raw／24.61 kB gzip |
| 60fps | 未驗證 | 尚無數值預算與瀏覽器 trace；不能由固定步進測試推論 render 達 60fps |
| console | 未驗證 | 無瀏覽器 DevTools；另有未接線的崩潰 dump 與未處理 storage rejection 風險 |
| 音訊 | 失敗 | 無音訊實作、事件表、音量控制或可播放資產；音訊規格仍是待辦模板 |

## 阻斷出貨

### B-01：Vertical Slice 完全沒有音訊層

- 依據：`agents/qa/AGENT.md`「稽核音訊啟動、音量控制、資產授權、預兆延遲與靜音可玩性」；工作室設計 §8「使用者互動後啟動、事件 cue 延遲、音量分組、靜音可玩性、素材授權與署名」。
- 現況：
  - `design/audio-guide.md` 明記「待 Audio Director」且只有待填清單。
  - `src/audio/` 只有 README。
  - `public/assets/audio/` 只有空白署名表。
  - 程式內無 `AudioContext`、音訊播放、音量／靜音控制或事件 cue 映射。
- 影響：攻擊、命中、閃避、格擋、技能、敵人預兆與選印記均無聽覺回饋；也無法稽核首次互動解鎖、cue 延遲、混音、靜音等強制項目。
- 重現：
  1. 在遊戲 repo 執行 `rg -n "AudioContext|createOscillator|\\.play\\(|volume|mute" src public content`。
  2. 結果無音訊實作命中。
  3. 開啟 `design/audio-guide.md`，可見狀態仍為待建立。
- 修正驗收：完成事件映射、互動後啟動、音樂／效果／UI 分組、總靜音、靜音仍可讀的視覺提示，以及逐資產授權；再由 QA 以瀏覽器實測。

### B-02：standalone、console 與 60fps 缺少真實瀏覽器驗收證據

- 依據：`agents/qa/AGENT.md`「standalone 模式可執行、無 console 錯誤、60fps」；工作室設計 §8「渲染層靠 QA 目視＋效能預算」及 platform-sdk 契約測試要求。
- 現況：HTTP 與 build 成功只能證明資源可提供，不能證明 top-level `connect()`、Canvas、SDK standalone storage、鍵鼠事件與 rAF 在瀏覽器內實際運作。本環境嘗試連接測試瀏覽器時回報 `No browser is available`。
- 影響：下列出貨條件目前均為「未驗證」而非通過：
  - standalone 首畫面與整局流程；
  - 重綁後重新整理可還原；
  - runtime console 無 error／unhandled rejection；
  - 1280×720 場景在目標裝置維持 60fps。
- 重現：
  1. 執行 `pnpm dev --host 127.0.0.1`。
  2. `curl -fsS http://127.0.0.1:<port>/` 會得到 200，但此步驟不會執行 JS。
  3. 目前 repo 沒有瀏覽器 E2E／performance smoke 可補足上述證據。
- 修正驗收：在可用瀏覽器環境跑一輪遭遇1→選印記→遭遇2→終局→R 重開；重綁並重新整理；DevTools console 0 error；以 Performance trace 記錄目標硬體的平均／P95 frame time。

### B-03：crash dump 只存在記憶體 API，runtime 崩潰時不會輸出或保存

- 依據：工作室設計 §8「遊戲 crash 時 dump `seed + 輸入序列` 到 console 與 `sdk.storage`」。
- 現況：`createGameLoop().dump()` 可產生可重播資料，測試也通過；但 `src/render/main.ts` 的 rAF／render 路徑沒有 `try/catch`、`window.onerror` 或 `unhandledrejection` 接線，也沒有把 dump 寫入 console 或 `sdk.storage`。
- 影響：真實渲染／輸入錯誤發生時，迴圈停止後 QA 仍拿不到規範要求的重現素材。
- 重現：
  1. 執行 `rg -n "dump\\(|console\\.|sdk\\.storage|window\\.onerror|unhandledrejection" src/render`。
  2. 只會找到 `GameLoop.dump()` 的定義，不會找到 runtime 錯誤處理與保存呼叫。
- 修正驗收：在 frame／全域錯誤邊界故意丟錯，確認 console 與 SDK storage 均收到含 seed、輸入序列及 schema 版本的 dump，且保存失敗不遮蔽原始錯誤。

## 應修但不阻斷

### S-01：重綁保存採 fire-and-forget，SDK 寫入失敗會形成未處理 rejection

- 依據：QA「無 console 錯誤」；一般 runtime 錯誤可診斷性。
- 現況：`rebind-panel.ts` 的 `commit()` 使用 `void saveBindings(sdk, bindings)`，沒有 `await` 或 `.catch()`。
- 影響：平台逾時、quota 或 storage 拒絕時，畫面先顯示已套用，但重新整理後遺失，console 可能出現 unhandled promise rejection。
- 重現：
  1. 以 `storage.set()` 固定 reject 的 fake SDK 掛載重綁面板。
  2. 完成任一重綁。
  3. 觀察未處理 rejection，且 UI 無保存失敗提示。
- 修正驗收：保存錯誤被捕捉並提示；console 無 unhandled rejection；明確定義要回滾或保留本局綁定。

### S-02：允許綁定 Mouse2，但正常遊戲未抑制右鍵選單

- 依據：使用者要求可自訂鍵位；`content/bindings.json` 宣告 Mouse0–Mouse4 皆可綁。
- 現況：`contextmenu.preventDefault()` 只在「正在擷取新鍵」時執行。重綁完成後以 Mouse2 攻擊／閃避，瀏覽器仍會顯示右鍵選單。
- 影響：合法鍵位在實戰時會被瀏覽器 UI 打斷。
- 重現：
  1. 設定中把攻擊改為滑鼠右鍵（Mouse2）。
  2. 關閉設定後在戰場按右鍵。
  3. 瀏覽器 context menu 會開啟。
- 修正驗收：僅當 Mouse2 為現行遊戲綁定且焦點在遊戲場時阻止 context menu；設定與其他頁面區域仍保留正常右鍵行為。

### S-03：60fps 沒有可執行的數值預算，且每個 rAF 都重建繪圖陣列

- 依據：QA「檢查效能預算（60fps、bundle 上限）」；工作室「可執行規範優於文字規範」。
- 現況：
  - `frame()` 每次呼叫 `buildWorldCommands()`、`buildJudgmentEffects()`、`buildHudViewModel()`，會配置多個陣列／物件並逐幀更新 DOM。
  - 沒有平均 frame time、P95 frame time、長任務或 allocation 上限；也沒有 bundle 上限檢查，只有本次人工量測。
- 影響：目前 24.61 kB gzip 很小，但無法以現有測試判定 60fps 是否達標，也無法阻止後續回歸。
- 重現：
  1. 執行 `pnpm build`，只會輸出 bundle 大小，不會做門檻斷言。
  2. 搜尋 package scripts，沒有 performance／bundle-budget 任務。
- 修正驗收：定義目標裝置與至少 P95 ≤16.7ms（或工作室核定值）的場景；加入 bundle gzip 上限；以瀏覽器 trace 建立基線。

## 建議

### R-01：補遊戲層 platform-sdk 契約 smoke

- 依據：工作室設計 §8「每款遊戲須通過 handshake、Storage 命名空間隔離、standalone fallback 契約測試」。
- 現況：SDK 套件本身有契約測試，但此遊戲 `pnpm verify` 只用 fake storage 驗證 `loadBindings/saveBindings`，未執行真實 `connect()` 的 standalone／embedded 路徑。
- 重現：
  1. 執行 `pnpm verify`。
  2. 30 個測試檔中沒有 browser／platform-sdk contract 整合測試。
- 建議驗收：沿用共用契約 fixture，在遊戲 CI 至少跑 standalone prefix、embedded handshake 與失敗不降級三案。

### R-02：將 bundle 大小門檻自動化

- 本次產物：JS 62,072 bytes raw／24.61 kB gzip，沒有大小疑慮。
- 建議：由工作室核定門檻後在 `pnpm verify` 中斷言，避免未來加入美術與音訊後無聲成長。

## 放行條件

1. B-01 音訊完成並通過互動解鎖、混音、靜音可玩性與授權稽核。
2. B-02 在可用瀏覽器完成 standalone／console／完整流程／60fps 實測。
3. B-03 runtime crash dump 真正寫入 console 與 SDK storage。
4. S-01／S-02 至少在 Gate 4 前修正；S-03 建立可重跑基線。
