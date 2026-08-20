# AIHub Works 每日使用報表

這個 Apps Script 綁定於 Google 試算表「Prompt Hub 複製紀錄回覆」，每天統計前一天 07:00 到當天 07:00 的提示詞複製與三個內容區點閱紀錄，並寄到 `wonchen.chang@gmail.com`。

## 新增內容

- 保留累計複製總數、本期新增、分類統計及提示詞 TOP 5。
- 新增「各網站來源統計」，分別顯示本期與累計次數。
- `AIHub-works` 顯示為新網站。
- `Prompt_hub` 顯示為舊版網站。
- 舊紀錄沒有 `source_site` 時顯示為「未標示來源（舊資料）」。
- 新增 AI 教學簡報、AI 工具選讀、AI 實作筆記的本期與累計點閱次數。
- 新增三區「本期點閱占比」及本期最常被點閱內容 TOP 5。
- 點閱占比以三區本期點閱總數為分母，並非訪客或曝光數 CTR。

## 網站端記錄方式

- AI 教學簡報：使用者點擊「閱讀 PDF」時記錄一次。
- AI 工具選讀：使用者點擊「閱讀原文」時記錄一次。
- AI 實作筆記：使用者展開「閱讀完整筆記」時記錄一次。
- 沿用既有 Google Form 欄位；內容點閱的 `prompt_id` 會以 `CONTENT_VIEW:` 開頭，日報依此與提示詞複製分流，舊資料不受影響。

## 套用至 Google Apps Script

1. 開啟「Prompt Hub 複製紀錄回覆」試算表。
2. 選擇「擴充功能 → Apps Script」。
3. 先複製現有程式碼作為備份。
4. 將 `Code.gs` 貼入程式編輯器並儲存。
   - 程式已在 `COPY_REPORT_CONFIG.spreadsheetId` 指定回覆試算表，因此綁定或獨立 Apps Script 專案都可執行。
5. 從函式選單執行 `previewPromptHubDailyReport`，確認執行記錄中的統計。
6. 從函式選單執行 `sendPromptHubDailyReport`，確認收到測試信。
7. 既有觸發器執行的是 `sendDailyReport`，可以直接保留；程式已提供相容函式。
8. 若需要重建觸發器，可手動執行 `setupDailyTrigger` 或 `installPromptHubDailyReportTrigger`。
9. 若要停止寄信，可手動執行 `removeDailyTrigger`。

首次執行寄信或建立觸發器時，Google 會要求授權試算表、寄信與觸發器權限。
