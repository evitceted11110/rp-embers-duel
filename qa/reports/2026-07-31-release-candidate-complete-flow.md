# 《餘燼決鬥場》1.0.0-rc.1 完整流程 QA 報告

- 日期：2026-07-31
- 稽核範圍：六遭遇、六次 draft、十二印記、甲衛、灰燼君主三階段、三戰區場景、HUD、程序式音訊、文件與 manifest
- 結論：**自動驗證全綠；2026-08-03 已補上真實 Chromium 完整 production module／Canvas／音訊映射流程與 Web Audio runtime 排程證據，但完整人工操作、目標裝置效能 trace 與人耳盲測尚未執行，因此不宣稱 Gate 3、Gate 4 或出貨放行。**
- 工作樹狀態：依使用者要求未 commit、未 push；本報告不填寫不存在的 commit hash。

## 2026-08-03 補充證據

- 遊戲 repo 獨立 `pnpm verify`：39/39 測試檔、268/268 測試通過，production bundle 42.22 kB gzip。工作室根 repo `pnpm verify`：94/94 測試通過，schemas、submodules、packages、platform 全部通過。
- 30,000 局 sim：整體勝率 50.80%、流派差 4.95pp、Top 5 build share 54.12%、中位通關時間 15.575 分鐘；deterministic rerun 與合法生成門檻通過。
- 真實 Chromium `http://127.0.0.1:5176` 透過 Vite 載入 production source modules，以真實 `GameLoop`、`CanvasRenderingContext2D`、`paintDungeon`、`deriveAudioFrame` 和 1/60 accumulator 完成 encounter1→六次 draft→encounter6→draft→boss→victory。共 20,204 frames、337 秒模擬時間、約 8,296 ms wall-clock 執行時間；終局六印記、玩家 HP 169，涵蓋 Boss phases 1／2／3、42 種實際流程 cue，canvas 有非零像素。
- 上述是自動化完整瀏覽器 module／Canvas／音訊映射 smoke，不是人工遊玩，也不驗證真實 compositor 60fps 或音訊可聽辨性。
- 真實 Chromium `http://localhost:5173` 經 pointer gesture 後建立 `createWebAudioBackend`、resume `AudioContext`，以真實 `OscillatorNode`／`GainNode` muted 排程 `content/audio-events.json` 全 57 個 cue、設定三層 music、等待後 `dispose`，全程成功。這驗證 Web Audio graph、scheduling 與 runtime API，不是人耳盲測。
- 完整 render smoke 首輪因 5 秒預設 timeout 在約 6.27 秒超時；只把該測試 per-test timeout 調為 15,000 ms，未改斷言，約 6.85 秒重跑通過。這是測試基礎設施修正，不是產品效能回歸。
- `5176` server 關閉後的一次額外 fetch 出現 `ERR_CONNECTION_REFUSED`，符合已停止 server 的生命週期，不列為產品 runtime bug；Web Audio 已在仍存活的 `5173` server 重跑成功。

## 真實驗證摘要

| 項目 | 結果 | 實際證據 |
|---|---|---|
| `pnpm verify` | 通過 | 2026-08-03 遊戲 repo：lint、core/app typecheck、39 個測試檔／268 項測試、Vite production build 全綠；根 repo：94/94 與所有整合檢查全綠 |
| render phase 覆蓋 | 通過（單元層） | 測試逐一斷言 encounter1–6、draft 三戰區祭壇、boss、victory 的房間映射 |
| enemy kind 覆蓋 | 通過（單元層） | 四種 kind 對應四個唯一 sprite identity；甲衛為塔盾、Boss 為王冠巨斧，不落入影刺客分支 |
| Boss 攻勢 | 通過（單元層） | smash／charge／summon 分別映射圓形、長直線、雙召喚圈；各有不同 telegraph／attack cue |
| Boss 階段演出 | 通過（單元層） | `bossPhaseChanged` 轉為跨 tick VFX snapshot；phase 2／3 使用不同 cue 與全畫面文字／光束 |
| 十二印記 render | 通過（單元層） | 12 個唯一 glyph identity；12 枚均有 world／attack／dodge／skill／status 非 HUD channel |
| 六次 draft / build HUD | 通過（單元層） | HUD 直接使用 `state.draftOptions`；重建每輪三張卡；完整 `selectedMarks` 以 build chips 留存 |
| 十二印記 audio | 通過（單元層） | 12 個唯一選取 cue；改寫攻擊、閃避、Q／E 的 action cue 另行分流 |
| production bundle | 通過 | 2026-08-03：116.81 kB raw／42.22 kB gzip；自動門檻 65,536 bytes gzip |
| standalone 瀏覽器載入 | 通過（有限 smoke） | Vite `127.0.0.1:5176` 實際載入；看到 220/220、溶爐前庭、四個 action slots；長按 R 後 HP 回到 220/220 |
| 首次互動與設定 | 通過（有限 smoke） | 實際開啟設定面板，看到 music／effects／ui sliders、總靜音與八個重綁項目 |
| reload console | 通過（有限 smoke） | reload 後等待 600ms，所掛 `pageerror` 與 console error 監聽收到 0 筆 |
| 完整瀏覽器 module flow | 通過（自動整合 smoke） | 2026-08-03 在真實 Chromium 以 production modules、Canvas 2D 與音訊映射完成 20,204 frames，phase trail 抵達 victory；這不是人工操作 |
| 完整真人流程 | **未驗證** | 尚未由真人實際操作完成 encounter1→六次 draft→encounter6→Boss→勝利；不得由自動 module flow 推論手感、提示可讀性或真人操作流程 |
| 60fps | **未驗證** | 未錄製 60 秒 Performance trace；不得只由 bundle 大小或 rAF 存在推論 60fps |
| Web Audio runtime | 通過（自動整合 smoke） | pointer gesture 後以真實 AudioContext／Oscillator／Gain 排程全部 57 cue 與三層 music，再成功 dispose |
| 音訊盲測 | **未驗證** | 未由人耳盲辨四敵人、Boss 三攻勢與十二印記；真實 graph 排程不等於可聽辨性通過 |

## 阻斷出貨

### B-01：完整瀏覽器流程尚未由真人實際操作

- 依據：`agents/qa/AGENT.md` 的 standalone、console 與出貨前檢查；`SMOKE_TEST.md` 完整流程清單。
- 現況：除頁面載入、HUD、設定面板、R 重開與短時間 reload console 外，真實 Chromium 的自動 production module flow 已完成七場戰鬥階段、六次 draft、Boss 三階段與 victory；但沒有由真人實際操作完成該流程。
- 影響：自動 flow 能證明模組整合可抵達終局，不能證明場景換區、每輪選擇、全部印記觸發、Boss 三階段在真人操作下可讀、可控且手感正確。
- 重現／驗收：依 `SMOKE_TEST.md` 從遭遇 1 完成到 Boss 勝利；逐輪記錄 `draftOptions`、build chips、房名、Boss 攻勢；全程保留 DevTools console。

### B-02：60fps 尚無實機 trace

- 依據：Visual Director 完成判準 60fps；QA 效能預算。
- 現況：bundle 預算真實通過，但未錄製 frame trace。
- 影響：不能宣稱程序式場景、HUD DOM 與 Web Audio 同時運作時維持 60fps。
- 重現／驗收：目標裝置錄製至少 60 秒，涵蓋 encounter6 與 Boss summon；報告平均與 P95 frame time。

### B-03：音訊辨識仍缺真人盲測

- 依據：Audio Director 完成判準「關鍵事件可只靠聲音區分」。
- 現況：cue id、waveform、rhythm、frequency 與首拍延遲均有測試，且全 57 cue 已在真實 Chromium Web Audio graph 成功排程；沒有真人盲測證據。
- 影響：結構不同不等於人耳一定能穩定區分。
- 重現／驗收：遮住畫面，隨機播放四敵人預兆、Boss 三攻勢、三學派代表 action cue；記錄辨識率與混淆矩陣。

## 應修但不阻斷

目前沒有由本輪自動驗證、完整自動瀏覽器 module flow 或 Web Audio runtime smoke 新發現的已重現產品缺陷。這不等於真人操作流程沒有缺陷；B-01 尚未完成。

## 建議

- 在不污染 production runtime 的前提下建立受測模式，可固定跳轉 phase／mark build，讓十二印記與 Boss 三攻勢能在瀏覽器 E2E 中重跑。
- 將真人瀏覽器完整操作流程與目標裝置 Performance trace 納入後續 Gate 4 證據；在此之前版本維持 release candidate，而非正式 `1.0.0`。
