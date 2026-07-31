# 《餘燼決鬥場》視覺風格指南

狀態：`implemented`（對應 `design/visual-proposals.md` §7.2 定案的提案一・巨像素微縮舞台）
維護者：Visual Director
日期：2026-07-31

## 這份文件解決什麼

`agents/visual/AGENT.md` 的完成判準是「`style-guide.md` 中的規則具體到可被檢查」。本文件的每一條規則都：

1. 給出可被檢查的具體數值或型別限制，不使用「深邃神秘」這類無法驗證的形容詞。
2. 標明**能不能寫成自動檢查**（`可執行 / 不可執行`），呼應工作室憲章「可執行的規範優於文字規範」。
3. 指到對應的原始碼與測試檔案，讓下一個接手的人（不管是不是同一個模型）能直接去看程式碼確認規則仍然成立。

所有規則的真實色值與型別定義只有一份正本：`src/visual/color.ts`、`src/visual/world-grid.ts`、`src/visual/world-layer.ts`、`src/visual/judgment-layer.ts`。本文件描述規則，不重複定義數值。

## 1. 解析度與縮放

| 規則 | 可執行？ | 檢查方式 |
|---|---|---|
| 世界層內部解析度固定 160×90 | **可執行** | `src/visual/world-grid.ts` 的 `WORLD_GRID_WIDTH`/`WORLD_GRID_HEIGHT` 常數；`world-grid.test.ts` 斷言其值與 `SCREEN_WIDTH === WORLD_GRID_WIDTH * WORLD_SCALE === 1280`、`SCREEN_HEIGHT === 720` |
| 整數放大倍率固定 8×，兩軸相同（避免非等比縮放形變） | **可執行** | 同上，`WORLD_SCALE === 8` 且用同一個常數乘兩軸，型別上不存在「x 軸倍率」「y 軸倍率」分開設定的介面 |
| 世界層畫布輸出一律 nearest-neighbor 縮放，不做旋轉、不做非整數縮放 | **不可執行（純文件）** | 這是 canvas 元素的 CSS/`imageSmoothingEnabled` 設定慣例，不是資料層面的東西，無法從 `src/visual/` 的純函式測試中驗證；`src/render/main.ts` 建立世界層 canvas 時必須設定 `image-rendering: pixelated` 與 `ctx.imageSmoothingEnabled = false`，且不得對世界層 canvas 呼叫 `ctx.rotate()` 或非整數 `ctx.scale()`。**待辦**：若之後把世界層畫布的建立搬進 `src/render/`，應在該處補一個「檢查 canvas style 屬性」的整合測試，把這條從不可執行升級為可執行。 |
| 世界層座標一律量化為整數格點，不允許次像素移動 | **可執行（型別 + 測試雙重）** | `world-grid.ts` 的 `WorldCell` 是品牌型別，只能由 `toWorldCell()` 建構；`worldRect()` 等世界層繪圖 API 只接受 `WorldCell`，傳入未量化的 `{x,y:number}` 物件字面值會被 `tsc` 拒絕（見下方「反向驗證紀錄」）。`world-grid.test.ts` 額外驗證次像素輸入確實被四捨五入為整數。 |
| 判定／回饋層允許次像素移動與反鋸齒 | **可執行（型別）** | `src/visual/screen-point.ts` 的 `ScreenPoint` 不做整數量化，`judgment-layer.ts` 的繪圖 API 一律吃 `ScreenPoint`／形狀幾何，不吃 `WorldCell` |

## 2. 色彩系統

色彩分兩個型別命名空間，定義在 `src/visual/color.ts`：

- `SchoolColor`（流派色）：`SCHOOL_COLORS.ember` / `.shadow` / `.guard` / `.guardFullStackRim`
- `EnemyTelegraphColor`（敵人預兆色）：`ENEMY_TELEGRAPH_COLORS.warningRed` / `.chargeBlue` / `.summonGreen` / `.sentinelWhite` / `.assassinDark`
- `NeutralColor`（場景中性色）：`NEUTRAL_COLORS.obsidianFloor` / `.duskStone`

| 規則 | 可執行？ | 檢查方式 |
|---|---|---|
| 流派色與敵人預兆色是不同的品牌型別，不得互相傳給對方的 API | **可執行（型別）** | 三個型別各自用 `unique symbol` 品牌；`judgment-layer.ts` 的 `schoolEffect()` 參數型別是 `SchoolColor`，`enemyTelegraph()` 參數型別是 `EnemyTelegraphColor`，把後者傳給前者會被 `tsc` 拒絕（見下方反向驗證） |
| 五個固定色值不得被美術方向自由調整（語意來自 `content/enemies.json` 與決策紀錄） | **可執行** | `color.test.ts`「固定值回歸」區塊逐一斷言 hex 值 |
| 背景／環境中性色的 HSL 飽和度上限 20% | **可執行** | `color.ts` 的 `hexToHsl()`；`color.test.ts` 斷言 `obsidianFloor`／`duskStone` 的 `saturation ≤ 0.2`（實測 14.3% / 17.2%） |
| 裂焰琥珀橙與警戒紅的色相距離 ≥ 20 度（避免玩家把自己的核心特效誤認成敵方紅圈預兆） | **可執行** | `color.ts` 的 `hueDistance()`；`color.test.ts` 斷言距離 ≥ 20（實測 30.93 度） |
| 守勢鋼青藍的飽和度需低於衝撞藍至少 30 個百分點（用「鋼」的低飽和取代色相區隔——兩者色相本身只差約 16 度，色相區隔不足以避免撞色，飽和度落差才是真正的區隔訊號） | **可執行** | `color.test.ts` 斷言 `chargeBlue.saturation − guard.saturation ≥ 0.3`（實測落差 45.0pp） |
| 影步藍紫與影刺客暗色（`assassinDark`）不需要額外規則 | 不適用 | 兩者明度相差 57.4 個百分點（68.0% vs 10.6%），已天然區隔，`design/visual-proposals.md` §3 也未列此組合為衝突點 |

### 誠實揭露：守勢鋼青藍 vs 衝撞藍的色相距離其實很近

計算後守勢鋼青藍（`#5C8FAE`，色相 202.7°）與衝撞藍（`#2E6FE6`，色相 218.8°）只相距約 16 度，**不滿足**「色相距離 ≥ 20 度」這條對裂焰有效的規則。這不是實作疏漏，而是`design/visual-proposals.md` §3 本身已經預期到的情況：色相區隔只是雙軸編碼裡的其中一軸，另一軸是「地面 vs 角色」「硬邊 vs 柔邊」的錨點與邊緣風格區隔（見下方〈判定層的雙重區隔〉）。因此這裡改用飽和度落差作為守勢的可檢查區隔訊號，而不是勉強放寬色相門檻去湊出一條實際上守不住的規則。

## 3. 雙層渲染架構

世界層（`world-layer.ts`）與判定層（`judgment-layer.ts`）在型別上就是兩個不相容的座標系統，不是命名慣例：

| 規則 | 可執行？ | 檢查方式 |
|---|---|---|
| 世界層繪圖 API 只接受 `WorldCell`，不接受任何未經 `toWorldCell()` 量化的座標 | **可執行（型別）** | 見上方「解析度與縮放」表；`world-layer.test.ts` |
| 判定層繪圖 API 只接受 `ScreenPoint` 或以 `ScreenPoint` 組成的形狀幾何，允許次像素 | **可執行（型別）** | `judgment-layer.ts`、`shapes/*.ts` 全部以 `ScreenPoint` 為座標單位 |
| 世界層調色盤只能是 `NeutralColor \| SchoolColor`（`WorldColor`），不含敵人預兆色 | **可執行（型別）** | `world-layer.ts` 的 `WorldColor` 型別定義；敵人預兆需要精確幾何（同 120° 扇形在粗網格上會被誤判的理由），固定畫在判定層 |
| 判定層調色盤是 `SchoolColor \| EnemyTelegraphColor`（`JudgmentColor`） | **可執行（型別）** | `judgment-layer.ts` 的 `JudgmentColor` 型別定義 |

### 判定層的雙重區隔（地面 vs 角色、硬邊 vs 柔邊）

`design/visual-proposals.md` §3 規則 2 要求敵人預兆固定「投影在地面的硬邊幾何」、玩家流派特效固定「附著在角色本體或武器上」。這條規則沒有留給呼叫端自由選擇——`judgment-layer.ts` 只暴露兩個建構子：

- `enemyTelegraph(geometry, color: EnemyTelegraphColor)` → 固定回傳 `anchor: 'ground', edge: 'hard'`
- `schoolEffect(geometry, color: SchoolColor)` → 固定回傳 `anchor: 'character', edge: 'soft'`

沒有第三個「自訂 anchor/edge」的建構子，因此不可能組出「敵人預兆但用柔邊」或「流派特效但錨在地面」這種違規組合。

| 規則 | 可執行？ | 檢查方式 |
|---|---|---|
| 敵人預兆固定 `anchor='ground'`、`edge='hard'`，只能用 `EnemyTelegraphColor` | **可執行（型別 + 測試）** | `judgment-layer.ts` 的 `enemyTelegraph()`；`judgment-layer.test.ts` |
| 流派特效固定 `anchor='character'`、`edge='soft'`，只能用 `SchoolColor` | **可執行（型別 + 測試）** | `judgment-layer.ts` 的 `schoolEffect()`；`judgment-layer.test.ts` |

## 4. 形狀語彙（提案一 §形狀語彙，四種皆可獨立測試）

| 形狀 | 對應模組 | 幾何正確性規則 | 可執行？ |
|---|---|---|---|
| 弧線殘跡（餘燼核心閃避路徑） | `src/visual/shapes/arc-trail.ts` | 無武裝核心時取樣點與起訖點共線（跨積為 0）；有核心時曲線中點必須比直線中點更靠近 `bendTarget`；起訖點精確等於輸入值 | **可執行**，見 `arc-trail.test.ts` |
| 120° 扇形（裂焰連擊） | `src/visual/shapes/cone.ts` | 邊界角度（`facing ± half`）本身算在扇形內；超出邊界即使只有 0.001 度也判定為外；面朝角度跨越 0/360 環狀邊界時仍正確 | **可執行**，見 `cone.test.ts`；已完成反向驗證（見下方） |
| 殘影（精準殘影／影步） | `src/visual/shapes/afterimage.ts` | 不透明度隨經過時間連續衰減：`t=0` 時為 1，`t=durationS` 時為 0，中點為線性內插值，且全程單調遞減 | **可執行**，見 `afterimage.test.ts` |
| 格擋尾段光環（蓄能反震 0.15 秒） | `src/visual/shapes/parry-halo.ts` | 三段式演出「亮起→撐開→收回」：起訖時刻半徑均為基準值 1，撐開階段結尾（2/3 時刻）半徑達峰值 1.6；中段半徑嚴格大於起訖值，證明真的有「外擴一圈再收回」 | **可執行**，見 `parry-halo.test.ts` |

## 5. 視覺隨機

| 規則 | 可執行？ | 檢查方式 |
|---|---|---|
| 視覺隨機一律用 `@rogue-paradise/rng` 的 `fork()` 子 stream，禁止 `Math.random()` | **可執行（ESLint + 測試雙重）** | `eslint.config.js` 的 `no-restricted-properties`（工作室硬紅線，`pnpm lint` 擋）；`src/visual/particles.ts` 的 `shatterParticles()` 吃呼叫端已 fork 好的 `Rng`；`particles.test.ts` 驗證同 seed 的兩個獨立 fork 產生完全相同序列（決定性），不同 seed 產生不同序列 |

## 6. 反向驗證紀錄

以下規則已依工作室慣例（`knowledge/verifying-executable-rules.md`）故意違反過一次，確認真的會被擋下，再改回正確版本。完整指令輸出見 `/Users/samuellin/RogueParadise/.superpowers/sdd/embers-duel-visual-impl-report.md`：

1. **世界層拒絕次像素座標**：故意用 `worldRect({x:1.5,y:2.5}, ...)`（未經 `toWorldCell()`）呼叫世界層 API → `tsc` 報 `TS2345: Property '[worldCellBrand]' is missing`。
2. **流派色／敵人預兆色不得互換**：故意把 `ENEMY_TELEGRAPH_COLORS.warningRed` 傳給 `schoolEffect()` → `tsc` 報 `TS2345: Property '[schoolColorBrand]' is missing`。
3. **禁止 `Math.random()`**：故意在 `particles.ts` 加入 `Math.random()` → `pnpm lint` 報 `no-restricted-properties` 錯誤。
4. **背景飽和度上限 20%**：故意把 `obsidianFloor` 改成 `#FF0000`（飽和度 100%）→ `color.test.ts` 兩條斷言失敗（固定值回歸、飽和度上限）。
5. **120° 扇形角度邊界**：故意把 `isAngleWithinCone` 的 half-angle 算錯（誤用整個 `totalAngleDegrees` 而非其一半）→ `cone.test.ts` 兩條測試失敗，證明測試真的在檢查角度數學而非恆真斷言。

## 7. 尚未涵蓋、留給後續的部分

- HUD／UI 文字色（`theme.ts` 的 `foreground`）不在本次決策範圍內，維持既有佔位值，待後續 UI 規格定案再補規則。
- 世界層 canvas 的 CSS `image-rendering: pixelated` 與 `imageSmoothingEnabled = false` 設定，目前只有文件規則、沒有自動檢查（見上方「解析度與縮放」表的待辦），因為世界層 canvas 尚未在 `src/render/` 建立。等 canvas 建立程式碼落地後，應補一條檢查其 style/屬性的整合測試。
- 敵人三種輪廓比例（焰奴矮胖、影刺客瘦長、甲衛方正厚重）與角色剪影造型本身，屬於世界層繪製內容而非規則系統，本次未實作角色/敵人的具體剪影繪製，留給後續依 `content/enemies.json` 逐一實作。
