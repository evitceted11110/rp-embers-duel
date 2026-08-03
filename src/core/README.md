# `src/core/` 給渲染層的介面說明

給接手完整候選版的 Gameplay Engineer。本檔說明：怎麼餵輸入、怎麼讀狀態、哪些狀態該對應哪些視覺表現，以及幾個容易踩的坑。

`src/core/` 完全不認識 DOM／螢幕／像素格點；它輸出的座標是遊戲世界的邏輯浮點座標。目前產品渲染使用 `src/visual/dungeon-art.ts` 的 640×360 程序式像素舞台；座標映射仍完全是渲染層職責。

## 1. 完整候選版範圍

- 三戰區共六場一般遭遇：`encounter1` 至 `encounter6`，依序引入焰奴、影刺客與甲衛。
- 每場一般遭遇後進入一次 `draft`，共六次。`state.draftOptions` 是當下唯一合法選項；core 會排除已選、前置未滿足與 slot 衝突的印記。
- 第六次選擇後進入 `boss`。灰燼君主有三個 HP 階段與 `smash`／`charge`／`summon` 三種攻勢，階段切換與召喚透過事件公開。
- 十二枚印記全部實作。累積構築以 `selectedMarks` 為準；`selectedMark` 只代表最近一次選擇，渲染層不可把它誤當成完整 build。
- 沒選任何印記時，Q/E 是基礎版突進斬／破隙衝擊。

### ⚠️ 遭遇 1 與遭遇 2 不是乾淨的 A/B 對照組

遭遇 2（焰奴×2＋影刺客×1）本來就比遭遇 1（焰奴×1）難——敵人數量與種類都變了。玩家在遭遇 2 感覺「變強／變不一樣」，一部分來自敵人變多、不是全部歸功於三選一選到的印記。Gate 3 試玩蒐集回饋時請留意這一點，不要把「感覺變強了」直接當成「印記改寫證明有效」的證據；印記改寫的證明應該看**動作幾何本身有沒有變**（閃避路徑形狀、E 的目的地、Q 的行為），不是看輸出數字。

`TickInput.restart` 會從任何階段回到同 seed 的全新遭遇 1，清空完整 build；這是候選版的快速重試入口。

## 2. 怎麼餵輸入

```ts
import { createRun, tick, neutralInput, TICK_SECONDS, type TickInput } from '../core/index.js'

let state = createRun(seed)
let accumulator = 0

function onFrame(dtSeconds: number, keyboardState: KeyboardState) {
  accumulator += dtSeconds
  while (accumulator >= TICK_SECONDS) {
    const input: TickInput = readInputFromKeyboard(keyboardState) // 見下方
    state = tick(state, input)
    accumulator -= TICK_SECONDS
    // 這裡是消費 state.events 觸發 VFX/SFX 的地方（見第 4 節）
  }
  renderInterpolated(state, accumulator / TICK_SECONDS) // 畫面插值是渲染層的事
}
```

**固定步長是硬要求**：不要把 `dtSeconds` 直接餵給遊戲邏輯或跳著呼叫 `tick()`——用上面的 accumulator pattern，每累積滿 `TICK_SECONDS`（0.01 秒／100 Hz，理由見 `constants.ts` 頂部註解）呼叫一次 `tick()`。畫面更新率（60Hz、144Hz……）與邏輯 tick 率是兩件事，用 `accumulator / TICK_SECONDS` 的餘數做視覺插值即可，不要讓幀率影響邏輯結果。

`TickInput` 是**這一 tick 的按鍵/搖桿held 狀態**（像真的鍵盤那樣「現在是不是按著」），不是「這一刻發生了一次按下事件」——上升邊緣（rising edge，例如「連段輸入」「閃避觸發」）的偵測是 core 內部做的（`state.previousInput` vs 這一 tick 的 input），渲染層只需要誠實回報鍵盤/滑鼠目前的狀態：

```ts
type TickInput = {
  moveX: number       // -1..1，同時按 A 與 D 應為 0
  moveY: number
  aimX: number        // 玩家→游標的 core 世界向量；core 會正規化
  aimY: number        // (0, 0) 代表維持目前 facing
  attack: boolean      // 對應 content/bindings.json 的 attack（預設 Mouse0）
  dodge: boolean       // 對應 dodge（預設 Space）
  skillQ: boolean      // 對應 skillQ（預設 KeyQ）
  skillE: boolean      // 對應 skillE（預設 KeyE）
  draftChoice: MarkId | null  // 只在 phase==='draft' 時有意義，見下方
  restart: boolean     // 快速重開，見上方警語
}
```

判定鍵位一律用 `KeyboardEvent.code`（見 `content/bindings.json` 與 spec.md〈品味準則張力〉一節），**不要用 `event.key`**——這是渲染層鍵盤事件轉換的職責，core 完全不碰 DOM，看不到 `KeyboardEvent`。

三選一畫面：`state.phase === 'draft'` 時，渲染層只能畫 `state.draftOptions` 的三張合法卡片。玩家點選其中一張時，下一個 tick 把對應 `MarkId` 放進 `draftChoice`；core 仍會拒絕不在選項中的值。

## 3. 怎麼讀狀態

`GameState`（`state`）是每個 tick `tick()` 回傳的完整快照，欄位全部是唯讀資料，沒有任何 mutable 物件或 closure：

| 欄位 | 說明 |
|---|---|
| `phase` | `'encounter1'..'encounter6' \| 'draft' \| 'boss' \| 'victory' \| 'defeat'` |
| `encounterIndex` | 0..5 為一般遭遇，6 為 Boss；draft 時保留剛完成的遭遇索引 |
| `selectedMarks` / `selectedMark` | 完整累積 build／最近一次選擇 |
| `draftOptions` | 本次 draft 的合法三選一；非 draft 為空 |
| `player.position` / `player.facing` | 世界座標（浮點數），facing 是正規化向量 |
| `player.hp` | 0–220 |
| `player.combo` | `{ hitIndex: 0\|1\|2\|3, phase: 'idle'\|'startup'\|'active'\|'recovery', phaseTicksRemaining, attackQueued? }`；`recovery` 是 active 後的連接窗口，不包含 startup／active |
| `player.dodge` | 見第 4 節逐項對應 |
| `player.emberCores` / `player.afterimages` / `player.guardStacks` | 三學派基礎資源；追加印記會改寫其容量、消耗、連鎖與回饋 |
| `enemies` | 每隻敵人的 `kind`／`position`／`hp`／`attackState`／`timerTicks`；Boss 另有 `bossPhase`／`bossAttack` |
| `events` | **只有這一 tick 發生的事**，不累積。渲染層／音訊層要在每次 `tick()` 呼叫後立刻消費，錯過就沒了 |

## 4. 哪些狀態對應哪些視覺表現

以下是十二枚印記「改寫動作幾何」的驗收依據，逐項列出 core 狀態怎麼餵給 `src/visual/`：

### 通用（三條流派共用）

- **滑鼠瞄準與三段連擊**：非零 `aimX/aimY` 會正規化成 `player.facing`。`createPlayerAttackGeometry()` 是 base 三段、裂焰連擊、突進追擊與鐵壁連動的唯一主斬幾何來源；回傳 `PlayerAttackGeometry`（origin／facing／physical range／half-angle／hit index／stroke half-width／target hurtbox rule／variant）。startup 由 helper 產生；active、`comboHit`／`comboWhiff` 與 `VfxState.attack` 保存同一快照，禁止資源消耗後重算。
- **敵人 hurtbox 與主斬相交**：`enemyHurtboxRadius(kind)` 固定回傳焰奴 0.50、影刺客 0.42、甲衛 0.72、Boss 1.00 units。`playerAttackHitsCircle()`／`circleIntersectsSector()` 同時處理扇形徑向外緣與兩條角度側邊，並把可見主刃帶半寬納入；這是「敵人身體與劍光接觸」而非要求敵人腳點進扇形。裂焰的 secondary splash 是主斬命中後的獨立圓形規則。
- **連接窗口與 buffer**：`COMBO_LINK_WINDOWS_S` 是唯一時序來源，依序為 0.10／0.20／0.20 秒。startup／active 尾端或 `recovery` 中的 rising edge 會設為 `attackQueued`；held 則持續代表後續意圖。`phaseTicksRemaining === 1` 的 tick 會先取樣輸入再結算，因此仍是最後合法 tick；沒有輸入時該 tick 結束後回 idle，下一 tick 再按只會從第一段開始。第三段使用同一規則 loop 回第一段。
- **閃避無敵幀**：`player.dodge.active && player.dodge.invincibilityTicksRemaining > 0`。
- **精準閃避（三條流派通用判定，只有影步真的利用它）**：`events` 出現 `{ type: 'dodgeStart', precision: true, ... }` 時播放精準閃避的音效/定格（design/spec.md 五分鐘教學 1:40–2:30 提到的「成功時有定格、殘影與清楚音效」）。

### 餘燼核心（`selectedMark === 'ember-core'`）

- **核心圖示**：`player.emberCores[i].position` 是世界座標；`armTicksRemaining > 0` 時畫「暗紅脈動」（未武裝），`<= 0` 時畫「實心橘光＋外環」（已武裝）。`events` 的 `{ type: 'coreArmed', position }` 是武裝轉換的那一 tick，可以觸發轉場特效。
- **閃避彎曲弧線**：這是本印記唯一真的改寫閃避幾何的地方。餵給 `src/visual/shapes/arc-trail.ts` 的 `dodgeArcTrail(start, end, bendTarget, ...)`：
  - `start` = `player.dodge.startPosition`，`end` = `player.dodge.endPosition`（映射成 `ScreenPoint` 後）。
  - `bendTarget` = `player.dodge.bendTarget`（`null` 就是直線，非 `null` 就是彎曲——這個欄位本身就是「有沒有武裝核心在偵測範圍內」的布林旗標，不需要渲染層自己重新判斷）。
  - 因為視覺層的 `dodgeArcTrail` 允許次像素座標（判定層，不走 `WorldCell` 量化），彎曲弧線在畫面上才不會被 8px 網格吃掉細節。
- **引爆**：`events` 的 `{ type: 'coreDetonated', position }`。引爆後 `player.attackBonusTicksRemaining > 0` 期間可以在角色身上疊加一個「攻擊力加成」的視覺提示。

### 精準殘影（`selectedMark === 'precision-afterimage'`）

- **殘影**：`player.afterimages[i]` 的 `position` 與 `ticksRemaining`。餵給 `src/visual/shapes/afterimage.ts`（不透明度隨 `ticksRemaining` 衰減，`t=0` 時全不透明、`t=afterimage_duration_s` 時消失——`ticksRemaining / secondsToTicks(afterimageDurationS)` 就是那個 `t` 的歸一化進度，注意方向：`ticksRemaining` 越少代表越接近消失）。`afterimages.length` 同時就是目前 E 的充能數（上限 2）。
- **E＝瞬移突襲**：`events` 的 `{ type: 'eCast' }` 若發生在 `selectedMark==='precision-afterimage'`，代表這一 tick 玩家瞬移到了某個殘影座標——比對這一 tick前後的 `player.position` 差異即可知道瞬移的起訖點，用來畫瞬移拖尾。

### 蓄能反震（`selectedMark === 'charged-retaliation'`）

- **蓄能護環**：`player.guardStacks`（0–3）畫成角色周身 0–3 圈灰藍色護環。
- **格擋尾段**：`player.dodge.parryTailActive` 為真時，護環應該短暫變亮（`events` 的 `{ type: 'playerBlocked' }` 是真的擋下一次攻擊的那一 tick，`parryTailActive` 本身涵蓋整段 0.15 秒窗口，兩者都值得表現）。
- **E＝反震衝擊**：`events` 的 `{ type: 'eCast' }` 搭配 `player.guardStacks` 歸零，代表這一 tick 護環全部爆發成衝擊波。

### 九枚追加印記

- 裂焰連擊：第三斬 `comboHit` 搭配完整 build，畫 120° 火扇與燒痕。
- 雙核共振：兩顆 `emberCores` 同時武裝時畫連線；同 tick 可出現兩個 `coreDetonated`。
- 餘燼獻祭：E 會讓所有武裝核心各送出 `coreDetonated`，不需要玩家位移。
- 突進追擊：`pursuitTicksRemaining > 0` 是反擊窗口；第一斬使用窄角突刺。
- 虛影重置：精準 `dodgeStart` 後冷卻立即為 0，HUD 與腳邊須閃回 READY。
- 暗影收割：Q 搭配所有現存 `afterimages` 顯示同步爆裂。
- 餘波護盾：三層時護環加金邊；`aftershockBonusReady` 表示下一次 E 已強化。
- 鏡甲反傷：`mirrorStanceTicksRemaining > 0` 畫面向盾；`playerBlocked` 觸發反光。
- 鐵壁連動：兩層以上的第一斬畫擴大淡藍殘影。

## 5. 工程假設常數（不是 Designer／Balance Engineer 核定值）

`design/spec.md` 的原型模擬（`sim/prototype.ts`）把整場戰鬥抽象成「連擊循環」計數，完全沒有座標、沒有移動速度、沒有攻擊/閃避距離。做一個真的有幾何形狀的即時引擎，這些數字必須有人先決定一個合理值——全部集中在 `src/core/constants.ts`，每個都有註解說明選擇理由，包含（但不限於）：

- `PLAYER_MOVE_SPEED_UNITS_PER_S`（6.5，必須高於所有敵人持續 steering 上限）、`DODGE_DISTANCE_UNITS`、`ATTACK_RANGES_UNITS`／`ATTACK_HALF_ANGLES_RAD`／`ATTACK_STROKE_HALF_WIDTH_UNITS`
- 輕／輕／重逐段的 `ATTACK_STARTUP_TIMES_S`／`ATTACK_ACTIVE_TIMES_S`，active 後連接窗口 `COMBO_LINK_WINDOWS_S`（`ATTACK_RECOVERY_S` 僅為相容別名），以及 `COMBO_LUNGE_UNITS`／`COMBO_RECOIL_UNITS`
- `arena.ts` 公開 `ARENA_BOUNDS`／`clampToArena()`／`isInsideArena()`；所有玩家與敵人位移路徑每 tick 都以此為世界場界，render 只做同源座標映射
- `CORE_BEND_DETECTION_RADIUS_UNITS` / `CORE_BEND_STRENGTH`（餘燼核心彎曲弧線的偵測半徑與彎曲強度）
- `ENEMY_ENGAGE_RANGE_UNITS`、`GUARD_E_RADIUS_UNITS`、`Q_LUNGE_DISTANCE_UNITS`、`E_KNOCKBACK_DISTANCE_UNITS`

這些都應該在 Gate 3 真人試玩後回頭校準，不是已核准的正式數值。改動時只需要改 `constants.ts` 這一個檔案。

## 6. 一個有趣但值得知道的架構結果：`dodge_difficulty_modifier` 在這個引擎裡沒有用

`content/enemies.json` 的每種敵人都有 `dodge_difficulty_modifier`（給 `sim/prototype.ts` 的機率模型用，代表某敵人「比基準更難/更易閃避成功」）。這個引擎因為有真正的連續 tick 時間軸，閃避成不成功是**真的幾何/時序判定**（無敵幀窗口有沒有蓋住敵人判定生效的那一刻），不是擲骰機率——所以這個欄位在 `src/core/` 完全沒被讀取。難度差異在這個引擎裡改為體現在敵人的 `telegraph_ms`（預兆時間）與 `attack_interval_cycles`（攻擊間隔）上：預兆越短、間隔越密，玩家需要越精準的時機才能穩定閃避成功，這與 `dodge_difficulty_modifier` 想表達的「這隻比較難躲」是同一件事的另一種呈現方式，只是不再需要一個獨立的機率修正欄位。

同樣地，`charged-retaliation` 的 `dodge_trailing_parry_s`（0.15 秒格擋尾段）在 `sim/prototype.ts` 裡因為只能用離散機率近似（`design/spec.md`〈模擬近似落差揭露〉記載的 3% vs 字面換算 13.6% 的落差），但本引擎有真正的連續時間軸，直接把這 0.15 秒當一個真實的格擋判定窗（見 `enemy.ts` 的 `resolveIncomingHit()`）——這個落差在這裡不是近似，是被解決掉了。

## 7. Crash dump：一鍵重現

```ts
import { createRecorder, replay, type CrashDump } from '../core/index.js'

const recorder = createRecorder(seed)
// 渲染層每個 tick 呼叫 recorder.tick(input) 取代直接呼叫 core 的 tick()
const state = recorder.tick(input)

// 出事時：
const dump: CrashDump = recorder.dump() // { seed, inputLog }，可以 JSON.stringify
// 回報這個 dump，任何人都能用 replay(dump) 重現出事當下的最終狀態
```

`CrashDump` 是純 JSON 資料（`seed` + `TickInput[]`）。每場遭遇與 Boss 只在生成當下使用各自 fork 的 RNG 並把結果烘焙成普通數字；`tick()` 不保存 mutable RNG，因此 `replay()` 保證逐 tick 重現相同狀態。
