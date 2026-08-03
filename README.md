# 餘燼決鬥場

每一枚餘燼印記都改寫你的攻擊、閃避或戰技形狀。

## Release Candidate 內容

- 三個戰區、六場一般遭遇與灰燼君主三階段最終戰。
- 焰奴、影刺客、甲衛與灰燼君主使用不同 sprite、預兆形狀與音訊語彙。
- 六次三選一只顯示當下合法選項；完整構築會留在 HUD 與角色腳邊。
- 十二枚印記都有獨立 glyph，並依實際觸發條件改變世界物件、攻擊、閃避、技能或狀態視覺。
- 全程序式像素美術與 Web Audio；沒有外部美術或音訊檔。
- 決定性 100Hz core、可重播 crash dump、自訂鍵位與三組音量／總靜音。

## 操作

- WASD：移動
- 滑鼠：瞄準；左鍵：三段斬
- 空白鍵：閃避
- Q／E：戰技（會被印記改寫）
- R：重新開始
- 畫面上方「設定／音量」可重綁按鍵與調整音量

## 開發

```bash
pnpm install
pnpm dev
pnpm verify
```

遊戲代號：`embers-duel`

版本：`1.0.0-rc.1`

自動驗證涵蓋 lint、TypeScript、core／render／audio 測試與 production build。真實瀏覽器完整流程、console 與 60fps 仍須依 `SMOKE_TEST.md` 人工驗證；未執行前不視為通過。
