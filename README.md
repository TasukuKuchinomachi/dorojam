# Dorojam

ブラウザで動く図解エディタです。Vite を使い、ソースは `index.html` と `src/` に置いています。

## 開発

Node.js 24 を用意して、次のコマンドを実行します。

```sh
npm ci
npm run dev
```

表示されたローカル URL を開いてください。`npm run format` で HTML・CSS・JavaScript を整形できます。`npm test` でページ切り替えと draw.io の読み書きを検証できます。

画面左下でページを追加・選択・名前変更・削除できます。複数ページの draw.io ファイルを開くと各ページが選択肢に表示され、書き出しでも全ページが保存されます。

## ビルドと公開

```sh
npm run build
npm run preview
```

ビルド成果物は `dist/` に生成されます。`main` に push すると GitHub Actions が `npm ci` と `npm run build` を実行し、GitHub Pages に公開します。

公開 URL: https://tasukukuchinomachi.github.io/dorojam/

ボードのデータは利用するブラウザのローカルストレージに保存されます。

draw.io 形式との対応状況とテスト範囲は [draw.io 互換性とテスト範囲](docs/drawio-compatibility.md) にまとめています。
