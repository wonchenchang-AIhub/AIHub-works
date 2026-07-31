# Prompt Hub 每日複製報表

這個 Apps Script 綁定於 Google 試算表「Prompt Hub 複製紀錄回覆」，每天統計前一天 07:00 到當天 07:00 的複製紀錄並寄到 `wonchen.chang@gmail.com`。

## 新增內容

- 保留累計複製總數、本期新增、分類統計及提示詞 TOP 5。
- 新增「各網站來源統計」，分別顯示本期與累計次數。
- `AIHub-works` 顯示為新網站。
- `Prompt_hub` 顯示為舊版網站。
- 舊紀錄沒有 `source_site` 時顯示為「未標示來源（舊資料）」。

## 套用至 Google Apps Script

1. 開啟「Prompt Hub 複製紀錄回覆」試算表。
2. 選擇「擴充功能 → Apps Script」。
3. 先複製現有程式碼作為備份。
4. 將 `Code.gs` 貼入程式編輯器並儲存。
5. 從函式選單執行 `previewPromptHubDailyReport`，確認執行記錄中的統計。
6. 從函式選單執行 `sendPromptHubDailyReport`，確認收到測試信。
7. 既有觸發器執行的是 `sendDailyReport`，可以直接保留；程式已提供相容函式。
8. 若需要重建觸發器，可手動執行 `setupDailyTrigger` 或 `installPromptHubDailyReportTrigger`。
9. 若要停止寄信，可手動執行 `removeDailyTrigger`。

首次執行寄信或建立觸發器時，Google 會要求授權試算表、寄信與觸發器權限。
