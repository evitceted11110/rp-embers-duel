# `src/input/` 給下一位接手渲染層／遊戲迴圈的 Gameplay Engineer

本層的職責：把「鍵盤/滑鼠現在的物理狀態」轉成 `src/core/` 期待的 `TickInput`
（見 `src/core/README.md` 第 2 節），並提供可重綁、有衝突處理、有版本化保存的
鍵位系統。**這個檔案沒有建立遊戲迴圈**——`src/render/main.ts` 目前仍是上一位
工程師留下的佔位頁面，把它接上 accumulator + `tick()` 的完整迴圈是下一位的工作，
不是本次任務範圍。

## 1. 每個 tick 該怎麼呼叫

```ts
import { createInputController } from '../input/index.js'
import { defaultBindingsState, BINDINGS_CONFIG, loadBindings } from '../input/index.js'

const bindings = await loadBindings(sdk, BINDINGS_CONFIG) // sdk 是 connect() 回傳的 PlatformSdk
const inputController = createInputController({ bindings })

// 遊戲迴圈裡，每次要呼叫 core 的 tick() 之前：
const tickInput = inputController.buildTickInput(state.phase)
state = tick(state, tickInput)
```

`buildTickInput(phase)` 每呼叫一次就會：
- 讀目前按住的鍵盤/滑鼠鍵，轉成 `moveX`/`moveY`/`attack`/`dodge`/`skillQ`/`skillE`。
- 若 `phase !== 'draft'`，`draftChoice` 強制為 `null`；否則透出上一次
  `submitDraftChoice()` 設定的值，**且只透出一次**（下一次呼叫就歸零）。
- 讀切片專用的快速重開鍵（固定 `KeyR`，見 `controller.ts` 的 `RESTART_CODE`，
  不走可重綁系統——`content/bindings.json` 沒有定義它，因為這不是正式遊戲動作）。

三選一畫面（`state.phase === 'draft'`）：畫三張卡片，玩家點選時呼叫
`inputController.submitDraftChoice(markId)`，不需要自己管理 tick 邊界——控制器會在
下一次 `buildTickInput('draft')` 帶上它。

遊戲卸載或熱重載時記得呼叫 `inputController.dispose()`，否則監聽器會殘留。

## 2. 重綁 UI

`mountRebindPanel(container, inputController, sdk)`（`rebind-panel.ts`）是一個
刻意最小化的設定面板：文字列表 + 按鈕 + `window.prompt` 處理衝突。掛載方式：

```ts
import { mountRebindPanel } from '../input/index.js'

const panel = mountRebindPanel(settingsContainer, inputController, sdk)
// 關閉設定畫面時：panel.dispose()
```

這個檔案本身沒有測試（見檔案頂端註解說明理由：所有邏輯都在 `bindings.ts` /
`settings-storage.ts`，兩者都有完整測試）。如果 Gate 3 回饋需要更好看的重綁畫面，
換掉這個檔案即可，不影響下面任何邏輯層。

## 3. 存檔

`loadBindings`/`saveBindings`（`settings-storage.ts`）一律透過
`sdk.storage.get/set`（`@rogue-paradise/platform-sdk`），**不是** `localStorage`。
保存的是版本化的 JSON（`{ schemaVersion, primaries }`）；任何讀取失敗、版本不符、
或個別動作綁到後來變成禁綁鍵的情況，都會**逐動作**退回該動作的預設鍵，不是整包
放棄使用者的其他自訂設定。

## 4. 純函式 vs 副作用

| 檔案 | 性質 | 說明 |
|---|---|---|
| `bindings.ts` | 純函式 | 讀 `content/bindings.json`、綁定狀態、衝突偵測與處置（swap/override/cancel）、禁綁鍵驗證 |
| `input-state.ts` | 純函式 | held 狀態 -> `ActionStates` -> `TickInput` |
| `settings-storage.ts` | 混合 | 序列化/還原是純函式；`loadBindings`/`saveBindings` 是唯一碰 `sdk.storage` 的地方 |
| `controller.ts` | 副作用薄殼 | 掛 `addEventListener`（keydown/keyup/mousedown/mouseup/blur/pointercancel/visibilitychange），維護 held 集合 |
| `rebind-panel.ts` | 副作用薄殼，無測試 | 純 DOM 重綁面板 |

`controller.ts` 不直接依賴真實 DOM 型別（`Window`/`Document`），而是宣告
`InputWindowLike`/`InputDocumentLike` 兩個最小介面（沿用
`@rogue-paradise/platform-sdk` 的 `BrowserEnvironment` 慣例）。這讓
`controller.test.ts` 可以用純物件假環境測試 blur/visibilitychange/pointercancel
清空邏輯，不需要 jsdom（本專案未安裝，且硬規定不新增相依套件）。正式環境下
`createInputController({ bindings })` 不傳 `window`/`document` 時會退回
`globalThis`（強制轉型），跟 `platform-sdk` 的 `connect()` 做法一致。

## 5. 已知的設計決定（非規格明文，工程判斷）

- **moveY 正負號**：`W`（上）= `-1`，`S`（下）= `+1`——採螢幕座標慣例（y 向下為正，
  對應 `src/visual/world-grid.ts` 左上原點的整數格點量化）。`content/bindings.json`
  與 `src/core/README.md` 都沒有明講方向，這是本層決定並留下的約定，渲染層/視覺層
  不需要再自己反轉一次。
- **方向鍵固定備援（`ArrowUp/Down/Left/Right`）是保留鍵**：任何動作（包含移動
  動作自己）都不能把 primary 綁到這幾個鍵，一律視為 `reserved-secondary` 拒絕。
  這樣「不可被重綁移除」這條規格變成一個不變量，不需要記得例外。
- **衝突 `override` 的語意**：新動作取得該鍵，原本持有者變成 `null`（未綁定），
  不會嘗試幫它找一個替代鍵。玩家會在重綁面板看到「（未綁定）」，可以自己再綁。
- **快速重開鍵固定 `KeyR`，不在 `content/bindings.json` 裡、不可重綁**：因為它不是
  正式遊戲動作（`src/core/README.md` 的警語——這是切片測試便利機制）。
