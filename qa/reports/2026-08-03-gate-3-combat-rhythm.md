# 《餘燼決鬥場》Gate 3 核心戰鬥節奏修訂 QA

## 2026-08-03 劍光／碰撞 envelope 真人回饋修訂

結論：已重現「劍光擦到 sprite 但中心點在扇形外所以 miss」的真落差，並以 TDD 改成同源 circle-vs-sector；**不代表 human Gate 3 通過**。

### 根因與結構修正

- 舊 `nearestLivingInCone()` 只接受敵人 foot-point／center；30–48px 寬的程式化 sprite 沒有 hurtbox 半徑，8–11px 可見刃帶也不在碰撞 envelope 內。
- 舊 `drawAttackVfx()` 對裂焰／追擊／鐵壁另寫 2.2／2.5／×1.3；core 對 pursuit 甚至仍用 base half-angle。命中後 pursuit tick 清零時，VFX 會重算成另一個範圍。
- 新增公開 `PlayerAttackGeometry`／factory、按 kind hurtbox 與 circle-vs-sector helper。combat、startup cue、active cue、`comboHit`／`comboWhiff`、`ComboState.attackGeometry`、`VfxState.attack.geometry` 共用同一 helper／快照。
- base physical reach 1.05／1.15／1.65 → **1.30／1.45／1.95 units**；22px/unit 下中心線 28.6／31.9／42.9px，外層刃帶邊界 32.6／36.4／48.4px。hurtbox 為焰奴 0.50、影刺客 0.42、甲衛 0.72、Boss 1.00 units。HP／damage／敵速／content 未改。

### TDD 與 Chromium Canvas smoke

- 新測試先以缺少 factory／舊 range／中心點判定／render 重算得到 **5/5 geometry failures + 6 integration failures**，再實作最小結構修正。
- 覆蓋：三段與 render cue 同 source、徑向 hurtbox overlap hit／完全外側 miss、角邊 overlap hit／完全外側 miss、Boss 大 hurtbox、三種 mark rewrite、裂焰主 sector 與 splash 分流、pursuit 消耗後 active cue／VFX 快照不變、同 seed replay、既有輕輕重窗口。
- 真實 Chromium 從 Vite 載入 production `core/index.ts`、`vfx-tracker.ts`、`dungeon-view.ts`，以真實 640×360 `CanvasRenderingContext2D` 畫出 range fixture。第一段 attack origin 0.04、physical range 1.30、stroke half-width 0.1818、焰奴 hurtbox 0.50，中心 boundary 為 **2.0218 units**：boundary−0.01 得 `comboHit`，boundary+0.01 得 `comboWhiff`；PNG data URL 長度 32,118，證明實際 Canvas 有產生畫面。另於正常頁面長按攻擊 1.8 秒，console error 0、page error 0。
- 上述是 production modules＋Canvas 的自動 fixture，不是假裝人工手感；仍需 human 重新確認三段 reach、角邊容錯與多敵群畫面讀性。

### 最終回歸

- 遊戲 `pnpm verify`：lint／core+app typecheck／**41 files、298 tests**／production build 全綠；JavaScript 120.34kB raw、**42,381／65,536 bytes gzip**。
- `pnpm sim:gate2` 30,000 runs：勝率 **50.8033%**；ember／shadow／guard 53.9079%／49.4952%／48.9598%；流派差 **4.9481pp**；最低勝局印記 18.0697%；Top-5 54.1172%；winning median 15.7083 分；illegal content 0；deterministic rerun true。既有 aftershock-shield prototype-AI 限制不變。
- 工作室根 `pnpm verify`：8 份角色規範、18 個 schema、3 個 submodule、3 個 npm package、platform build／3 tests、root **13 files／94 tests** 全綠。

## 2026-08-03 最新真人回饋回歸（輕輕重／追逃／打擊感／場界）

結論：四項退回點均以失敗先行測試重現並修復；**不代表 human Gate 3 通過**。本輪未改 `content/enemies.json` 的 HP／damage／armor，也未放寬既有產品斷言或 timeout。

### 失敗先行證據

- 本次連接窗口回歸先匯入尚不存在的公開 `COMBO_LINK_WINDOWS_S`，focused combat suite 如預期在載入期失敗；加入最小 tuple／state-machine 後，新增窗口測試通過，而兩個仍假設舊對稱 recovery 的既有測試失敗，證明測試能辨識語意變更。同步既有斷言後，combat／determinism／dungeon-view／VFX focused checks **56/56**。
- 新增回歸後先跑 5 個 targeted files：55 tests 中 **9 failed**。失敗涵蓋 arena 四路徑、玩家速度上限契約、輕輕重 timing、light/heavy recoil、VFX tier；audio cue mapping 已被既有實作滿足而直接通過。
- 修復後完整 suite 為 **40 files／287 tests 全綠**（本次新增 7 個連接窗口／邊界／buffer／release 回歸）。最終完整 render smoke 仍使用既有 15s per-test timeout，實跑 **6.63s**，未增加 timeout、未放寬產品斷言。

### 功能與數據

| 項目 | 實作／結果 |
|---|---|
| held 兩輪 | core 回歸得到 `1,2,3,1,2,3`；held 每個 connection window 都視為持續後續意圖，第三段後不要求新 edge |
| 輕／輕／重 | startup＋active 為 0.09／0.09／0.19s；active 後 connection window 為 0.10／0.20／0.20s；held 循環 0.19／0.29／0.39s，總計 **0.87s**。damage 8／10／16；最新 physical reach 1.30／1.45／1.95；lunge 0.04／0.06／0.22 |
| tick 邊界 | 100Hz 下第一／二／三窗口為 10／20／20 ticks；`phaseTicksRemaining === 1` 先取樣輸入再結算，故是最後合法 tick；下一 tick 已回 idle，再按只會起第一段 |
| recoil／reaction | core recoil 0.08／0.11／0.32 units，enemy recovery 0.03／0.04／0.09s；重擊大於輕擊且同輸入完全決定性 |
| 追逃 | 玩家 6.5 units/s；敵人 sustained caps 2.5／5.0／1.8／2.1。最快影刺客 3 秒追逐距離 **2.0000→0.0523 units**（最小 0.00033） |
| 場界 | core bounds x −11.2..11.2、y −5.5..5.0；四邊 screen foot points 分別 (73.6,212)、(566.4,212)、(320,91)、(320,322)，均在 640×360 內 |
| 長時 fuzz | 12,000 ticks × 2 deterministic rerun；每 tick 玩家與所有敵人都在 bounds，最終 history 完全一致 |
| VFX | light/heavy profile 控制接觸十字爆閃、白閃壓縮後仰、6／10 顆方向碎屑、2／3 幀 visual hit-stop、1／2px shake；core accumulator 與 input 不凍結 |
| Audio | `comboHit.hitIndex` 真實映射 `combo-hit-1/2/3`；第三段 180ms 雙脈衝、尾頻 82Hz，輕擊 75／90ms 單脈衝；cue gain 最大 0.28，沿用 effects bus 與 master limiter |

### 最終驗證

- `pnpm verify`：lint、core/app typecheck、**40 files／287 tests**、完整六遭遇＋Boss 三條首選 build、同 seed 終局 replay 全通過。
- production build：118.72 kB raw／**42.72 kB gzip**（工具精確加總 41,825／65,536 bytes），bundle budget 通過。
- `pnpm sim:gate2` 30,000 runs：win rate **50.8033%**；ember/shadow/guard **53.9079%／49.4952%／48.9598%**；spread **4.9481pp**；最低勝局印記納入 **18.0697%**；Top-5 build share **54.1172%**；winning median **15.7083 min**；illegal content 0；determinism rerun true。既有 aftershock-shield prototype-AI trigger-health 限制不變。

### Chromium smoke 與誠實限制

- 真實 Chromium 頁面載入成功，HUD／Canvas 正常。以 Vite 載入遊戲實際 production source modules（不是測試替身），建立真實 `CanvasRenderingContext2D`，逐 tick 執行 `tick()`、`updateVfxState()`、`paintDungeon()`；held 六次命中為 1→2→3→1→2→3，四邊 180 ticks 撞界後仍可見。
- smoke 監聽期間 console error **0**、page error **0**。
- 整合瀏覽器 rAF 明確受節流：4.830s 只得到 5 frames，間隔 1000.1／1016.0／1000.8／1015.7ms。因此本輪沒有把自動瀏覽器 rAF 當 compositor 效能證據，而依需求改用上述真實 Chromium source modules＋Canvas deterministic smoke。目標裝置 60 秒 Performance trace 仍由 human 驗收。

- 日期：2026-08-03
- 觸發回饋：敵人接近後站定、攻擊提示與實際判定不一致、三段攻擊與交戰等待過慢
- 範圍：敵人移動／分離、預兆幾何、普攻時序與 held input、敵人動作表演、render-only hit-stop／shake
- 結論：**自動驗證、30,000 局平衡回歸、真實 Chromium 內完整 production source module／Canvas／音訊映射流程，以及 57 個 cue 的真實 Web Audio graph 排程均通過。這些是自動整合 smoke，不是人工試玩、目標裝置 compositor 效能 trace 或人耳盲測；核心修訂仍須真人重新試玩，不宣稱 Gate 3 或 Gate 4 放行。**
- 工作樹狀態：依使用者要求未 commit、未 push；本報告不填寫不存在的 commit hash。

## 修訂驗收

| 要求 | 結果 | 實際證據 |
|---|---|---|
| 四種 archetype 不能永久站定 | 通過（core） | 100Hz deterministic 測試逐一跑 3 秒；焰奴、影刺客、甲衛、Boss 都多次改變位置，且四條軌跡不相同 |
| 敵人不能重疊成同一點 | 通過（core） | 同座標雙敵人以 stable id 打破對稱，套用 deterministic separation；未使用 `Math.random()` |
| 預兆開始後鎖定方向／落點／範圍 | 通過（core） | `EnemyState.telegraphGeometry` 在玩家移動後保持不變；cone、lane、circle、summon circles 由公開 geometry factory 建立 |
| 離開提示安全，留在提示內命中 | 通過（core） | 同一份 locked geometry 分別驗證移出不扣血、保持在內扣血 |
| render 與 core 共用幾何 | 通過（單元層） | `telegraphCue()` 回傳的 geometry 與 `EnemyState.telegraphGeometry` 為同一 reference；繪製函式不再接收目前玩家位置 |
| 三段攻擊約 0.75–0.9s | 通過（core） | startup 0.05／0.05／0.11s，active 0.04／0.04／0.08s，active 後連接窗口 0.10／0.20／0.20s；held 三段共 0.87s |
| active 起點結算傷害 | 通過（core） | startup 最後一 tick 仍無傷害；進入 active 的 tick 立即命中 |
| held 左鍵可靠串三段 | 通過（core） | 持續 `attack=true` 產生 hit index 1→2→3；buffer 在完整 recovery 後消耗，閃避仍可取消 recovery |
| 完整六遭遇／Boss 可決定性重播 | 通過（core） | 同 seed、相同自動輸入兩次抵達 victory，終局 `GameState` 完全相等 |
| 動作與實際速度／方向一致 | 通過（結構／單元層） | render 直接消費 `velocity`／`locomotion`；advance／strafe／retreat／dash／recover 分 pose，VFX 保存 dash 起訖點與腳步塵 |
| hit-stop 不改 core | 通過（結構／單元層） | `comboHit` 只建立 render snapshot；先畫命中幀，再凍結 2 幀／第三段 3 幀，固定 tick loop 繼續推進 |

## 真實命令結果

### `pnpm verify`

- lint：通過
- core／app typecheck：通過
- Vitest：**40 個測試檔、287 項測試全通過**
- production build：通過
- bundle：116.81 kB raw／42.22 kB gzip；65,536 bytes gzip 預算通過

以上為遊戲 repo 內的獨立 `pnpm verify`。另於工作室根 repo 執行 `pnpm verify`，結果為 **94/94 測試通過**，schemas、submodules、packages 與 platform 檢查全部通過。

### `pnpm sim:gate2`

30,000 局 house-standard 回歸：

| 指標 | 結果 |
|---|---:|
| 整體勝率 | 50.80% |
| ember／shadow／guard 勝率 | 53.91%／49.50%／48.96% |
| 流派勝率差 | 4.95pp |
| 最低勝局印記納入率 | 18.07% |
| Top 5 build share | 54.12% |
| 中位通關時間 | 15.575 分鐘 |
| deterministic rerun | 相同 |
| illegal content | 0 |

Gate 2 的勝率、流派差、印記納入、build 集中、時長、合法生成與決定性門檻全通過。`markTriggerHealth` 仍因既有 `aftershock-shield` 原型 AI 限制為 false；本輪未改 HP、damage、armor、marks 或 encounter content，不把此既知限制誤報為新回歸。Gate 2 sim 是 1.1s 聚合循環且沒有即時空間座標，只能保護內容平衡，不能證明 0.87s 即時手感；後者由 core 時序測試與真人 Gate 3 重測負責。

## 瀏覽器 smoke

- Vite 實際從遊戲 repo 以 `127.0.0.1:5176` 啟動。
- reload 後等待 3 秒，頁面標題、單一 canvas、220/220 HUD 與第一遭遇目標正常；所掛 `pageerror`／console error 監聽為 **0 筆**。
- 在 canvas 上長按左鍵並依序持續輸入 D／S／A／W 共約 8 秒；遊戲持續更新、玩家 HP 由 220 降至 200，表示 focus、held pointer input、鍵盤 input、敵人攻擊與 HUD 都仍在同一真實瀏覽器 loop 運作；期間 console／page error 仍為 **0 筆**。此 smoke 不等同於證明三段每一刀都在畫面上命中，三段可靠性由 core 測試保證。

### 完整 production module／Canvas／音訊映射整合

- 在真實 Chromium 頁面 `http://127.0.0.1:5176` 透過 Vite 載入 production source modules，建立真實 `GameLoop`、`CanvasRenderingContext2D`、`paintDungeon` 與 `deriveAudioFrame`。
- 測試以 1/60 accumulator 從 encounter1 推進至 victory，共 **20,204 frames、337 秒模擬時間、約 8,296 ms wall-clock 執行時間**。
- phase trail 完整經過 encounter1→draft→encounter2→draft→encounter3→draft→encounter4→draft→encounter5→draft→encounter6→draft→boss→victory；共完成六次 draft，終局持有六枚印記。
- 流程涵蓋 Boss phases 1／2／3，實際產生 **42 種流程 cue**；終局玩家 HP 為 **169**，canvas 像素取樣確認存在非零像素。
- 這證明真實 Chromium 內 production modules、core loop、Canvas 2D 繪製與音訊事件映射可共同完成全流程。它是程式化自動輸入的整合 smoke，**不是人工遊玩**，也不驗證提示可讀性、操作手感、音訊可聽辨性或真實 compositor 60fps。

### 真實 Web Audio graph／排程整合

- 在仍存活的真實 Chromium 頁面 `http://localhost:5173`，先經 pointer gesture，再建立 `createWebAudioBackend` 並成功 `resume` `AudioContext`。
- 將 `content/audio-events.json` 全部 **57 個 cue** 以真實 `OscillatorNode`／`GainNode` 排程；測試期間 muted 以免干擾，另設定三層 music，等待排程後執行 `dispose`，全程成功。
- 這證明瀏覽器 Web Audio runtime API、graph 建立、cue scheduling、music layers 與清理路徑可執行；**不是人耳盲測**，不能據此宣稱各 cue 可辨識或混音品質通過。

### 測試基礎設施與 server lifecycle 記錄

- 完整 render smoke 第一輪沿用 5 秒預設 timeout，實際約 6.27 秒而 timeout。只將該測試的 per-test timeout 調整為 **15,000 ms**，沒有修改任何斷言；重跑約 6.85 秒通過。此項記為測試基礎設施修正，不是產品效能回歸，也不是 60fps 證據。
- `5176` server 後續已關閉；關閉後額外一次 fetch 產生 `ERR_CONNECTION_REFUSED`。該錯誤符合已停止 server 的生命週期，不列為產品 runtime bug。Web Audio 整合已改在仍存活的 `5173` server 重跑並成功。

## 尚未通過／不可宣稱

### B-01：目標裝置 compositor 60fps 證據仍缺

先前整合瀏覽器在 `document.visibilityState === "visible"` 的情況下，兩次 rAF 採樣仍只得到約 1.06fps（8.45 秒／9 幀）與 1.31fps（3.05 秒／4 幀），frame interval 約 1016ms。這是自動化整合瀏覽器的背景節流特徵，不能當作遊戲效能，也不能轉寫為 60fps 通過或失敗。新增的 20,204-frame smoke 使用 1/60 accumulator 驅動 module flow，同樣不是 compositor frame pacing 測量。須在目標裝置 Chrome DevTools 錄製至少 60 秒，涵蓋 encounter6 與 Boss summon，回報平均與 P95 frame time。

### B-02：真人 Gate 3 重測尚未執行

自動測試能證明軌跡、幾何與時序契約，不能證明「敵人動起來後好玩」「提示容易看懂」「0.87s 手感正確」。需真人從第一遭遇至少打到一次 Boss，特別檢查：

1. 四 archetype 是否持續有目的地移動且不黏成一團。
2. 預兆開始後移位是否真的能躲、留在形狀內是否確實受傷。
3. 長按左鍵是否自然串招，第三段是否有足夠而不拖沓的重量。
4. hit-stop／shake 是否清楚但不造成操作失聯。

### B-03：人工完整七戰／六 draft 與音訊盲測仍缺

真實 Chromium 的自動 module flow 已完成 encounter1→6→Boss→victory、六次 draft、六枚終局印記與 Boss 三階段，57 個 cue 也已通過真實 Web Audio graph 排程；因此「完整真實瀏覽器模組流未跑」不再是 blocker。仍未由真人實際操作完成七戰與六次 draft，也沒有做四敵人、Boss 三攻勢與十二印記的人耳盲測；自動輸入與 graph 排程不能取代這兩項驗收。

## 建議判定

維持 `gate3_vertical_slice`、owner 為 human。核心退回項目與完整真實瀏覽器模組流已具備可重播的自動證據，可以交回真人重測；人工實際操作完整七戰、目標裝置 compositor 60 秒 trace 與人耳盲測仍留給最終真人驗收。在 B-01／B-02／B-03 完成前，不宣稱 Gate 3、Gate 4 或正式出貨通過。
