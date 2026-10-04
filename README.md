# Dorojam

ブラウザで動く図解エディタです。公開用のファイルは `dist/` にあります。

## GitHub Pages で公開

1. このディレクトリを GitHub リポジトリの `main` ブランチに push します。
2. リポジトリの **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選びます。
3. **Actions** の **Deploy to GitHub Pages** が完了すると、Pages に表示される URL で利用できます。

以後、`main` に push すると `dist/` の内容が自動で公開されます。アプリのデータは利用するブラウザのローカルストレージに保存されます。
