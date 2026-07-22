# AIHub Works

AIHub Works 是使用 GitHub Pages 部署的個人 AI 教學與提示詞分享網站，採用原生 HTML、CSS 與 JavaScript，沒有建置流程或外部套件依賴。

## 網站內容

- 單一 Responsive Prompt Hub
- 151 組提示詞
- 454 則實戰案例
- 搜尋、分類、收藏、最近瀏覽與熱門提示詞
- 分享、Toast、Modal、案例展開與一鍵複製
- 桌機／平板／手機版共用一套程式
- 首頁「探索提示詞」已連結至 `prompt-hub.html`

## 檔案結構

```text
index.html
prompt-hub.html
assets/
  css/
    style.css
    prompt-hub.css
  js/
    app.js
    prompt-hub.js
  data/
    prompt-data.js
    case-data.js
```

## 維護原則

- 不導入 React、Vue、npm、資料庫或 CMS。
- 保持 Prompt ID 穩定，避免破壞案例對應。
- 修改前建立開發分支，透過 Pull Request 合併至 `main`。
- 發布前檢查首頁、Prompt Hub、搜尋、分類、收藏、Modal、複製與手機版面。

## 部署

`main` 分支由 GitHub Pages 直接部署，不需要執行 build。

## 網址

- 首頁：`/AIHub-works/`
- Prompt Hub：`/AIHub-works/prompt-hub.html`
