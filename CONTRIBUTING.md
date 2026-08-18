# Contributing to Forecast Manifesto

このプロジェクトへの貢献ありがとうございます。開発は **Git Flow ベース**（`main` / `develop` / `feature/*` / `release/*` / `hotfix/*`）で運用しています。

## クイックスタート（機能開発）

```bash
# 1. 最新の develop から feature ブランチを作る
git fetch origin develop -q
git checkout -B feature/<日付-または-番号>-<内容> origin/develop

# 2. 変更してコミット（背景=why をメッセージに書く）
git commit -m "feat: ..."

# 3. ローカルで CI を通してから push
npm ci && npm run build && npm test

git push -u origin feature/<...>

# 4. develop 宛ての Pull Request を作成（draft → CI green → ready → squash merge）
# 5. マージ後は元ブランチを削除
git push origin --delete feature/<...>
```

## 必ず守るルール（要点）

- **`main` / `develop` へ直接 push しない。** すべて PR 経由。
- **PR base は `develop`**（緊急の本番修正のみ `hotfix/*` → `main`）。
- **マージ前に CI を独立して green にする。** PR 本文の「テスト済み」を鵜呑みにしない。
- **force push は `--force-with-lease` のみ。**
- **マージ済みブランチは残さない**（マージ時に削除）。

## 完全な運用規範

人間・AIエージェント（Claude Code 等）双方の詳細な行動規範は
**[`CLAUDE.md`](./CLAUDE.md)** に集約しています。PR を出す前に一読してください
（本ファイルはその要約であり、齟齬がある場合は `CLAUDE.md` を正とします）。

## コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) 形式を推奨：
`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`
