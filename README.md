# Dorojam

ブラウザで動く図解エディタです。Vite を使い、ソースは `index.html` と `src/` に置いています。

## 開発

Node.js 24 を用意して、次のコマンドを実行します。

```sh
npm ci
npm run dev
```

表示されたローカル URL を開いてください。`npm run format` で HTML・CSS・JavaScript を整形できます。

## ビルドと公開

```sh
npm run build
npm run preview
```

ビルド成果物は `dist/` に生成されます。`main` に push すると GitHub Actions が `npm ci` と `npm run build` を実行し、GitHub Pages に公開します。

公開 URL: https://tasukukuchinomachi.github.io/dorojam/

ボードのデータは利用するブラウザのローカルストレージに保存されます。
