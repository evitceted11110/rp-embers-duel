# 音訊層

本目錄由 Audio Director 與 Gameplay Engineer 共同維護。

- 只能讀取 core 已產生的事件，不得改變 core 規則或 RNG 結果。
- 所有播放經統一事件映射，不把檔案路徑散落在 render。
- 瀏覽器須等使用者首次互動後才啟動音訊。
- 外部或生成素材放在 `public/assets/audio/`，並記錄於 `ATTRIBUTION.md`。
