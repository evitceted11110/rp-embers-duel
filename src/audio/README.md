# 音訊層

本層只讀相鄰 `GameState`，不得反向影響 core。

- `audio-frame.ts`：把 core 事件與敵人狀態轉換映射成 cue／動態音樂層。
- `director.ts`：首次互動前保持惰性，管理三匯流排、總靜音與 backend 生命週期。
- `web-audio-backend.ts`：純程序式 Web Audio 合成、淡入淡出與峰值限制。
- `controls.ts`：設定面板的音樂／效果／介面音量與全部靜音。
- `content/audio-events.json`：所有 cue 的唯一資料正本。

瀏覽器須等首次 `pointerdown` 或 `keydown` 才建立並 resume `AudioContext`。音訊事件由 `game-loop` 每個 logical tick 傳入，不能只在 rAF 讀取，否則單幀多 tick 時會漏掉離散事件。
