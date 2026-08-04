# 《餘燼決鬥場》音訊規範

狀態：1.0.0-rc.1 完整候選版已實作；瀏覽器盲測待執行
日期：2026-07-31

## 方向

音訊採「黑曜石共振器」語彙：低頻三角波是場地餘燼，鋸齒波是近戰摩擦，方波是危險與格擋的硬邊；所有聲音均由 Web Audio oscillator、gain 與 compressor 即時合成，不載入音檔。

配樂不是一首循環音檔，而是三個可連續混合的脈衝聲部：

- `base`：55Hz 三角波、2Hz 呼吸脈衝；維持場地存在感。
- `combat`：110Hz 鋸齒波、4Hz 行進脈衝；依戰區與 Boss 戰逐步增強。
- `threat`：220Hz 方波、8Hz 警戒脈衝；依同時預兆敵人數、低生命與 Boss 階段淡入。

聲部以 60–180ms gain ramp 切換，不重新播放、不硬切。三層先進音樂匯流排，再經 master limiter；不得靠持續提高總音量表現壓力。

## 匯流排與動態範圍

| 匯流排 | 預設 | 用途 |
|---|---:|---|
| music | 0.35 | 三層動態配樂 |
| effects | 0.70 | 攻擊、閃避、技能、敵方預兆與受擊 |
| ui | 0.55 | 抽選、印記、錯誤、勝敗 |
| master | 0.80 | 總輸出；全部靜音時平滑降至 0 |

- 設定面板提供 music／effects／ui 三個 0–1 slider 與「全部靜音」。
- 每個 cue 的局部 gain 不超過 0.30；master 前使用 DynamicsCompressor，threshold -12dB、ratio 10:1。
- 總靜音採 40ms ramp，避免 click；動態音樂切換採更長 ramp，避免硬切與疊加爆音。

## 事件映射

唯一結構化正本是 `content/audio-events.json`。首拍 offset 必須為 0，反應 cue 延遲目標為 **40ms 以下**。

| 遊戲事實 | Cue | 可辨識語彙 |
|---|---|---|
| 焰奴進入預兆 | `enemy-telegraph-ember` | 低頻正弦雙脈衝、向下墜 |
| 影刺客進入預兆 | `enemy-telegraph-shade` | 高頻鋸齒三連短促收束 |
| 焰奴攻擊生效 | `enemy-attack-ember` | 單次低頻方波重擊 |
| 影刺客攻擊生效 | `enemy-attack-shade` | 鋸齒雙刺 |
| 甲衛預兆／攻擊 | `enemy-*-bulwark` | 低頻三拍蓄盾／沉重雙撞 |
| Boss 落槌／衝鋒／召喚 | `boss-{smash,charge,summon}-*` | 低頻圓震／上揚長掃／四拍儀式，各自不可混用 |
| Boss 二／三階段 | `boss-phase-2`／`boss-phase-3` | 三段甦醒／四段暴走，與全畫面演出同步 |
| 普攻命中 1／2／3 | `combo-hit-*` | 逐段加厚；第三段為雙脈衝長尾 |
| 普攻落空 | `combo-whiff` | 低 gain 短掃頻，不與命中混淆 |
| 一般／精準閃避 | `dodge`／`dodge-precision` | 一般單次上揚；精準為高頻雙閃 |
| 核心武裝／引爆 | `core-armed`／`core-detonated` | 武裝上升共鳴；引爆低頻雙爆 |
| 殘影生成 | `afterimage-spawned` | 高頻向下消散 |
| Q／E／失敗 | `skill-q`／`skill-e`／`skill-failed` | Q 單次上衝；E 雙脈衝；失敗為 UI 低音拒絕 |
| 玩家受擊／格擋 | `player-hit`／`player-blocked` | 受擊粗糙向下；格擋高頻三連金屬感 |
| 遭遇清空／三選一 | `encounter-cleared`／`draft-offered` | UI 和聲雙音 |
| 十二枚印記 | `mark-selected-{mark-id}` | 每枚 frequency、waveform、rhythm 組合唯一；不是只分三學派 |
| 印記改寫動作 | `mark-action-*` | 裂焰、追擊、鐵壁、重置、鏡甲、收割、核心、獻祭、殘影、反震各有動作 cue |
| 勝利／戰敗 | `victory`／`defeat` | 勝利三段上行；戰敗長段下沉 |

音訊層額外比較相鄰 `GameState`：敵人從非 `telegraph` 進入 `telegraph` 時立即播放預兆；從 `telegraph` 回到 `cooldown` 時播放攻擊。這比在畫面幀輪詢可靠，因 `game-loop` 每個 logical tick 都把前後狀態送進音訊層，即使一個 rAF 推進多 tick 也不漏 cue。

### 輕、輕、重命中分級（2026-08-03）

- 真實 `comboHit.hitIndex` 直接映射 `combo-hit-1`／`combo-hit-2`／`combo-hit-3`，不得由動畫幀猜測。
- 第一／二段是單脈衝 triangle，75／90ms，190→110Hz／240→125Hz；第三段是雙脈衝 sawtooth，180ms，310→82Hz。重擊尾頻更低、時長至少是第一段兩倍且有第二拍，因此不是只把同一聲音放大。
- cue 局部 gain 分別 0.20／0.23／0.28，全部 ≤0.30；effects bus 與 master `DynamicsCompressor` limiter 維持既有路徑，不因同 tick VFX 加強而疊加額外命中 cue，避免削波。

### 雙職業事件語彙（2026-08-04）

`content/audio-events.json` 的 `class_event_map` 是雙職業唯一映射正本。24 張卡以
`classId/cardId` 解析，8 條共鳴以 `classId/resonance` 解析；任何漏項在開發與測試時直接
失敗，絕不靜默回退成 `skill-e`。這讓 replay、HUD 與音訊對同一張已投資卡保有同一因果。

- **熔衛**使用低中頻的砧擊、鎖鏈與環狀脈衝（約 94–360Hz）。每張卡以至少兩項
  waveform、頻率輪廓、節奏或時長區分；共鳴比一般卡多一拍或更長的收束尾音，但局部 gain
  不超過 0.29，避免蓋住敵方預兆。
- **影線獵人**使用高頻切線、回身與端點躍遷（約 330–1120Hz）。不是把熔衛聲音升高：
  其 cue 以短促鋸齒／正弦掃頻、交錯節奏與向上端點明確表現路徑承諾。
- **共鳴拒絕**分三類：缺少前置物為低三角雙拍、錯誤幾何／落點為方波三拍、時機／格擋
  失敗為較高正弦雙拍。HUD 保留原始文字 reason，聲音只提供可立即辨識的類別，永不取代畫面。

同一個 logical tick 若有危險預兆和職業成功，預兆 cue 仍先由 `enemyTransitionCues` 排入 frame；
職業 cue 均維持 0ms 首拍、effects gain ≤0.30 並走既有 limiter，因此 build 成功不會以音量壓過反應資訊。

## 首次互動與生命週期

- 載入頁面時只建立 `AudioDirector`，不建立 `AudioContext`，也不播放。
- 首次 `pointerdown` 或 `keydown` 才建立 backend 並 `resume()`；兩個監聽器隨即一起移除。
- 頁面卸載時停止三個音樂 carrier 與 LFO、關閉 context。
- 音訊啟動失敗會記錄可診斷錯誤，但不得阻止遊戲繼續。

## 動態配樂規則

| 狀態 | base | combat | threat |
|---|---:|---:|---:|
| 遭遇一 | 0.35 | 0.48 | 每名預兆敵人 +0.28 |
| 戰區一後段 | 0.35 | 0.58 | 每名預兆敵人 +0.28 |
| 戰區二 | 0.35 | 0.68 | 每名預兆敵人 +0.28 |
| 戰區三 | 0.35 | 0.80 | 每名預兆敵人 +0.28 |
| Boss | 0.35 | 0.90 | 第二階段 +0.18；第三階段 +0.34 |
| 玩家 HP ≤66 | 同上 | 同上 | 額外 +0.18 |
| 三選一 | 0.22 | 0 | 0 |
| 勝利／戰敗 | 0 | 0 | 0 |

`threat` 上限 0.85。勝敗先讓音樂層淡出，再由 UI cue 給明確終止點。

## 靜音可玩性

聲音不承載唯一資訊：

- 敵人預兆已有固定形狀、顏色與收束動畫。
- 攻擊、閃避、技能、格擋與流派效果皆有判定層特效與 HUD 冷卻。
- 三選一、勝利與戰敗均有全畫面文字。
- 靜音不改 core 時序、判定或輸入；只有 Web Audio master gain 改變。

因此全部靜音時仍可完成整局。音訊只強化反應和辨識，不提供視覺中不存在的必要狀態。

## 測試與驗收

- `audio-frame.test.ts`：預兆種類、操作／技能／印記／勝敗 cue 與動態層。
- `director.test.ts`：首次互動前零 backend、三匯流排、總靜音及事件播放。
- `audio-content.test.ts`：cue id 唯一、首拍為 0、gain 上限、延遲目標及必要事件齊全。
- `game-loop-audio.test.ts`：單幀多 tick 時仍逐 tick 送出前後狀態。
- 真人瀏覽器驗收：盲測四種敵人、Boss 三攻勢、十二枚印記選取與改寫動作、受擊／格擋與勝敗；確認 console 無錯、首次互動前無 autoplay。此項尚未執行，不宣稱通過。

## 素材與授權

本切片使用零外部、零生成音檔資產。所有聲音均由本專案程式碼在玩家瀏覽器內即時合成；詳見 `public/assets/audio/ATTRIBUTION.md`。
