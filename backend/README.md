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

## Outlook `.msg` 自動整理成「AI 工具選讀」草稿

`automation/Import-AIToolReads.ps1` 會讀取指定資料夾中的 Outlook `.msg`，擷取原文網址，交由 Gemini 整理成固定欄位，再寫入同一份試算表。所有自動匯入內容一律建立為 `draft`，確認後才手動改成 `published`。

### 1. 更新 Apps Script

1. 將新版 `backend/Code.gs` 全文貼入 Apps Script 並儲存。
2. 開啟「專案設定 → 指令碼屬性」，新增：
   - 名稱：`AIHUB_INGEST_SECRET`
   - 值：自行產生一組至少 32 字元的隨機密鑰。
3. 選擇「部署 → 管理部署 → 編輯」，建立新版本後重新部署。
4. 保留部署後結尾為 `/exec` 的網址；同一網址同時供網站讀取與本機匯入使用。

### 2. 設定 Windows 使用者環境變數

請勿把密鑰寫進 Git 或網站 JavaScript。到 Windows「環境變數」新增：

- `GEMINI_API_KEY`：Google AI Studio 建立的 Gemini API 金鑰。
- `AIHUB_CONTENT_API_URL`：Apps Script 的 `/exec` 網址。
- `AIHUB_INGEST_SECRET`：與指令碼屬性完全相同的隨機密鑰。

設定後請重新開啟 PowerShell 或重新登入 Windows。

匯入器預設使用已支援新金鑰且適合大量摘要整理的 `gemini-3.5-flash-lite`。

### 3. 分階段測試

只測試 Outlook 郵件與網址解析，不呼叫 Gemini、不寫入試算表：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\automation\Import-AIToolReads.ps1" -DryRun -SkipAI
```

呼叫 Gemini 產生完整草稿，但仍不寫入試算表：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\automation\Import-AIToolReads.ps1" -DryRun
```

確認預覽後正式寫入試算表草稿：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\automation\Import-AIToolReads.ps1"
```

預設來源資料夾為：

```text
D:\nas3-backup\專題講座\職場AI賦能 - 複製\AI工具選讀
```

可用 `-SourceFolder` 指定其他資料夾；用 `-Limit 5` 限制單次測試檔案數。成功匯入後，本機會在 `%LOCALAPPDATA%\AIHubWorks\outlook-import-state.json` 記錄已處理項目，網站後台也會再次依原文網址與郵件識別碼去重。

### 4. 建立每日排程

在 Windows 工作排程器建立每日工作：

- 程式：`powershell.exe`
- 引數：`-NoProfile -ExecutionPolicy Bypass -File "完整路徑\automation\Import-AIToolReads.ps1"`
- 建議選擇「只有使用者登入時才執行」，確保 Outlook COM 能使用既有的 Outlook 設定檔。
- 建議先設定每天一次；確認穩定後再調整頻率。

Instagram、Threads、LinkedIn 等需要登入或限制爬取的頁面，可能無法由 Gemini 直接讀取。程式會改用郵件主旨與正文產生低信心草稿，並在 `AI 整理狀態 [ai_status]` 標示需要人工確認，不會自動發布。
