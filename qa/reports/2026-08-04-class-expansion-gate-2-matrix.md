# 《餘燼決鬥場》雙職業擴充 Gate 2 QA 驗收矩陣

## 2026-08-04 PL-01-01 修正複驗

**結論：PL-01-01 靜態／自動契約通過；PL-01-02 真實瀏覽器仍未驗證，Gate 3 維持不放行。** 詳細證據見 `qa/reports/2026-08-04-pl-01-platform-qa.md` 的本節。QA 唯讀執行，未修改程式、未 commit／push／deploy。

| 項目 | 結果 | 直接證據／限制 |
|---|---|---|
| focus helper／preventScroll | 通過 | `platform-focus.test.ts` 與 static handshake contract；armed handshake 才呼叫 `focus({ preventScroll: true })`，null／未 armed 不呼叫。 |
| focus armed 一次性與取消 | 通過（靜態／契約） | 使用者 start/retry 才 armed，handshake 後消費；pointerdown、任意 keydown、blur、visibilitychange、iframe focus／pointerdown、close 均清除 pending focus；static test 有 exact keydown source assertion。 |
| platform build／發布檢查 | 通過 | `pnpm check:platform`；3 款靜態遊戲、registry、平台 lint（1 warning/0 error）、rendered HTML 4/4。修正後 `npm --prefix platform run lint && npm --prefix platform test` 亦 0 error、4/4。 |
| 遊戲回歸 | 通過 | `games/embers-duel/pnpm verify`：52 files / 403 tests，bundle gzip 55,955 / 65,536。 |
| standalone／iframe 真實 handshake、storage、1280×720 scroll、reload console、實際輸入 | 未驗證 | 沒有可用 Chromium/browser binding；不將 mock、HTTP 或無頭結果當作實機證據。 |

**阻斷交接更新：** PL-01-01 工程缺口解除；PL-01-02 仍需可見 Chromium 完成雙模式實機 smoke。未取得實機證據前不得宣稱 PL-01、PF-01、AU-01 或 Gate 3 通過。

## 2026-08-04 PL-01 standalone／platform iframe QA

**結論：不通過；Gate 3 前平台放行維持關閉。** 詳細唯讀報告見 `qa/reports/2026-08-04-pl-01-platform-qa.md`。本輪實際執行遊戲 `pnpm verify`（**52 files / 403 tests**，gzip **55,955 / 65,536 bytes**）、定向 replay/input/runtime-storage（**4 files / 50 tests**）與 SDK/host/static handshake 契約（**3 files / 17 tests**），並完成 `pnpm check:platform` 的 local static publish/build。

| 項目 | 結果 | 證據／限制 |
|---|---|---|
| standalone production bundle／manifest／靜態發布 | 通過（建置、HTTP 與檔案層） | game manifest、registry、`platform/dist/firebase/games/embers-duel/` 和 Vite preview HTML/JS 均一致且回 200；不代表瀏覽器 runtime 通過。 |
| storage namespace、SDK handshake、crash dump／input 契約 | 通過（契約） | SDK 與 host 均以 `rogue-paradise:embers-duel:` slug namespace；握手 timeout 不會靜默降級；定向 crash dump/input/storage tests 通過。 |
| 首次 iframe focus | **失敗（可靜態證明）** | platform launcher 沒有 `iframeRef.current.focus()` 或等價載入／握手後移交，PL-01-01 交 Platform Engineer 修復與測試。 |
| standalone／iframe 實機 handshake、1280×720 scroll、reload console 0 error | 未驗證 | 此環境沒有可用 Chromium；不以 mock、HTTP 或無頭測試取代真實瀏覽器證據。 |

**阻斷交接：** Platform Engineer 先修 PL-01-01；其後在可見 Chromium 完成 PL-01-02 的雙模式實機驗收。`check:platform` 只重建本機靜態產物，未公開 deploy。Gate 3 仍不得放行。

## 2026-08-04 PF-01 Chromium runtime QA

**結論：未通過／未取得 Chromium 證據；Gate 3 前放行維持關閉。** QA 已啟動本機 dev 與 production preview 並完成全套自動驗證，但本環境的 browser runtime 回覆 `No browser is available`，故不以 HTTP、無頭 replay 或背景 rAF 取代真實 Chromium 實機結果。完整稽核見 `qa/reports/2026-08-04-pf-01-chromium-runtime.md`。

| 項目 | 結果 | 證據 |
|---|---|---|
| `pnpm verify` | 通過 | lint、typecheck、Vitest **52 files / 398 tests**、production build；gzip **54,254 / 65,536 bytes**。 |
| dev／preview HTTP | 通過（範圍受限） | `127.0.0.1:9998` dev 與 `127.0.0.1:9997` preview 啟動；首頁與 production JS bundle 都回 200，60 秒首頁抽樣 57/57 successful。 |
| 真實 Chromium：兩職／三種 Draft／LMB Space Q E Enter／滑鼠 | 未驗證 | 無可用 Chromium browser binding。 |
| 1280×720、60 秒 frame／long task／memory／console／network | 未驗證 | HTTP 時間不是 compositor frame time，故不偽造效能通過。 |
| 24 卡與 8 共鳴畫面可讀性 | 未驗證 | 自動 visual contract 仍通過；每張實畫面／混戰遮擋證據待可見 Chromium。 |

**阻斷交接：** PF-01-01 待在可見 Chromium 執行完畢。此問題是驗收環境缺少瀏覽器，不是遊戲程式的已確認 defect；但在取得實機證據前不得自動宣稱 PF-01、Gate 3、AU-01 或 PL-01 已通過。

## 2026-08-04 BL-01／RT-01／VQ-01／B4-04 整合驗收

**結論：通過資料、決定性與可讀性契約；放行 PF-01 的真實 Chromium 效能／輸入工作包。** 這不是 PF-01 通過、Gate 3 試玩或公開出貨核准。本輪唯讀稽核，未修改遊戲程式、未 commit／push／deploy。

### 本輪實際執行與證據

| 項目 | 結果 | 直接證據與範圍 |
|---|---|---|
| 唯一驗證入口 | 通過 | 實際執行 `pnpm verify`：lint、core/app typecheck、Vitest **52 files / 398 tests**、production build 全綠；JavaScript gzip **54,254 / 65,536 bytes**。 |
| BL-01 全卡／共鳴／合法構築 | 通過（基線） | 實際執行 `pnpm exec tsx sim/class-expansion-balance-report.ts`：固定 `embers-class-balance-v1`、每情境 10,000 局；`unreachableCards: []`、`unreachableResonances: []`、`invalidBuilds: []`，並涵蓋 learning／competent／expert 及 `4/1/1`、`3/2/1`、`2/2/2`。測試以固定樣本重跑亦通過。這是純資料模型；100% 模型通關與約 7.4–8.6 分鐘時間不代表 runtime 或真人平衡，且報告已明定不得據此 buff／nerf。 |
| BL-01 歸因限制 | 通過（誠實標記） | 報告分開記錄未選前置、策略保留、讀招、站位、執行與主動風險拒絕；影線較低共鳴 resolve 不被偽稱為輸入失敗。沒有死亡樣本及 runtime 敵傷／hitbox 校正，故本輪不作勝率、難度或 10–12 分鐘目標的放行結論。 |
| 24 張卡的 typed success event | 通過 | `GameEvent` 為每個 card ID／職業／效果建立封閉 `classEffectResolved` union；實作來源的靜態核對為 `combat.ts` 20 張 + `run.ts` 4 張，合計正好 24。`class-visual-contract.test.ts` 斷言全部 24 visual cue 皆為 `class-effect-event`，不以通用 Q、命中或世界物件反推；定向 `class-content-slice.test.ts` 與跨 Draft crash-dump cases 均通過。 |
| 8 條共鳴的視覺因果契約 | 通過（契約） | `RESONANCE_VISUAL_CUES` 具 4 熔衛 + 4 影線條目，逐條要求留下物、按鍵作用、中央結果與 `rejectedByGeometry`；定向 renderer-fixture 測試通過。第三、四條共鳴的 fixed-seed 跨 Draft resolved／rejected replay 也已在 `crash-dump.test.ts` 通過。 |
| VQ-01／B4-04 renderer fixture | 通過（資料 fixture；保留真實畫面驗收） | `classVisualCues()` 從 `CLASS_CARDS` 產出完整 24 卡非文字中央 cue；測試同時要求每職有 path／target／impact、至少三色調及 ground layer。`dungeon-view.test.ts` 另驗證守角轉掃的中央 VFX。此證據證明 renderer/HUD/audio/replay 可消費的資料契約，**不等同**所有 24 張的 Chromium 截圖或像素回歸；後者納入 PF-01 的真實畫面檢查。 |
| RT-01 runtime telemetry | 通過（無捏造） | `collectRuntimeTelemetry(dump)` 只由 `replayHistory()` 的真實 input/event 計算房間承傷、受擊、擊殺、構築、槽位輸入／成功失敗、帶 `cardId` 的直接效果，以及共鳴 resolved/rejected reasons；同槽輸出不被臆測切分。實際 `runtime-telemetry-report.ts` 的兩條 900-tick core trace 輸出 Forgeguard 與 Shadowline 真實承傷、受擊、擊殺與 inputs。 |
| telemetry／replay 決定性與 1.0 null path | 通過 | `runtime-telemetry.test.ts` 對同一 JSON dump 重算全等，且 legacy dump 明確為 `classId: null, build: [], cards: [], resonances: []`。`crash-dump.test.ts` 的職業 fixed-seed／跨 Draft history 與 legacy null-path 均通過，未把 1.0 路徑誤報為職業資料。RT-01 的兩條展示 trace 不是 24 卡覆蓋或玩家平衡樣本，故沒有做出該等宣稱。 |

### 放行決定

- **放行 PF-01 Chromium 效能／輸入 QA。** 前置的 24 卡 typed 因果、八共鳴契約、runtime telemetry、決定性 replay 與 1.0 隔離均已有自動證據；PF-01 應以它們作真實瀏覽器觀測基礎。
- **PF-01 尚未通過。** 尚未取得 1280×720、至少 60 秒、混合波次／雙釘／雙弧線／殘切／四條共鳴／Boss 的 Chromium 平均與 P95 frame time、long task、console error；也尚未驗收 blur／hidden／pointercancel 清 held state，及重綁後 Draft 槽位提示。
- **Gate 3 仍缺的客觀檢查：** (1) PF-01 Chromium 與輸入結果；(2) AU-01 使用者互動後音訊啟動、分組音量／總靜音、純視覺可玩與人耳混淆矩陣；(3) PL-01 standalone／iframe handshake、storage namespace、首次 iframe focus、1280×720 無捲軸及 reload console 0 error；(4) 四類前置皆通過後的使用者真人 Gate 3 試玩。公開發佈仍需要使用者當前明確授權。

## 2026-08-04 第四批最終複驗（B4-01～B4-03）

**結論：通過；解除 B4-01～B4-03，放行 Gate 3 前的平衡、中央可讀性、效能、音訊與平台驗收。** 此放行不是 Gate 3 試玩或公開出貨核准。本輪為唯讀稽核；未修改遊戲程式、未 commit／push／deploy。

### 本輪實際執行與證據

| 項目 | 結果 | 直接證據 |
|---|---|---|
| B4 定向回歸 | 通過 | `pnpm vitest run src/core/class-content-slice.test.ts src/core/crash-dump.test.ts src/render/class-draft-overlay.test.ts`：**3 files / 64 tests** 全通過。 |
| 唯一驗證入口 | 通過 | `pnpm verify`：lint、core/app typecheck、Vitest **49 files / 389 tests**、production build 全綠；JavaScript gzip **53,994 / 65,536 bytes**。 |
| B4-01：環扣索與雙線折返共存 | 通過 | `class-content-slice.test.ts` 以同持 `loop-tether + double-line-return` 兩次真實 Q 驗證：主線和 `returnLine` 均為 `kind: 'double-line'`，且各自有 typed `classEffectResolved: 環扣索` 與相同 `curveControl: { x: 2.15, y: 1.15 }`。已選雙線不再被環扣索 boolean 靜默關閉。 |
| B4-02：錨索退讓 fixed-seed 跨 Draft replay | 通過 | `crash-dump.test.ts` 以 `anchored-riposte → fire-hook → molten-lock-retreat` 真實清關、跨 Draft 選卡；先產生 typed `錨索退讓 / 缺少火索` rejected，再以 Q 建釘、左鍵形成火索、成功格擋後 resolved。JSON round-trip 後 `replay()`、`replayHistory()`、逐 tick 手動 history 全等，history 含 `forgeTether`、`moltenLock`、rejected 與 resolved。 |
| B4-02：交線換身 fixed-seed 跨 Draft replay | 通過 | 同檔以 `pinned-body-swap → double-line-return → cross-line-borrow` 真實清關、跨 Draft 選卡；先有 typed `交線換身 / 缺少換位殘切` rejected，兩次 Q 建第二線、左鍵建立換位殘切，E 真實 resolved。JSON round-trip 的完整 history 含 `swappedEnemyId`、`returnLine`、rejected 與 resolved。 |
| B4-02：空施放／拒絕原因 | 通過 | `class-content-slice.test.ts` 分別覆蓋錨索退讓 `缺少火索／缺少爐釘`，交線換身 `缺少換位殘切／缺少第二線`；每例都斷言同 tick 不會有同名 `resonanceResolved`。 |
| B4-03：職業選擇與每次 Draft 的非阻斷示範 | 通過 | `class-draft-overlay.ts` 對每張卡建立 before/after 兩個幾何畫格，以 3 秒 CSS animation 交替，並附 `aria-label`；`class-draft-overlay.test.ts` 遍歷完整 `CLASS_CARDS`，確定每張的前置物與結果文字都可讀，且 DOM 建立三張示範。職業二選一亦掛載同一示範。 |
| B4-03：焦點、鍵盤與 DOM 契約 | 通過 | Overlay 僅在由關閉轉為開啟時 focus 第一張；連續 update 不重建或搶焦點，關閉再開才重新 focus。每張為原生 button，具 `aria-keyshortcuts="Enter Space"`；DOM test 驗證 Enter 的 `preventDefault()` 與選擇回呼。 |
| 1.0 replay／crash-dump | 通過 | `crash-dump.test.ts` 持續覆蓋 `classId: null` dump/replay；完整 389 項回歸通過，無職業物件滲入 legacy path。 |

### 分級

- **阻斷 Gate 3 前工程：無（B4-01～B4-03 均已解除）。**
- **應修但不阻斷：** B4-04 的部分卡片仍主要靠世界物件／通用事件觀察，B4-05 的新戰場物件仍缺完整 render regression；兩項併入中央可讀性／效能工作包，不得當作真人 Gate 3 已驗收。
- **Gate 3／公開出貨：仍未放行。** Gate 3 需要使用者真人試玩；公開發佈另需使用者當前明確授權。

### 自動交接工作包（依序）

1. **Balance Engineer — BL-01 可重播平衡基線。** 以 runtime-compatible 的固定 seed 無頭控制器，對兩職的 `4/1/1`、`3/2/1`、`2/2/2` 合法構築與低／中／高技巧檔各跑至少 10,000 局；輸出每關完成率、承傷、死亡原因、時間、每卡 offer/pick/attempt/resolved/rejected、八條共鳴的 missed reason。先量測而非先改數值；結果必須明確區分供給、站位、讀招與輸入失誤。
2. **Visual Director + Gameplay Engineer — VQ-01 中央可讀性回歸。** 為雙釘熔鏈／弧牆、火索／鎖鏈、環扣雙線／吊點回走線、跨線借位補 deterministic 1280×720 render fixture 或 screenshot regression；驗證敵方預兆在所有物件上層仍可辨識，並把可觀察的卡 ID 成功結果補到尚依賴通用事件的卡片。
3. **QA + Gameplay Engineer — PF-01 效能與輸入可靠性。** 在真實 Chromium 以 1280×720 跑至少 60 秒，涵蓋混合波次、雙釘、雙弧線、殘切、四條共鳴與 Boss；記錄平均／P95 frame time、長任務與 console error。另驗收失焦、hidden、pointercancel 清 held state，以及重綁後 Draft 槽位提示。
4. **Audio Director + QA — AU-01 聲音可辨識與靜音可玩性。** 對熔衛格擋／反震／鎖鏈、影線建線／借位／殘切建立事件 map 與互動後才啟動的 smoke；驗證 music/effects/UI 分組、總靜音及純視覺仍可玩。人耳盲測須獨立於敵方預兆，完成混淆矩陣後才進 Gate 3。
5. **QA + Platform Engineer — PL-01 standalone／iframe 契約。** 在真實 Chromium 驗 standalone 和 iframe 的 handshake／storage namespace、首次 iframe focus、1280×720 無捲軸、reload console 0 error；任何失敗都阻斷 Gate 3 交付。

**放行決定：** B4 工程切片已完整可重播，現在可依上述順序進入 Gate 3 前的全量品質驗收；不得跳過任何工作包直接要求使用者試玩或公開出貨。

## 2026-08-04 第三批修正複驗（B3-01～B3-05）

**結論：不放行第四批、Gate 3 或公開出貨。** 本輪為唯讀稽核；未修改遊戲程式、未 commit／push／deploy。完整自動驗證與定向測試皆通過，但 B3-01 的熔衛第三共鳴缺少跨 Draft 成功 replay，B3-05 也尚未覆蓋規定的 Q／E 三卡真實管線；兩項仍屬第四批前的阻斷證據缺口。

### 本輪實際執行與證據

| 項目 | 結果 | 直接證據 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify`：lint、core/app typecheck、Vitest **48 files / 371 tests**、production build 全綠；JavaScript gzip **51,598 / 65,536 bytes**。 |
| B3-02：兩項拒絕原因互斥 | 通過 | `class-content-slice.test.ts` 已覆蓋 `楔點轉掃 / 轉掃無目標` 與 `吊點脫身 / 未落於吊點`；兩例均斷言同 tick 無同名 `resonanceResolved`。 |
| B3-03：守角轉軸獨立效果 | 通過 | 單獨持有 `corner-pivot` 並成功格擋時，測試斷言 typed `classEffectResolved: 守角轉掃`、敵人位移與 `pivotSweep`；與 `shield-wedge` 共存時則保留 `楔點轉掃` resolved。 |
| B3-04：中央 VFX 契約 | 通過 | `PivotSweepObject` 具純資料 position/direction/ticks；`dungeon-view.ts` 繪製金色掃弧，`dungeon-view.test.ts` 驗證 `pivotSweepVisualCue()` 的可視性、位置、方向與半徑。 |
| 影線第三共鳴跨 Draft replay | 通過 | `crash-dump.test.ts` 真實跨 Draft 取得 `reverse-mark-anchor → terminal-drop`；包含 rejected，等待吊點預兆後 `吊點脫身` resolved，並以 `assertRoundTrip()` 比對 JSON `replay()`、`replayHistory()` 與逐 tick 手動 history。 |
| 熔衛第三共鳴跨 Draft replay | 未通過 | 同檔只為 `shield-wedge → corner-pivot` 建立 rejected `未成功格擋` case；沒有真實輸入建立 `breachPoint`、成功格擋、`楔點轉掃` resolved，亦沒有 `pivotSweep`／`breachPoint` 在 round-trip history 的斷言。 |
| B3-05：指定三卡 Q／E 管線 | 未通過 | 現有 generic test 只覆蓋 `bulwark-hammer + heated-rotation + shield-wedge`（主手）與 `double-line-return + gap-marking + reverse-mark-anchor` 的兩次 Q；未以真實/replay 驗證 `ring-forged-boundary + double-nail-seal + fire-hook` 的三者共存，亦未驗證 `reverse-mark-anchor + double-line-return + gap-marking` 的既有線路與標定共存，更沒有第三批 E 與既有 E 卡同 tick 的直接證據。 |
| 1.0 回歸 | 通過 | `crash-dump.test.ts` 保持 `classId: null` dump/replay；全套 371 測試均通過。 |

### 阻斷第四批放行

1. **B3-01：熔衛第三共鳴尚無完整跨 Draft resolved replay。**
   - 重現：執行 `pnpm vitest run src/core/crash-dump.test.ts`，檢視第三共鳴 cases。熔衛僅斷言 `楔點轉掃 / 未成功格擋`，影線才有 resolved controller。
   - 修正要求：固定 seed 真實跨 Draft 取得 `shield-wedge → corner-pivot`；以輸入建立裂盾點，讓敵招成功被格擋並在楔點範圍內有活目標，斷言 `守角轉掃`、`楔點轉掃` resolved、`pivotSweep` 與 JSON round-trip 的 `replay()`／完整 `replayHistory()` 一致。保留既有 rejected case。

2. **B3-05：三卡同槽 pipeline 未依指定構築直接驗證。**
   - 重現：現有 `第三批與既有同槽三卡` 測試未使用 `ring-forged-boundary + double-nail-seal + fire-hook`，而影線 Q case 未同時先後驗證雙線、標定與吊點三者；沒有第三批 E 與既有 E 同 tick 的 replay。
   - 修正要求：以固定 fixture／replay 分別驗證上述兩組 Q 卡的每張可觀察物件與作用都保留；再對熔衛 `corner-pivot` 與既有 E、影線 `terminal-drop` 與既有 E 建立同 tick 不互相覆寫的明確事件／位置斷言。

### 分級與下一棒

- **阻斷出貨／阻斷第四批：** B3-01、B3-05。
- **應修但不阻斷：** 無新增。
- **建議：** 為吊點落刃的回走線補與 `pivotSweep` 同級的 renderer fixture，讓第三共鳴兩端的中央可讀性格式一致。

**不放行第四批。** Gameplay Engineer 先補 B3-01 與 B3-05 的實際輸入/replay 證據，再交 QA 複驗；Gate 3、效能、平台、音訊與公開發佈仍未放行。

## 2026-08-04 第三批六張卡與第三條職業共鳴唯讀稽核（B3）

**結論：不放行第四批、Gate 3 或公開出貨。** 本輪只讀稽核，未修改遊戲程式、未 commit／push／deploy。第三批的基礎命中路徑、型別化事件與既有 1.0 全套回歸均可執行，但尚未取得本批所要求的完整空施放／拒絕原因／跨 Draft replay 證據；其中 `守角轉軸` 的單卡行為亦被共鳴前置靜默綁死，不能宣稱 12 張卡均可單獨驗收。

### 本輪實際執行與證據

| 項目 | 結果 | 直接證據 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify` 實際完成：lint、core/app typecheck、Vitest **48 files / 363 tests**、production build 全綠；JavaScript gzip **51,342 / 65,536 bytes**。 |
| 熔衛第三批命中路徑 | 部分通過 | `class-content-slice.test.ts` 驗證 `shield-wedge` 第三段留下 `breachPoint`／`facingLock`，`ring-forged-boundary` 留下有方向的弧牆，且持有 `shield-wedge + corner-pivot` 並成功格擋時輸出 typed `守角轉掃` 與 `楔點轉掃`。`dungeon-view.ts` 繪製楔點、弧牆與熔鏈。 |
| 影線第三批命中路徑 | 部分通過 | 同檔驗證 `stitched-corner` 沿線折角、`reverse-mark-anchor` 將首個線上目標設為 `anchorEnemyId`，`terminal-drop` 落於吊點並留下 `return-exit`，且輸出 `吊點脫身` resolved。`dungeon-view.ts` 繪製吊點脈衝與回走線。 |
| 第三共鳴拒絕事件 | 部分通過 | `GameEvent` 明定楔點轉掃的 `缺少裂盾點／未成功格擋／轉掃無目標`，及吊點脫身的 `缺少危險吊點／吊點未預兆／未落於吊點`。測試只覆蓋前二者各兩項。 |
| 同槽與既有卡共存 | 部分通過 | 既有第二批測試仍證明雙釘＋引火鉤、雙線＋獵隙標定、回身割裂＋殘切回收並存；第三批沒有 `ring-forged-boundary + double-nail-seal + fire-hook`、`reverse-mark-anchor + double-line-return + gap-marking` 或第三批 E 與既有 E 的三卡真實操作／replay 證據。 |
| fixed-seed replay／crash dump | 未通過（本批範圍） | `crash-dump.test.ts` 的第三批列舉只在 opening Draft 選 `ring-forged-boundary` 或 `reverse-mark-anchor` 後按一次 Q；未跨 Draft 取得 `shield-wedge + corner-pivot` 或 `reverse-mark-anchor + terminal-drop`，沒有本批共鳴的 resolved／rejected history，也未驗證楔點、吊點、回走線。 |
| 1.0 回歸 | 通過（現有範圍） | `class-content-slice.test.ts` 保留 legacy Q 不建立職業物件；`crash-dump.test.ts` 保留 `classId: null` dump/replay；全套 regression 已隨 `pnpm verify` 通過。 |

### 阻斷第四批放行

1. **B3-01：第三批沒有固定 seed、跨 Draft 的共鳴 crash-dump/replay 驗收。**
   - 重現：執行 `pnpm vitest run src/core/crash-dump.test.ts`，檢視「職業卡 … JSON dump/replay」表格；`ring-forged-boundary`／`reverse-mark-anchor` 都只選一張 opening card、等待 130 tick 並按一次 Q。檔中沒有 `shield-wedge`、`corner-pivot`、`stitched-corner` 或 `terminal-drop` 的跨 Draft input log，也沒有 `楔點轉掃`／`吊點脫身` 的 `resonanceResolved` 或 `resonanceRejected` history。
   - 依據：Gate 2 規格 §3 決定性、§6 共鳴可讀因果、§7 六次 Draft；QA 規範要求固定 seed 重現。
   - 修正要求：兩職各新增 JSON round-trip 的真實 input log，分別跨 Draft 取得第三條配對卡，並產生一份 resolved 與一份明確 rejected；逐項比對 `replay()`、`replayHistory()` 與手動 tick history，且 history 應含 `breachPoint`／`facingLock` 或 `anchorEnemyId`／`return-exit`。

2. **B3-02：兩個已公開的型別化拒絕理由缺少自動化證據。**
   - 重現：執行 `pnpm vitest run src/core/class-content-slice.test.ts`。`楔點轉掃` table 僅覆蓋 `缺少裂盾點`、`未成功格擋`，未建立「成功格擋但楔點半徑內沒有存活敵人」的 `轉掃無目標`；`吊點脫身` table 僅覆蓋 `缺少危險吊點`、`吊點未預兆`，未建立「吊點預兆存在但 E 未實際落於吊點」的 `未落於吊點`。兩者也都未斷言該 tick 不會有同名 resolved。
   - 依據：Gate 2 規格 §6「沒有前置物、位置或時機就不得暗中給傷害」與 QA 任務的「所有具體 rejected reasons」。
   - 修正要求：為上述兩個 reason 各新增 fixture，斷言 `resonanceRejected` 的精確 reason、同 resonance 不可同 tick resolved，並驗證空施放不留下目標位移／隱性傷害。

3. **B3-03：`守角轉軸` 的單卡 E 改寫被 `shield-wedge` 前置靜默淘汰。**
   - 重現：在 `combat.ts`，`corner-pivot` 只會使 E 進入共用 0.24 秒格擋；實際轉掃在 `run.ts` 的 `pivotArmed`，其條件同時要求 `selectedClassCards.includes('shield-wedge') && selectedClassCards.includes('corner-pivot')`。因此只取得 `corner-pivot` 時，成功格擋沒有任何該卡的 typed effect、掃擊或明確 rejected event；現有測試也沒有其單卡命中／空施放。
   - 依據：Gate 2 規格 §5「每張卡只改一槽」及 §7.2「已投資的槽不得替換成無法使用的版本」。共鳴可要求楔點，但單卡不能完全退化為無可觀察行為。
   - 修正要求：讓 `corner-pivot` 在成功格擋且有最近爐釘時產生自身可觀察的軸掃／受限扇形效果，並把「有裂盾點」限定為楔點轉掃的加成因果；或在卡片資料與 Draft 文案明示其為必須搭配的非獨立卡，並重新核對 §5 的十二張獨立操作承諾。兩種方案皆須有命中、空施放與同槽共存測試。

### 應修但不阻斷

1. **B3-04：第三條 resolved 的 renderer/VFX 證據不完整。** `dungeon-view.ts` 可見楔點、吊點與回走線，但轉掃 resolved 後立即消耗 `breachPoint`，沒有可驗證的掃掠物件／VFX；目前 renderer 也不消費 `classEffectResolved`／`resonanceResolved`。補 render 測試或 deterministic screenshot，明確保證楔點轉掃與吊點落刃的結果在混戰仍由戰場中央而非 HUD 判讀。
2. **B3-05：第三批同槽三卡管線缺少直接證據。** 補固定 fixture 與 replay，證明弧牆不會取消雙釘／引火鉤，吊點不會取消雙線／獵隙標定，且第三批 E 與既有 E 卡同 tick 不會靜默覆寫。

### 放行決定

**不放行第四批。** 先解除 B3-01～B3-03，再交 QA 複驗；B3-04、B3-05 可隨同一工程包補齊。此結論不改變既有第二批放行，也不放行 Gate 3、效能／平台／音訊 gate 或公開發佈。

## 2026-08-04 第三批完整 replay／同槽管線最終複驗（B3-01～B3-05）

**結論：通過；放行第四批最後六張卡實作。** 本輪僅解除第三批的工程阻斷項；**不**放行 Gate 3、公開出貨、效能／平台／音訊 gate。本輪為唯讀稽核，未修改遊戲程式、未 commit／push／deploy。

### 本輪實際執行與證據

| 項目 | 結果 | 直接證據 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify` 實際完成：lint、core/app typecheck、Vitest **48 files / 375 tests**、production build 全綠；JavaScript gzip **51,598 / 65,536 bytes**。 |
| B3-01 熔衛 fixed-seed 跨 Draft 第三共鳴 | 通過 | `crash-dump.test.ts` 以 `seedOfferingSequence('forgeguard', ['shield-wedge', 'corner-pivot'])` 真實清關跨 Draft 選卡，以三段左鍵建立 `breachPoint`、等待預兆並成功格擋。歷史中實際出現 `pivotSweep`、`classEffectResolved: 守角轉掃` 與 `resonanceResolved: 楔點轉掃`；JSON round-trip 後 `replay()`、`replayHistory()` 與逐 tick 手動 history 全等。 |
| B3-01 影線 fixed-seed 跨 Draft 第三共鳴 | 通過 | 對應 `reverse-mark-anchor → terminal-drop` 的 fixed-seed 跨 Draft log 先留下 rejected，再在吊點預兆時真實 E 落刃 resolved；同樣由 `assertRoundTrip()` 比對 JSON、`replay()`、`replayHistory()` 與手動歷史。 |
| B3-02 完整拒絕理由 | 通過 | `class-content-slice.test.ts` 覆蓋楔點轉掃的 `缺少裂盾點／未成功格擋／轉掃無目標`，以及吊點脫身的 `缺少危險吊點／吊點未預兆／未落於吊點`；每例斷言同 tick 不存在同名 `resonanceResolved`。 |
| B3-03 守角轉軸獨立可用 | 通過 | 單持 `corner-pivot` 的成功格擋輸出 `classEffectResolved: 守角轉掃` 與可追溯 `pivotSweep`；同持 `shield-wedge` 時仍保留楔點轉掃 resolved，未被共鳴前置靜默淘汰。 |
| B3-05 三張 Q pipeline | 通過 | 熔衛 `ring-forged-boundary + double-nail-seal + fire-hook` 的兩次真實 Q 同時留下弧牆朝向、雙釘及拉扯結果；影線 `double-line-return + gap-marking + reverse-mark-anchor` 的兩次真實 Q 同時保留主／折返線、標定與吊點。兩案均跨 Draft 並以 JSON `replayHistory()` 複驗。 |
| B3-05 第三批 E 與既有 E 同 tick | 通過 | 熔衛的 `iron-curtain-recall + corner-pivot` 在同一成功格擋 tick 各輸出自己的 `classEffectResolved`；影線 `returning-rend + terminal-drop` 的真實 E 留下 `return-exit` 並造成落刃傷害。兩案均跨 Draft 且 round-trip replay 全等。 |
| 1.0 replay／crash-dump | 通過 | legacy `classId: null` 路徑仍由 crash-dump regression 與完整 375 項測試覆蓋；本輪職業資料沒有滲入無 classId run。 |

### 分級

- **阻斷第四批：無（B3-01、B3-02、B3-03、B3-05 均已解除）。**
- **應修但不阻斷：B3-04 視覺證據仍待後續 Visual／QA 階段。** `pivotSweep`、楔點、吊點與回走線已進入可重播純資料狀態；尚未以混戰 render regression 或 deterministic screenshot 證明其最終畫面層級。第四批完成後應與全卡 visual QA 一併處理，不能以此報告宣稱 Gate 3 的中央可讀性已驗收。

### 放行決定

**放行第四批最後六張卡實作。** 後續仍須維持每張卡的單卡命中／空施放、同槽可疊合、typed resolved／rejected、fixed-seed crash-dump/replay 與 1.0 null-path；所有 24 卡完成後才可進入 Gate 3 前的全量視覺、平衡、效能、平台與音訊驗收。

## 2026-08-04 第二批完整跨 Draft replay 最終複驗（B2-06-R）

**結論：通過；放行第三批六張卡實作。** 此結論僅解除第二批的 B2-06-R replay 阻斷，**不**放行 Gate 3、公開出貨、效能／平台／音訊 gate。本輪為唯讀稽核，未修改遊戲程式、未 commit／push／deploy。

### 本輪實際執行與證據

| 項目 | 結果 | 直接證據 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify` 實際完成：lint、core/app typecheck、Vitest **48 files / 354 tests**、production build 全綠；JavaScript gzip **50,260 / 65,536 bytes**。 |
| 熔衛 fixed-seed 跨 Draft 構築 | 通過 | `crash-dump.test.ts` 以 `seedOfferingSequence()` 找到確定 seed，真實清關到下一 Draft、依序選 `double-nail-seal` 與 `iron-curtain-recall`。沒有手動改寫 `GameState`。 |
| 熔衛實際雙釘／熔鏈與第二共鳴 | 通過 | 該序列先留下 `封口回收 / 缺少雙釘` rejected，再以兩次真實 Q 建立 `forgeNail` 與 `sealNail`；後續控制器等待敵方預兆、受壓與成功格擋，真實 E 輸出 `封口回收` resolved。`replayHistory()` 確認歷史內存在 `sealNail`。`combat.ts` 亦表明第二釘以 Q 冷卻 7.4 秒、兩釘各 15 秒存續，並以敵人至兩釘 segment 的距離建立真實熔鏈壓力，非測試捷徑。 |
| 影線 fixed-seed 跨 Draft 構築 | 通過 | 同檔以真實清關／Draft 依序選 `double-line-return` 與 `returning-rend`；先以真實 E 留下 `折返處刑 / 缺少折返線` rejected，再兩次 Q 建立主線與折返線。 |
| 影線實際雙線與第二共鳴 | 通過 | 後續真實 E 抵達主線終點，輸出 `折返處刑` resolved；`replayHistory()` 確認歷史內存在 `returnLine`。雙線存續 7.2 秒大於 Q 冷卻 6.5 秒，故第二條線在 runtime 有可達操作窗口，而非只在 state fixture 中共存。 |
| crash JSON／replay 決定性 | 通過 | 兩職案例均 JSON round trip dump，逐項比對 `replay()`、`replayHistory()`、以及從同一 input log 手動逐 tick 建立的完整 history；最終 state 與每 tick 均相同。 |
| 1.0 crash-dump／replay | 通過 | 同測試仍斷言 legacy recorder dump 的 `classId: null`，`replay()` 維持 null 路徑；全套 regression 已隨 `pnpm verify` 通過。 |

### 分級

- **阻斷出貨／阻斷第三批：無（B2-06-R 已解除）。**
- **應修但不阻斷：** `classEffectResolved` 的鐵幕收束目前只有 `targetIds`，尚未攜帶 midpoint／from-to；後續 render/VFX 若需精確重建收束軌跡，應增補純資料事件，不能由畫面反推。
- **建議：** 在下一輪視覺 QA 為雙釘熔鏈、雙線折返線及回收中點補混戰截圖／render 驗收；目前本項僅證明 core runtime 與 replay 可達、可重播。

### 放行決定

**放行第三批六張卡的實作。** B2-04-R、B2-05、B2-06-R 的同槽可疊合、拒絕原因、跨 Draft 真實構築及決定性 replay 均已有自動證據。下一棒仍須維持每張卡的真實幾何／時序／風險與 1.0 回歸；完成整個 24 卡切片後，才進 Gate 3 前的視覺、效能、平台與音訊驗收。

## 2026-08-04 第二批修正 replay 複驗（B2-04-R／B2-06-R）

**結論：B2-04-R 通過；B2-06-R 未通過。因此不放行第三批、Gate 3 或公開出貨。** 此輪僅作唯讀稽核與報告更新，未修改遊戲程式。

### 本輪實際執行

| 項目 | 結果 | 證據 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify`：lint、core/app typecheck、Vitest **48 files / 352 tests**、production build 全綠；JavaScript gzip **50,238 / 65,536 bytes**。 |
| B2-04-R：熔衛雙 E 同 tick | 通過 | `class-content-slice.test.ts` 建立同時持有 `bulwark-hammer`、`pressure-furnace-roar`、`iron-curtain-recall` 的成功格擋 fixture，斷言依序產生獨立 typed `classEffectResolved`：`鐵幕收束` 與 `反壓反震`，以及 `防區反震` resolved。`run.ts` 的順序是先記錄鐵幕收束、再由事前快照的受壓位置反震，最終敵人位於反震後的位置（`x > 3`），沒有被中點收束覆寫。 |
| B2-04-R：可觀察性 | 通過（目前事件契約） | `classEffectResolved` 各自含 card ID、effect 與 target IDs；audio 層也對兩張卡分派不同 cue。這足以讓 replay/HUD/VFX 依事件判斷兩張卡均兌現，但尚未攜帶中點座標，屬後續視覺驗收可改善項。 |
| 第二共鳴 rejected paths | 通過（unit fixture） | `class-content-slice.test.ts` 覆蓋封口回收的 `熔鏈外／未受壓／未成功格擋` 與折返處刑的 `錯誤落點／無標定目標`；每案均斷言相同 resonance 不會同 tick 產生 resolved。 |
| B2-06-R：跨 Draft 選第二張卡 | 部分通過 | `crash-dump.test.ts` 以固定 seed、真實清關輸入抵達第二次 Draft，並以 JSON round trip 驗證 `replay()` 與 `replayHistory()` 最終狀態；但配對為 `pressure-furnace-roar → iron-curtain-recall`、`residual-collection → returning-rend`，只是同槽選卡，並非第二共鳴的必要雙釘／雙線構築。 |
| B2-06-R：跨 Draft 雙釘／雙線與第二共鳴 replay | **未通過** | 現有跨 Draft case 在第二張卡被選取後立刻 dump；沒有第二次 Q、沒有 `sealNail`／`returnLine`，也沒有 E。因而 history 不含 `封口回收` 或 `折返處刑` 的 resolved/rejected，無從證明實際構築在 JSON round trip 後保持決定性。 |
| 1.0 replay/crash-dump | 通過（現有範圍） | legacy recorder 仍輸出 `classId: null` 且 `replay()` 維持 null 路徑；完整 suite 已隨 `pnpm verify` 通過。 |

### 阻斷第三批放行

1. **B2-06-R：缺少跨 Draft、實際第二共鳴的 replay 證據。**
   - 重現：執行 `src/core/crash-dump.test.ts` 的「跨 Draft 取得第二張同槽卡」兩個 case。兩者都在第二個 `forgeChoice` 後立即 JSON dump；input log 沒有後續 `skillQ` 或 `skillE`。故不可能建立雙釘／雙線，也不可能產生第二共鳴事件。
   - 修正要求：每職各提供固定 seed 的完整 input log：第一關選第一張、真實清關、第二 Draft 選第二張、兩次 Q 建立雙釘／雙線、再 E 產生一份 resolved；另提供每職一份對應 rejected（明確 reason）序列。所有 case 必須對 JSON round trip 後的 `replay()` **及**逐項 `replayHistory()` 比對，並直接斷言 history 出現目標 `resonanceResolved`／`resonanceRejected.reason` 與 `sealNail`／`returnLine`。

### 應修但不阻斷

- `classEffectResolved` 只有 target IDs，沒有鐵幕收束的 midpoint 或 from/to；目前可辨認卡片因果，後續 renderer/VFX 若需要重建收束軌跡，應擴充純資料事件，而非由畫面反推。

### 下一棒

Gameplay Engineer 僅需解除 **B2-06-R** 後再交 QA 複驗；通過前不可自動派發第三批。B2-04-R 已解除，但不代表 Gate 3、效能、平台或音訊門檻通過。

## 2026-08-04 第二批修正複驗（B2-04／B2-05／B2-06）

**結論：不放行第三批實作，亦不放行 Gate 3 或公開出貨。** B2-05 已通過；Q 槽與影線 E 槽的同槽疊合已實作並有白箱證據，但熔衛兩張 E 的「同時持有時各自可觀察」尚未形成可驗證契約。更關鍵的是 B2-06 的 crash dump 測試只記錄第一張第二批卡及一次 Q，沒有任何跨 Draft 的第二共鳴 resolved／rejected 序列；它不能證明實際構築重播。

### 本輪實際執行

| 項目 | 結果 | 證據 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify`：lint、core/app typecheck、Vitest **48 files / 349 tests**、production build 全綠；JavaScript gzip **50,129 / 65,536 bytes**。 |
| B2-04 Q 槽同槽卡 | 通過 | `class-content-slice.test.ts` 證明 `double-nail-seal + fire-hook` 的兩次 Q 同時保留首釘／第二釘且各次皆拉扯邊緣敵人；`double-line-return + gap-marking` 保留主線／折返線並保留標定。`combat.ts` 以組合布林管線取代舊互斥分支。 |
| B2-04 影線 E 槽同槽卡 | 通過 | `returning-rend + residual-collection` 同一次 E 到主線端點、造成回斬與殘切回收傷害，並清空殘切；測試斷言傷害大於單獨回斬的 13。 |
| B2-04 熔衛 E 槽同槽卡 | 未通過 | `pressure-furnace-roar + iron-curtain-recall` 各自有單卡測試，但沒有同時持有、同一次成功格擋的自動測試。程式僅為防區反震輸出 `resonanceResolved`；鐵幕回收沒有獨立事件／結果快照。其後會把已反震目標再改寫至中點，無法從最終 state 或事件區分兩張 E 都已兌現。 |
| B2-05 五項拒絕原因與同 tick | 通過 | `class-content-slice.test.ts` 逐一覆蓋 `熔鏈外`、`未受壓`、`未成功格擋`、`錯誤落點`、`無標定目標`，每個 fixture 都斷言同一共鳴不會同 tick `resonanceResolved`。 |
| B2-06 第二批 crash dump/replay | 未通過 | `crash-dump.test.ts` 只選 `double-nail-seal` 或 `double-line-return` 的 opening offer，經 130 個空 tick 後按一次 Q；沒有第二次 Q、沒有第二張 E 卡、沒有 `sealNail`／`returnLine`，也沒有任何第二共鳴的 resolved/rejected。JSON round trip 與逐 tick equality 因此只覆蓋單卡物件生成。 |
| 1.0 回歸 | 通過（現有範圍） | legacy recorder 仍輸出 `classId: null`，`replay()` 維持 null 路徑；完整既有 suite 隨 `pnpm verify` 通過。 |

### 阻斷第三批放行

1. **B2-04-R：熔衛兩張 E 尚無可分辨的共存驗收。**
   - 重現：建立固定 fixture，同時持有 `bulwark-hammer`、`pressure-furnace-roar`、`iron-curtain-recall`，在首釘防區內讓受壓敵人對玩家成功命中格擋並按 E。現有測試沒有此情境；`run.ts` 先輸出「防區反震」並清除受壓，再以舊 `nail.pressuredEnemyIds` 將相同敵人拉至中點，但不輸出「鐵幕回收」事件。
   - 修正要求：加入 typed、可重播且由 renderer 可採用的鐵幕回收事件（至少含 `targetIds`、from/to 或 midpoint），並以同 tick fixture 斷言兩條 E 均實際兌現、效果順序明定；另斷言任一前置失敗時不會留下互相矛盾的 resolved/rejected。

2. **B2-06-R：第二批 replay 未跨 Draft 重現真正共鳴。**
   - 重現：目前兩個 table case 都只 `forgeChoice` 一張卡、等待 130 tick、按 Q 一次；沒有方法從 dump 的 input log 得出第二條共鳴曾 armed、resolved 或 rejected。
   - 修正要求：兩職各提供一條固定 seed 的完整 input log，真的經過不同關後 Draft 選到兩張對應卡，並完成兩次 Q 產生雙釘／雙線；每職至少一份 resolved、一份 rejected dump。對 JSON round trip 後的 `replay()` 與 `replayHistory()` 逐項比對，並斷言歷史中出現正確的 `resonanceResolved` 或 `resonanceRejected.reason`。**需要跨 Draft 序列**：第二共鳴是多張卡構築，單次 opening Draft 無法驗證其選卡歷程、冷卻／物件壽命與重播一致性。

### 應修但不阻斷

- 為五個 rejected fixture 加一條通用 invariant：同 tick 不可對**同一 resonance**同時輸出 resolved 與 rejected；目前逐案已有斷言，抽象化可防新增分支遺漏。不同 resonance 的 resolved/rejected 可同 tick 共存，須明確視為不同因果，不能誤判為矛盾。

### 下一棒

Gameplay Engineer 先解除 B2-04-R 與 B2-06-R，再交 QA 複驗。完成前不可自動派發第三批；Gate 3 的真人、效能、平台與音訊門檻仍未開始。

## 2026-08-04 第二批六張卡與第二條共鳴唯讀稽核

### 自動驗證證據

| 項目 | 結果 | 證據 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify` 實際執行：lint、core/app typecheck、Vitest **48 files / 338 tests**、production build 全綠；JavaScript gzip **50,076 / 65,536 bytes**。 |
| 熔衛第二批 | 部分通過 | `heated-rotation` 在第三段、且位於爐釘 `<= 2.4` 範圍時才額外向外掃；`double-nail-seal` 第二次 Q 保留首釘並建立第二釘／熔鏈；`iron-curtain-recall` 僅在成功格擋後把仍在熔鏈上的受壓目標拉至兩釘中點。`class-content-slice.test.ts` 覆蓋追加掃環、第二釘與一次 `封口回收` resolved。 |
| 影線第二批 | 部分通過 | `crossed-sheath` 第三段側滑回斬，對已標定目標留下殘切；`gap-marking` Q 只標記線段上的目標、不造成傷害；`returning-rend` 沿主線到端點後只切狹窄回程線。測試覆蓋殘切、空線不傷害、一次 `折返處刑` resolved。 |
| 第二共鳴與拒絕事件 | 部分通過 | 型別與 `run.ts` 已列出熔衛 `缺少雙釘／熔鏈外／未受壓／未成功格擋`、影線 `缺少折返線／錯誤落點／無標定目標`；resolved 皆帶 class、共鳴名稱與 target IDs。現有測試只實際斷言 `缺少雙釘`、`缺少折返線`，其餘分支未有白箱或 replay 覆蓋。 |
| 決定性、crash dump、1.0 | 部分通過 | 既有 `createRecorder` classId dump/replay 與 legacy null-path 測試存在，整體 338 測試均過；但未用第二批卡的輸入序列驗證 Forgeguard 與 Shadowline 的逐 tick dump/replay，也未對第二共鳴做同 seed 對照。 |

### 阻斷出貨／阻斷第三批放行

1. **B2-04：同槽卡採互斥的 `if / else if` 優先序，違反已投資卡不應被替換為不可用版本的契約。**
   - 重現：在同一職業 Run 依序選 `double-line-return` 與 `gap-marking`，按 Q。`combat.ts` 永遠先進 `double-line-return` 分支，`gap-marking` 永不執行；選 `returning-rend` 後也會遮蔽已取得的 `residual-collection`。熔衛的 `pressure-furnace-roar`／`iron-curtain-recall` 則共用同一 E 行為，未形成可區分的卡片改寫。
   - 依據：Gate 2 規格 §5、§7.2「每張卡只改一槽」、「已投資的槽不得替換成無法使用的版本」；合法 `4/1/1`、`3/2/1`、`2/2/2` 構築必須仍讓每張取得卡保有可驗證效果。
   - 修正要求：將同槽卡組成明確、可疊合的 action pipeline，或在 Draft/規格上明確限制每槽只能有一張且重做供給與投資分配驗證；不可再以程式碼分支優先序靜默淘汰卡片。

### 應修但不阻斷

1. **B2-05：第二條共鳴的拒絕理由沒有逐一自動化。**
   - 重現：目前 `class-content-slice.test.ts` 只斷言 `封口回收: 缺少雙釘` 及 `折返處刑: 缺少折返線`；檢索其餘五個型別允許的 reason，沒有對應測試情境。
   - 修正要求：新增固定 seed／fixture，逐一覆蓋 `熔鏈外`、`未受壓`、`未成功格擋`、`錯誤落點`、`無標定目標`，且每例斷言不產生同 tick 的 `resonanceResolved`。
2. **B2-06：第二批效果沒有 crash dump 專屬重播。**
   - 重現：`crash-dump.test.ts` 只以 Forgeguard 選首張 Draft 再按一次 Q 驗證 classId；沒有選第二批卡、更沒有 Shadowline 或第二共鳴的逐 tick history。
   - 修正要求：以兩職各一個固定 seed 的完整輸入序列，涵蓋雙釘／雙線與 resolved、rejected 各一例，驗證 JSON round trip 後 `replay()` 與 `replayHistory()` 完全相同；另維持 1.0 null-path。

### 建議

- 在戰場畫面錄製前，為熔鏈、回程折返線、側滑回斬與回收中點補可視驗收截圖／render 測試；目前程式有繪製 `sealNail`／`returnLine`，但尚無混戰可讀性的實證。

### 本輪結論與下一棒

**不放行第三批實作，也不放行 Gate 3 或公開出貨。** 第二批的單卡基礎行為、成功事件、型別化拒絕理由及 1.0 全套回歸均有可查證證據，但 B2-04 會使同槽投資在實際構築中被靜默覆寫，直接破壞十二卡／六次 Draft 的核心承諾。請 Gameplay Engineer 先修復 B2-04，並一併補 B2-05、B2-06；QA 複驗通過後才能自動派發第三批六張卡。

- 日期：2026-08-04
- 稽核範圍：Gate 2 規格、無頭原型、A 可讀性地基的未提交變更，以及後續可玩切片的驗收交界。
- 結論（2026-08-04 runtime 複核）：**最小雙職業 runtime 流程通過；不放行 Gate 3、內容效果實作或公開出貨。** 職業選擇、固定 seed Draft 1／關後 Draft、六關與第六關 Boss、classId replay 已接入；24 張卡仍僅為資料與 Draft／共鳴追蹤，尚未改寫實戰幾何、時序或手感，不能誤報為可玩職業內容。

## 本輪實際執行

| 指令／證據 | 結果 | 判定 |
|---|---|---|
| `pnpm verify`（2026-08-04 複核） | **通過**：lint、兩組 typecheck、Vitest（46 files / 323 tests）、production build 均成功；gzip bundle `45,290 / 65,536 bytes`。 | 自動契約基線通過 |
| `sim/class-expansion-prototype.test.ts` | 已由 `verify` 實際執行：兩職各 12 卡、每槽 4 卡、六次 Draft 完成合法分配、同 seed 決定性、10,000 局供給／選取可達性；未宣稱勝率／難度。 | 結構驗證通過 |
| A 可讀性地基 | 工作樹含 `action-slot-content.ts`、HUD／Draft 徽章與首卡 focus 變更；它仍面對既有印記資料，尚未接入雙職業卡池。 | 可作為 B 的 UI 契約，不可宣稱 B 已可玩 |

## 2026-08-04 最小 runtime 複核

| 驗收項目 | 證據 | 結果 |
|---|---|---|
| 開局職業選擇 | `dungeon-main.ts` 提供熔衛／影線獵人二選一；選後以 `createGameLoop({ seed, classId })` 啟動。 | 通過（UI 接線） |
| Draft 1 與職業隔離 | `class-expansion.test.ts`：兩職同 seed 均先給 `{ primary, q, e }` 三欄，三張皆屬同一職業且未取得。 | 通過 |
| 關後 Draft 2–6 與第六關 Boss | `run.ts` 在 class run 清關後產生同職業 `classDraftOptions`；`encounterIndex === 5` 的 Boss 清除直接進 victory，無後續 Draft。既有六關 Boss regression 仍通過。 | 通過（流程契約） |
| HUD／Draft 追溯 | HUD 可顯示職業名稱與既有左鍵／Q／E／Space 槽位徽章；class draft 卡面顯示 slot、留下物、作用物與取捨。 | 部分通過：已選職業卡與 `resonanceLog` 尚未納入 HUD view model／戰場呈現，僅 core event 可追溯。 |
| `createRun(seed)` 1.0 回歸 | 無 `classId` 時維持既有 1.0 Draft／Forge 流程；完整六關自動流程與決定性測試維持通過。 | 通過 |
| crash dump `classId` | recorder dump 已記錄 `classId`，replay 以其重建 run；但既有 `crash-dump.test.ts` 尚未覆蓋職業 run。 | 實作通過；測試覆蓋缺口 |
| 自動驗證 | `pnpm verify`：lint、雙 typecheck、47 files／326 tests、production build 全數通過；gzip `47,680 / 65,536 bytes`。 | 通過 |

### 明確不放行項目

- **24 張卡的實戰幾何尚未實作。** 現行 combat 仍使用既有印記／forge 行為；class 卡只影響 Draft、選取紀錄與可用共鳴事件，未改寫左鍵、Q、E 的戰場效果。
- 共鳴目前是卡對完成時的資料事件，尚無防區、影線、殘切、反震或落點等中央視聽／命中結果；不可宣稱共鳴手感已驗收。
- class draft 按鈕為原生可 focus 的 button，但缺少「首張自動 focus」、Tab／Enter 行為的 runtime 測試，以及 A 的既有 Draft focus 管理接線。
- 真人理解、完整操作手感、60 秒效能、iframe／standalone、音訊辨識均未驗收。

### 下一交接

Gameplay／Visual 先把每職至少一條左鍵、Q、E 的基礎實戰幾何與一條可見共鳴接入 core／render；同時補 class crash-dump replay、六關 class 流程、HUD selected cards／resonance 與 Draft keyboard focus 的自動測試。完成後由 QA 進行 Gate 3 真人、效能、平台與音訊矩陣，不得直接發佈。

## 2026-08-04 第一批實戰內容切片 QA 複核

### 自動驗證證據

| 項目 | 結果 | 證據 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify`：lint、雙 typecheck、Vitest **48 files / 330 tests**、production build 全綠；gzip bundle **48,707 / 65,536 bytes**。 |
| 熔衛戰場物件與共鳴事件 | 通過（自動） | `class-content-slice.test.ts` 驗證引火鉤放下爐釘並拉動防區邊緣敵人；受壓敵人要在 E 架勢成功格擋後才觸發 `防區反震` 與 `resonanceResolved`。`dungeon-view.ts` 直接繪出爐釘、防區環與受壓敵環。 |
| 影線端點與共鳴事件 | 通過（自動） | 同測試驗證雙線終點為 4.3 單位、標記／殘切後 E 將角色送到該端點，並輸出 `線路收割`；`dungeon-view.ts` 繪出線身、端點環與殘切標記。 |
| 空 E | 部分通過 | 影線無線或無殘切時只輸出 `eFailed`，不移動、不消耗冷卻；HUD 可將 E 標記為 failed，音訊有 `skill-failed`。熔衛空 E 仍給短格擋窗與冷卻，這是明示風險，不是隱性收益。 |
| 1.0 回歸 | 通過（最小自動） | `class-content-slice.test.ts` 證明 legacy Q 不產生職業物件；完整既有 regression suite 隨 `pnpm verify` 通過。 |

### 未通過／阻斷 Gate 3 的項目

1. **熔衛離區／錯面向契約未被實作或測試。** `pressure-furnace-roar` 的 E 為全向短格擋；`run.ts` 只檢查「爐釘仍有受壓敵人」與 `playerBlocked`，沒有檢查玩家位於防區內或朝向爐釘。因此玩家可在防區外成功擋招，仍遠端觸發爐釘反震。這違反矩陣的「離區、錯面向不給隱性收益」目標；需 Gameplay 先決定是加入站位／朝向門檻，或把規格改為明確的全向遠端指揮並提供可見連線。QA 不接受目前狀態為已驗收。
2. **雙職業 HUD／Draft 未接線。** `buildHudViewModel()` 在 `classId !== null` 時仍只讀 1.0 的 `selectedMarks`、`draftOptions`，並令 `showDraft` 為 false；class run 的 `forgeOptions`、已選職業卡與 `resonanceLog` 不會在 HUD/Draft 顯示。雖然實戰物件已繪製，玩家無法在選牌時理解「哪一鍵會如何改變」或目前有哪些共鳴。這是 A 可讀性地基與 B 內容切片間的阻斷整合缺口。
3. **可見性仍只有程式碼／單元測試證據。** 目前沒有實機截圖／錄影或真人回報可確認混戰下爐釘環、影線端點、殘切標記與敵方預兆的層級；故不能以 `drawResources()` 存在就宣稱戰場可讀性通過。
4. **真人 Gate 3 尚未開始。** 首見理解、兩職手感、共鳴辨識、Space 脫離失誤、完整六次 Draft、60 秒效能、iframe/standalone 與音訊盲測均未取得真人／目標裝置證據，依規不得放行。

### QA 結論與下一棒

本切片可作為「第一批三槽實戰因果」的工程基線，**不放行 Gate 3、公開出貨或職業擴充完成宣稱**。先由 Gameplay/UX 處理上述兩個可自動驗證的阻斷項（熔衛站位／面向契約、class HUD/Draft 接線），再交 QA 補白箱測試；視覺與真人測試則在此後接棒。

下一批內容可平行規劃、但不應接入 runtime，直到阻斷項解除：

- 熔衛：`heated-rotation`（主手）、`double-nail-seal`（Q）、`iron-curtain-recall`（E），形成「雙防區 → 壓力累積 → 回收敵群」的第二條明確共鳴。
- 影線獵人：`crossed-sheath`（主手）、`gap-marking`（Q）、`returning-rend`（E），形成「標定線路 → 折返節點 → 回身割裂」的第二條明確共鳴。

以上兩組都必須附：空施放／錯朝向或錯落點、線端／防區離開、共鳴 resolved 與 missedReason、1.0 replay/crash dump 回歸測試。**目前 `resonanceResolved` 有成功事件但未形成通用 `missedReason` 事件，屬下一批實作前需要補的事件契約。**

### 仍阻斷出貨／Gate 2 runtime 放行

**B2-01（已解除）：自動驗證入口。** `pnpm verify` 已全綠，這一項不再阻斷後續切片。

**B2-02（仍阻斷）：尚無可玩 runtime 切片。** 目前的 `sim/` 是拋棄式純資料原型，沒有把職業選擇、六關流程、卡池、共鳴事件、HUD／Draft 預覽或輸入契約接進遊戲 runtime。

**B2-03（仍阻斷）：真人與目標裝置 Gate 尚未開始。** 勝率／難度、手感、60 秒效能、iframe／standalone 與音訊可辨識均需要可玩切片與實機證據，不能由無頭結構模擬替代。

## Gate 2 自動契約矩陣

| 契約 | 通過條件 | 證據／執行者 | 依賴與阻斷規則 |
|---|---|---|---|
| 內容結構 | 熔衛、影線獵人各 12 張具名卡；`primary/q/e` 各 4 張；唯一 ID；每張有非數值 `changes`、`tradeoff`、可見 `creates/consumes`。 | `validateClassExpansion()`、資料表測試；Balance | 修正 B2-01 後才可執行；任一缺項阻斷內容實作。 |
| 輸入與 Space | runtime 只接受既有移動、左鍵、Q、E、Space；Space 的距離／無敵／冷卻不因職業或卡改變。 | core input／bindings regression + 新職業 action contract；Gameplay + QA | 新增 code、連按或職業專屬鍵即阻斷。 |
| 職業隔離 | seed 固定時，開局 classId 決定全局；Draft、被動、共鳴與資源不跨職業。 | headless generated-run audit；Gameplay + Balance | 任一跨職業 cardId／被動即阻斷。 |
| Draft 合法性 | 六次固定三欄 `{primary,q,e}`，同卡一次；所有 `4/1/1`、`3/2/1`、`2/2/2` 排列皆 100% 可在六次完成；封頂欄不可給數值替代品。 | 10,000+ deterministic seeds，逐目標輸出 offer／pick／completion；Balance | 未達 100% 或無 `supplyReason` 即退回供給器。 |
| 共鳴因果 | 每職至少兩種不同合法構築可讓首發共鳴完成；每次輸出 `available/attempted/resolved/missedReason`，且結果可由前置物、行動與中央事件追溯。 | headless event sequence；Visual／Gameplay + QA | 僅以隱藏傷害倍率，或無 missed reason，均阻斷。 |
| 決定性與紅線 | 同 seed、技巧檔、draft policy 的選卡、事件、勝敗與 digest 完全一致；`core/` 不引 DOM、無 `Math.random()`、無直接 storage。 | replay tests + static checks，納入 `pnpm verify`；Gameplay + QA | 任一差異或硬紅線違反即阻斷。 |
| 職業差異（結構層） | 熔衛的 decision signature 以防區／格擋主導；影線獵人以線路／落點風險主導；不得只差 DPS。 | 原型輸出位置區域、E 理由、死亡原因與共鳴分類；Balance | 原型尚未量測勝率／難度，不能將結構通過誤報為平衡通過。 |

## 可玩切片驗收（等待 B runtime）

| 項目 | 通過條件 | 依賴 |
|---|---|---|
| 開局職業選擇 | 二選一後立即進 Draft 1；不增加按鍵；重開與同 seed 重播保持 classId／首輪供給一致。 | class selection、run state、replay dump。 |
| A 槽位可讀性 | HUD、Draft 卡與重綁後顯示同一組左鍵／Q／E 徽章與實際鍵位；卡片聚焦時高亮受影響槽；Tab 可巡覽、Enter 可確認、首次可用卡自動 focus。 | A 工作樹變更提交後，接入新 card schema。 |
| 熔衛中央語彙 | 爐釘／防區／受壓／格擋／反震均可在戰場中央看到；錯面向、離區、空 E 不給隱性收益。 | Visual language、combat events、audio cues。 |
| 影線中央語彙 | 線端／壽命／標記／殘切／E 落點與暴露風險均可見；沒有線的 E 失敗理由可辨識。 | Visual language、combat events、audio cues。 |
| Draft 演示 | 每張卡在選擇前提供約三秒 before/after、可見觸發物與一句取捨；不靠長文或 HUD 才能理解共鳴。 | content presentation、preview harness。 |
| 六關流程 | Draft 1 + 關後 Draft 2–6 + 第 6 關 Boss；第 6 關後不再選卡；完整 run 可保留選卡與事件記錄。 | encounters、Boss、run flow、replay. |

## 真人 Gate 3（不得由自動化替代）

| 問題 | 通過條件 | 樣本／紀錄 |
|---|---|---|
| 首見理解 | 未讀長文的玩家可說出熔衛「守防區、讀格擋」與影線「先布線、承擔落點」；能說出卡改哪個鍵。 | 每職至少 5 位新玩家；記錄錯答與所需提示。 |
| 手感差異 | 熔衛被感知為慢拍守點而非站樁；影線獵人為高速自主位移而非失控滑行。 | 每職各至少 3 次完整或至 Boss 的操作訪談。 |
| 共鳴可讀 | 玩家能在混戰中說明「留下什麼 → 哪一鍵作用 → 結果」，不是只看 HUD。 | 每職至少兩條共鳴、每條至少 3 次嘗試。 |
| 失誤與 Space | 兩職皆可用共用 Space 脫離失誤；不存在以職業卡暗改 Space 的體感／數值。 | 以錄影與 input/replay 對照；失敗需附 seed。 |
| 完整流程 | 真人完成開局至 Boss、六次 Draft，無阻塞、無 console error。 | 依既有 Gate 3 報告的完整流程紀錄格式。 |

## 效能、平台與音訊 Gate

| 面向 | 通過條件 | 依賴／證據 |
|---|---|---|
| 效能 | 目標裝置 Chrome DevTools 至少 60 秒，涵蓋混合波次、雙線／雙釘、殘切／反震與 Boss summon；報告平均與 P95 frame time。現有 bundle 上限 65,536 gzip 仍需通過。 | B runtime、目標硬體、Performance trace；自動 rAF 不是 compositor 證據。 |
| 平台／standalone | standalone 與 iframe 皆可載入；handshake／storage namespace 契約、首次 iframe focus、blur／hidden／pointercancel 清 held state、1280×720 無滾動、reload console 0 error。 | platform-sdk contract fixture、真實 Chromium。 |
| 音訊 | 使用者互動後才啟動；music/effects/UI 分組、總靜音且視覺仍可玩；人耳盲測可辨熔衛格擋／反震、影線建立／疾行／殘切，並不與敵人預兆混淆。 | Audio event map、真實 Web Audio smoke、至少 5 人盲測與混淆矩陣。 |

## 交接與放行順序

1. **Balance** 已解除 B2-01：提供全綠 `pnpm verify` 與 10,000 局結構報表；本輪不含 runtime/content 接線。
2. **QA** 已複核自動契約，結案為「設計＋結構驗證完成，等待 runtime 切片」；僅放行開始 B 可玩切片實作，不放行出貨或手感結論。
3. **Gameplay／Visual／Audio** 下一個可交付物：可固定 seed 的雙職業 vertical slice，必須含開局職業選擇、Draft 1＋關後 Draft 2–6、第 6 關 Boss、職業隔離、可追溯共鳴事件，以及接入 A 槽位徽章／鍵盤焦點的 HUD 與 Draft preview。
4. **QA + 人類試玩** 依本矩陣執行真人、效能、平台、音訊 Gate；所有失敗附 seed、輸入、裝置／瀏覽器版本與重現步驟。

在 B2-02、B2-03、真人、目標裝置效能與人耳盲測全部完成前，版本維持 `1.0.0` 公開版，不得標示為雙職業擴充已放行或可發佈。

## 2026-08-04 第一批修正複驗：反震門檻與 HUD ViewModel

本節覆蓋前述「第一批實戰內容切片」的兩個自動化阻斷項；本節結論取代該兩項的舊狀態，**不取代 Gate 3 的真人、效能、平台與音訊要求**。

| 驗收項目 | 結果 | 直接證據 |
|---|---|---|
| 防區內門檻 | 通過 | `run.ts` 僅在角色至爐釘距離 `<= 2.4` 時可進入 resolved 分支；否則輸出 `resonanceRejected: 防區外`。 |
| 面向爐釘門檻 | 通過 | `run.ts` 以玩家 facing 與「玩家 → 爐釘」向量內積 `>= 0.6` 作門檻；失敗輸出 `未面向爐釘`。`class-content-slice.test.ts` 已覆蓋。 |
| 受壓目標門檻 | 通過 | 僅保留仍存活、仍列於 `forgeNail.pressuredEnemyIds` 的目標；空集合輸出 `未受壓`。 |
| 成功格擋門檻 | 通過 | 僅 `enemyResult.events` 含 `playerBlocked` 時可 resolved；否則輸出 `未成功格擋`。 |
| 拒絕原因可追溯 | 通過 | `GameEvent` 以可辨識聯集明定四個 `resonanceRejected.reason` 值；每個拒絕分支都不會產生 `resonanceResolved`。 |
| 職業 Draft／已選卡／共鳴摘要 | 通過（ViewModel 契約） | `HudViewModel` 新增 `showClassDraft`、`classDraftCards`、`resonanceLog`；`buildHudViewModel()` 從 `forgeOptions`、`selectedClassCards`、`resonanceLog` 映射。`hud-view.test.ts` 驗證三槽徽章、已選左鍵卡、共鳴摘要及 1.0 Draft 隔離。 |
| 1.0 路徑回歸 | 通過 | `classId === null` 仍使用既有 `showDraft`／印記卡映射；`class-content-slice.test.ts` 驗證 legacy Q 不建立職業物件；完整既有測試隨驗證鏈通過。 |
| 完整自動驗證 | 通過 | `pnpm verify`：lint、core/app typecheck、Vitest **48 files / 333 tests**、production build 全綠；JS gzip **49,102 / 65,536 bytes**。 |

### 放行決定

**放行第二批六張卡的實作**：第一批阻斷的核心反震契約、資料可追溯性、HUD ViewModel 接線與 1.0 回歸均已通過。

此放行只允許接入下列第二條職業鏈，不允許公開發佈或跳過 Gate 3：

- 熔衛：`heated-rotation`、`double-nail-seal`、`iron-curtain-recall`。
- 影線獵人：`crossed-sheath`、`gap-marking`、`returning-rend`。

第二批必須新增每張卡的命中／空施放契約、第二條共鳴的 `resolved` 與可追溯拒絕原因、1.0 replay/crash-dump 回歸；其後才可重新申請 QA 的 Gate 3 切片驗收。

## 2026-08-04 Gate 3 前全卡稽核（24 卡／8 共鳴）

**結論：不放行平衡、效能、音訊、平台 QA 或 Gate 3 試玩。** 本輪只讀稽核，未修改遊戲程式、未 commit／push／deploy。24 張具名卡都已登錄至 runtime，且不再是純數值資料；然而同槽管線、最後一批 replay，以及玩家選牌理解仍有可重現的阻斷。

### 實際驗證

| 項目 | 結果 | 證據 |
|---|---|---|
| 唯一驗證入口 | 通過 | `pnpm verify`：lint、兩組 typecheck、Vitest **48 files / 382 tests**、production build 均成功；JS gzip **52,727 / 65,536 bytes**。 |
| 卡池、職業隔離與 Draft 資料 | 通過 | `class-expansion.ts` 有熔衛、影線各 12 張（每槽 4 張）；`class-expansion`／prototype 測試與 `verify` 通過。 |
| 24 卡的 runtime 接線 | 通過（白箱） | `combat.ts` 的 `hasClassCard()` 分支涵蓋卡池所有 24 個 ID；每張均改變幾何、位置、路徑、前置物或時序，而非只有傷害／冷卻數字。 |
| 中央可見物與 renderer | 部分通過 | `dungeon-view.ts` 繪製防區／弧牆／雙釘熔鏈／楔點／轉掃／火索／鎖鏈／影線／弧線／吊點／殘切／回走線／借位線；`dungeon-view.test.ts` 目前只直接驗證 `pivotSweepVisualCue`，其餘新物件尚無逐一 render fixture。 |
| typed 成功／失敗因果 | 部分通過 | `GameEvent` 有 13 個具名 `classEffectResolved` 聯集與 8 條共鳴的 typed `resolved/rejected`；但壁壘重錘、灼鐵回旋、斷影追步、交錯收刀、雙釘封口、引火鉤、環鑄界線、獵隙標定、回身割裂等仍只靠通用 `comboHit`／`qCast` 或 state 物件觀察，沒有卡 ID 的成功事件。 |
| fixed-seed crash dump／1.0 null path | 部分通過 | 第一至三條共鳴皆有跨 Draft `replay()`／`replayHistory()` 證據；第四批僅重播了回爐移釘與環扣索的 Q，尚未真實重播兩職第四條共鳴。legacy `classId: null` replay 仍由 `crash-dump.test.ts` 覆蓋。 |

### 24 張卡盤點

| 職業／槽 | 卡片 | 非純數值 runtime 結果 | 現有可觀察證據 |
|---|---|---|---|
| 熔衛／左鍵 | 壁壘重錘、灼鐵回旋、定錨回擊、裂盾楔擊 | 半圓壓力／防區旋環、火索後撤、裂盾點與面向鎖定 | 受壓環、火索、楔點與轉掃 renderer；定錨／楔擊有 typed effect；前兩者僅 state／通用命中。 |
| 熔衛／Q | 雙釘封口、引火鉤、環鑄界線、回爐移釘 | 熔鏈、邊緣拉扯、缺口弧牆、移釘並熄滅舊防區 | 雙釘／弧牆 renderer；移釘有 typed effect；其餘以 world state／Q 為證。 |
| 熔衛／E | 反壓爐鳴、鐵幕回收、守角轉軸、熔鎖退讓 | 爐釘反震、收束、轉掃、退回爐釘鎖線 | 4 者皆有 typed result 或共鳴／renderer path；空按的格擋風險與共鳴 rejected 已有 fixture。 |
| 影線／左鍵 | 交錯收刀、斷影追步、縫影折角、釘身換位 | 側滑殘切、標記追步、沿線折角、和標記敵換位 | 殘切／影線 renderer；折角與換位有 typed effect；前兩者只靠 state／通用命中。 |
| 影線／Q | 雙線折返、獵隙標定、環扣索、逆標吊點 | 第二折返線、窄幅標定、弧線、移動吊點 | 線、端點、弧線、吊點 renderer；環扣／吊點有 typed effect；前兩者只靠 state／Q。 |
| 影線／E | 回身割裂、殘切回收、斷端落刃、跨線借位 | 回斬、殘切收割、落刃回走線、跨線端點跳躍 | 回走／借位 renderer；落刃／借位有 typed effect，殘切有共鳴事件，回身割裂仍只以傷害／E state 觀察。 |

規格 §6 的首發共鳴實際為**每職四條**，不是每職兩條：熔衛的「防區反震／封口回收／楔點轉掃／錨索退讓」，影線的「線路收割／折返處刑／吊點脫身／交線換身」。`resonanceFor()` 與 `GameEvent` 已逐條列出；前六條已具跨 Draft resolved／rejected replay，末兩條僅單元 fixture，見 B4-02。

### 阻斷 Gate 3 前的工程項目

1. **B4-01：環扣索靜默關閉雙線折返，違反同槽多卡不取代契約。**
   - 重現：在影線 Run 同時取得 `double-line-return` 與 `loop-tether` 後按 Q。`combat.ts` 設定 `hasDoubleLine = hasClassCard('double-line-return') && !hasLoopTether`；只要有環扣索，雙線永久失效、第二次 Q 會覆蓋主線而非留下 `returnLine`。
   - 依據：Gate 2 規格 §5、§7.2 的「每張取得卡保有可驗證效果」與本輪同槽全量稽核範圍。
   - 修正要求：讓弧線與雙線可組成同一 pipeline（例如兩條皆為弧線或保留一條弧線＋一條折返線），或以明示的 Draft 不相容規則重做供給／投資可達性；不能以 boolean 優先序靜默禁用已選卡。補固定 seed 跨 Draft replay。

2. **B4-02：第四條共鳴沒有完整的 fixed-seed 跨 Draft crash-dump resolved/rejected 證據。**
   - 重現：`crash-dump.test.ts` 最後一例只斷言 `reforge-relocation` 的 Q 與 `loop-tether` 的 Q，沒有以 `anchored-riposte + molten-lock-retreat` 產生「錨索退讓」，也沒有以 `pinned-body-swap + cross-line-borrow` 產生「交線換身」。
   - 依據：Gate 2 規格 §3 決定性、§6 共鳴因果；本任務要求兩職跨 Draft fixed-seed replay／crash dump 覆蓋最後批與既有批。
   - 修正要求：兩職各以真實清關／Draft、真實輸入產生 resolved 及至少一個 typed rejected；JSON round-trip 後逐項比對 `replay()`、`replayHistory()` 和手動 tick history，斷言火索／鎖線、換位殘切／第二線等前置物都出現在歷史中。

3. **B4-03：職業 Draft 缺少規格要求的 before/after 演示與自動焦點契約。**
   - 重現：`dungeon-main.ts#updateClassDraft()` 只輸出「留下／作用／取捨」文字，沒有約三秒的戰場 before/after demo；每次 update 亦 `replaceChildren()`，沒有對第一張可選卡呼叫 `focus()`。原生 button 僅提供 Tab／Enter，不能替代首次自動 focus。現有測試只測 `HudViewModel`，無 DOM/runtime test。
   - 依據：Gate 2 規格 §5、§7.2 及可玩切片的 A 槽位可讀性契約。
   - 修正要求：每張職業卡提供可重播的短示範／可見觸發物，並在 Draft 開啟時只 focus 首張一次；補鍵盤與內容對應測試。

### 應修但不阻斷

1. **B4-04：11 張卡沒有 card-ID 的成功事件。** 目前仍可由 state／renderer 推論其結算，但 replay、HUD 或音訊無法精確判斷「哪一張已選卡剛剛兌現」。建議擴充 typed event，或為每張 state 物件建立明確 renderer fixture；不應把通用 `qCast`／`comboHit` 當成完整的 per-card 成功證據。
2. **B4-05：renderer regression 覆蓋不足。** 已存在世界繪製程式，但只對轉掃建立直接 visual cue test；為防混戰層級退化，應補雙釘熔鏈、吊點／回走、火索／鎖鏈與跨線借位的 deterministic render fixture 或截圖比對。

### 放行判定

- **平衡：不放行。** B4-01 會使合法構築中的卡失效，任何數值結論均不可信。
- **效能、音訊、平台：不放行。** 應先確立完整可玩的卡面理解與最後兩條可重播共鳴，再量測真實切片。
- **Gate 3／公開出貨：不放行。** 真人不可替代的試玩尚未開始，且 B4-01～B4-03 未解除。
