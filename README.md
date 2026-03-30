# note-account-blocker

noteのハッシュタグ・検索ページから特定アカウントの記事を非表示にするTampermonkey用ユーザースクリプト。CSS `:has()` セレクタによる宣言的フィルタリング。

## 背景

noteにはアカウントのブロック機能がありますが、ブロックしたアカウントの記事はハッシュタグ検索や新着一覧にそのまま表示されます。「この人の記事を検索結果に出さない」という手段が存在しないため、読者側で対処する必要があります。

## 仕組み

ブロックリストに基づいてCSSルールを動的生成し、該当ユーザーの記事リンクを含むカード要素を非表示にします。

```css
.m-timelineItemWrapper__itemWrapper:has(a[href^="/username/"]) {
  display: none !important;
}
```

DOM操作（要素の削除や移動）は行わず、CSSルールの生成のみで動作します。noteのSPAがスクロール時に新しい記事を読み込んでも即座に適用されます。

## インストール

1. [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) をブラウザにインストール
2. [note-account-blocker.user.js](https://github.com/cogitoworks/note-account-blocker/raw/main/note-account-blocker.user.js) をクリックしてインストール

## 使い方

- 記事カードにマウスを乗せると右上に🚫ボタンが表示される → クリックでそのアカウントをブロック
- ページ右下の🚫ボタンからブロックリストの確認・手動追加・解除が可能
- ユーザー名を直接入力して追加もできる（例: `example_user`）

## 動作要件

- Tampermonkey
- CSS `:has()` セレクタ対応ブラウザ（Chrome 105+, Firefox 121+, Safari 15.4+）

## プライバシー

- ブロックリストはブラウザ内（localStorage）に保存されます
- 外部サーバーへの送信は一切ありません
- noteのサーバーに追加のリクエストも送りません

## 注意事項

- note公式のツールではありません
- noteのUI変更により動作しなくなる場合があります

## ライセンス

MIT
