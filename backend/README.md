# AIHub 內容後台部署

1. 開啟「AIHub-works 網站內容資料庫」Google 試算表。
2. 選擇「擴充功能 → Apps Script」。
3. 將 `Code.gs` 全文貼入並儲存。
4. 執行 `setupContentBackend`，依畫面授權。
5. 回到試算表，把要公開的列之 `發布狀態 [status]` 改為 `published`。
6. 在 Apps Script 選擇「部署 → 新增部署 → 網頁應用程式」。
7. 執行身分選「我」，存取權選「任何人」。
8. 複製結尾為 `/exec` 的網址，填入 `assets/js/content-config.js`。

試算表本身不必公開。網頁應用程式只輸出狀態為 `published` 的列。
