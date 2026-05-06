# 我的記帳本 PWA

這是一個 Vite + React + PWA 版本的記帳 App。

## 安裝

```bash
npm install
```

## 本機開發

```bash
npm run dev
```

開啟終端機顯示的網址，例如 `http://localhost:5173`。

## 打包

```bash
npm run build
```

## 部署到 Vercel

1. 把這個資料夾上傳到 GitHub
2. 到 Vercel 新增 Project
3. 選這個 repo
4. Framework 選 Vite
5. Deploy

## 手機加入主畫面

部署後用手機 Safari / Chrome 開啟網址：

- iPhone：Safari 分享按鈕 → 加到主畫面
- Android：Chrome 右上三點 → 加到主畫面 / 安裝應用程式

## Firebase

目前已預留 Firebase 檔案：

```txt
src/firebase/firebase.js
src/firebase/cloudStore.js
```

建立 Firebase 專案後，把 config 貼到 `src/firebase/firebase.js`。
目前 App 會先用 localStorage 儲存資料。
