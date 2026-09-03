# ストア画面をブラウザ操作するときの罠（Play / ASC 共通）

## 1. React の入力欄は `value` 直接代入が効かない

Play のリリースノートも ASC の各欄も React 制御。`el.value = text` は画面に入っても
**React の state に伝わらず、保存すると消える**。

ネイティブ setter を呼んでイベントを発火させ、**必ず読み返して確認する**:

```js
var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
var ta = document.getElementById('whatsNew');       // Play は document.querySelector('textarea')
ta.focus();
setter.call(ta, text);
ta.dispatchEvent(new Event('input',  { bubbles: true }));
ta.dispatchEvent(new Event('change', { bubbles: true }));
ta.blur();
return ta.value.length;                              // ⚠読み返す。入っていなければやり直す
```

`<input>` の場合は `HTMLInputElement.prototype` を使う。

**保存できたかの判定**: 「保存」ボタンが **disabled になったか**を見る（＝未保存の変更なし）。
「保存しました」のトーストは消えるのが早く、見逃す。

## 2. ブラウザペインが隠れていると `computer` のクリックが効かない

症状の3点セット:
- `computer` がタイムアウトする
- スクリーンショットが白紙
- `document.visibilityState === 'hidden'`

**対処: ユーザーに「ブラウザの幅を広げてください」と伝える。** ユーザー側の操作で直る。

⚠**`.click()` を JS で叩いて黙って迂回しないこと**（明確に指示された項目）。
迂回すると、押したつもりで押せていない・意図しないボタンを押す事故につながる。

⚠ただし**入力（ネイティブ setter）はペインが隠れていても通る**ので、
テキストの記入だけは止めずに済ませてよい。詰まるのは「ボタンを押す」ところだけ。

## 3. 提出は両ストアとも2段構え

1段目のボタンを押すと確認画面／ダイアログが出る。**そこまで押して初めて提出**。

| ストア | 1段目 | 2段目 | 完了の見分け方 |
|---|---|---|---|
| Play | 「N 件の変更を審査に送信」 | 「変更を審査に送信」 | 見出しが「**審査中の変更**」に変わる |
| ASC | 「審査用に追加」 | 「審査へ提出」 | 「1項目が提出されました」＋サイドバーが「**審査待ち**」 |

⚠**画面が変わったことを確認してから報告する。** 「送信したはず」で報告しない。

## 4. ファイルのアップロードは代われない

ブラウザ自動化は**ネイティブのファイルダイアログを操作できない**。
`file_upload` 系の代替も 10MB 上限＋ユーザーが共有済みのファイル限定なので、
数十MBの AAB もスクリーンショットも対象外。

Claude はここまで用意して、選択だけ頼む:

```bash
open -R <ファイルの絶対パス>        # Finderで選択状態にする
printf '%s' "<パス>" | pbcopy       # ダイアログで ⌘⇧G → ⌘V で貼れる
```

## 5. ログイン済みタブは内蔵ブラウザペインにある

外部 Chrome の拡張ではない。ログインが要るサイトは**まず `tabs_context` でタブ一覧を見る**。
⚠開き直すと**入力途中の内容が飛ぶ**ので、既存タブを使う。
