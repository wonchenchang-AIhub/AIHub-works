# AIHub Works：Cloudflare D1 內容資料庫

這一階段採用「Google 表單／試算表管理內容，Cloudflare D1 提供正式網站讀取」的雙層架構：

- Google 試算表暫時保留為內容管理後台與備份，草稿、發布、封存流程不變。
- Apps Script 將完整資料（包含 `draft`、`published`、`archived`）同步到 D1。
- 正式網站只從 D1 讀取 `published`，Google Apps Script 保留為短期故障備援。
- Prompt Hub 靜態提示詞、實戰案例、複製統計與每日 Email 不在第一階段搬移範圍內。

## 安全原則

- `AIHUB_INGEST_SECRET` 只存於 Apps Script「指令碼屬性」與 Cloudflare Worker Secret。
- 不要把金鑰貼到程式碼、試算表欄位、GitHub、截圖或對話中。
- Worker 公開端點只能讀取 `published`；同步端點必須通過 Bearer Secret 驗證。
- D1 使用參數化 SQL，避免 SQL injection。
- 初次同步不會刪除 Google 試算表資料，也不會停用原 Apps Script。

## 第一階段操作順序

### 1. 登入 Cloudflare Wrangler

在專案根目錄執行：

```powershell
npx.cmd wrangler login
```

瀏覽器開啟 Cloudflare 授權頁後，登入您的 Cloudflare 帳號並按「Allow／允許」。完成後回到終端機，執行：

```powershell
npx.cmd wrangler whoami
```

只要顯示帳號名稱或 Email，即代表登入成功。

### 2. 建立 D1 資料庫

```powershell
Set-Location .\cloudflare\worker
npx.cmd wrangler d1 create aihub-content
```

把輸出的 `database_id` 填入 `cloudflare/worker/wrangler.jsonc`，取代全為 0 的暫用值。D1 ID 不是密碼，可以留在部署設定中。

### 3. 建立資料表

先驗證本機 migration：

```powershell
npx.cmd wrangler d1 migrations apply aihub-content --local
```

再套用到正式 D1：

```powershell
npx.cmd wrangler d1 migrations apply aihub-content --remote
```

### 4. 設定 Worker Secret

使用原 Apps Script 已設定的 `AIHUB_INGEST_SECRET`；不要另貼在命令列參數中：

```powershell
npx.cmd wrangler secret put INGEST_SECRET
```

終端機顯示輸入提示時才貼上既有安全密碼並按 Enter。

### 5. 部署 Worker

```powershell
npx.cmd wrangler deploy
```

記下輸出的網址，例如：

```text
https://aihub-content-api.<您的子網域>.workers.dev
```

測試：

```text
https://aihub-content-api.<您的子網域>.workers.dev/health
```

看到 `"ok":true` 即為連線正常。

### 6. 更新 Apps Script

1. 開啟「AIHub-works 網站資料庫」Apps Script。
2. 以本專案 `backend/Code.gs` 完整取代現有 `Code.gs`。
3. 儲存程式。
4. 左側「專案設定」→「指令碼屬性」新增：
   - 屬性：`AIHUB_D1_API_URL`
   - 值：上一步的 Worker HTTPS 網址，不要加 `/health`。
5. 保留原有 `AIHUB_INGEST_SECRET`，不要更換或刪除。
6. 回到編輯器，從函式選單執行 `setupContentBackend`，完成權限授權。
7. 重新整理 Google 試算表，應看到「AIHub 發布管理」選單。

### 7. 初次同步並核對

1. Google 試算表 →「AIHub 發布管理」→「檢查 Cloudflare D1 連線」。
2. 顯示連線正常後，選「同步全部內容到 Cloudflare D1」。
3. 同步完成後開啟 Worker `/health`，確認三個類型都有筆數。
4. 分別測試：
   - `/?type=learning`
   - `/?type=tools`
   - `/?type=notes`
5. 比對 D1 與原 Apps Script 三類 `published` 的數量、標題與連結。

初次同步只會 upsert，不會從 D1 刪除內容。若要停用某筆，請在試算表把 `status` 改成 `archived`，系統會同步狀態並停止公開顯示。

### 8. 切換正式網站

核對完全一致後，修改 `assets/js/content-config.js`：

```javascript
window.AIHUB_CONTENT_API_URL = 'https://aihub-content-api.<您的子網域>.workers.dev';
window.AIHUB_CONTENT_API_FALLBACK_URL = '原本的 Apps Script /exec 網址';
```

正式網站會優先讀取 D1；D1 暫時失敗時才回退 Apps Script。穩定觀察一段時間後，才評估移除備援。

## 後續日常維護

- Google 表單新增內容：表單送出觸發器會建立 `draft` 並同步 D1。
- 試算表修改內容或把 `status` 改為 `published`：安裝型編輯觸發器會同步該列。
- Outlook AI 工具選讀匯入：仍先寫入 Google 試算表，再由 Apps Script 同步 D1。
- 若自動同步失敗，可使用「同步全部內容到 Cloudflare D1」重新同步，操作是可重複且不會建立重複列。

## 回復方式

切換後若 D1 發生問題，只要把 `assets/js/content-config.js` 的主要網址改回 Apps Script `/exec`，即可回復原資料來源。Google 試算表與 Apps Script 在觀察期間都不刪除。
