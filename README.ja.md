# Pi-JitRL

[English](README.md) · [简体中文](README.zh-CN.md)

Pi-JitRL は、コーディング Agent のツール操作を記録し、過去の似た状態を検索して、各アクションの回報を推定します。推定値は次のモデル呼び出しの前に Pi へ渡します。経験はローカルの SQLite に保存するため、セッションをまたいで利用できます。

V1 は [Just-In-Time Reinforcement Learning](https://arxiv.org/abs/2601.18510) を参考にした、アクション単位のガイダンスです。advantage と参照アクション方策を計算し、提案を採用するかは Pi のモデルが判断します。プロバイダーの token logits の変更、参照確率の強制、モデルの重み更新は行いません。

## インストール

Node.js 22.19 以降と Pi が必要です。現在の Pi パッケージ名は `@earendil-works/pi-coding-agent` です。このプロジェクトは 1.0.3 を使ってビルドとテストを行います。

```bash
pi install git:github.com/Jas-S/Pi-JitRL
```

ローカルで開発する場合：

```bash
git clone https://github.com/Jas-S/Pi-JitRL.git
cd Pi-JitRL
npm ci
npm run build
pi -e .
```

リポジトリにはビルド済みの `dist/extension.js` が含まれます。Pi は package manifest に指定したこのエントリーを読み込みます。Pi が Git パッケージをインストールする際は開発用依存を省くため、コンパイル済みファイルも Git で管理します。インストール後は Pi を再起動するか、`/reload` を実行してください。実行時に必要なサードパーティー依存はありません。SQLite は Node.js の組み込みモジュールを使います。

## 使い方

普段どおり Pi で作業してください。Agent の実行ごとに、ツール操作前の状態、アクションの種類、報酬、割引累積報酬を一つの軌跡として記録します。履歴のないプロジェクトでは、まず経験を集めます。似た軌跡から複数のアクションについて十分な証拠を得ると、数値による提案を挿入します。

```text
/jitrl status
/jitrl stats
/jitrl memory 5
/jitrl explain
/jitrl feedback success
```

`explain` は、検索した軌跡 ID、類似度、Q 値、advantage、参照確率を表示します。フィードバックの対象は、現在のセッション分岐で最後に完了した軌跡です。`success` は +1、`failure` と `revert` は -1、`correction` は -0.8 です。[-1, 1] の数値も指定できます。再評価すると以前の値を置き換え、累積報酬を再計算します。

Agent の実行が終了しただけでは、成功報酬は与えません。成果を受け入れたことを記録したい場合は、フィードバックコマンドを使ってください。「よさそう」といった通常のチャット文は自動採点しません。

## 報酬と検索

アクションの種類は `READ`、`SEARCH`、`EDIT`、`WRITE`、`BASH`、`TEST`、`BUILD`、`TYPECHECK`、`LINT`、`GIT`、`DELEGATE` です。

| シグナル | 報酬 |
| --- | ---: |
| テストコマンドの終了コードが 0 | +0.80 |
| ビルドコマンドの終了コードが 0 | +0.60 |
| 型チェックの終了コードが 0 | +0.40 |
| Lint の終了コードが 0 | +0.30 |
| ツールの失敗 | -0.20 |
| テスト / ビルド / 型チェック / Lint の失敗 | -0.50 / -0.40 / -0.30 / -0.20。ツール失敗の減点も加算 |
| 同じ実行内でのエラーの繰り返し | さらに -0.30 |

終了コードは検証結果の代理指標であり、タスクの正しさを保証しません。V1 は `npm test`、`python -m pytest`、`cargo test`、`npx tsc --noEmit` などの一般的なコマンドを識別します。シェルで連結したコマンド、パイプ、失敗を隠す書き方は `BASH` として扱い、検証報酬を与えません。親ツールと子ツールの二重計上を避けるため、ネストした呼び出しは個別に記録しません。

検索には、正規化したタスク文、単語 n-gram、直近のアクション、編集状態、前回のツール結果を使います。漢字には文字単位の境界も設けます。Jaccard 類似度で近い状態を選び、一つの軌跡からはアクションごとに最大一つの状態を取得します。検索対象は、実体パスが同じ作業ディレクトリ内で完了した軌跡だけです。embedding や外部推論サービスは不要です。

## 設定

```text
/jitrl config
/jitrl config mode observe
/jitrl config beta 0.5
/jitrl config mode guide
```

`guide` は経験を記録し、数値による提案を挿入します。`observe` は比較実験用に記録だけを行い、`off` は記録とガイダンスを停止します。設定は Agent の実行終了後に変更してください。コマンドは現在のプロジェクトの `.pi/jitrl/config.json` に設定を保存します。

| 設定 | 初期値 | 意味 |
| --- | ---: | --- |
| `gamma` | 0.9 | 将来の報酬の割引率。新しい軌跡に適用 |
| `beta` | 0.5 | 参照方策の補正強度。小さいほど強い補正 |
| `topK` | 20 | 取得する状態とアクションの組の上限 |
| `minSimilarity` | 0.15 | Jaccard 類似度の下限。タスク文の共通要素も必要 |
| `minSamples` | 2 | advantage を反映するために必要な軌跡数 |
| `maxCandidates` | 500 | 検索で走査する直近の完了軌跡数 |
| `maxTrajectories` | 2000 | プロジェクトごとに保持する完了・中断軌跡数 |
| `ngram` | 2 | タスク n-gram の最大長。1 から 4 |

## ローカルデータ

データベースの初期パスは `~/.pi/agent/jitrl/memory.sqlite` です。`PI_JITRL_DB` で別の保存先を指定できます。実体パスのハッシュでプロジェクトを区切るため、同じディレクトリ内のセッションは経験を共有し、別のディレクトリとは分離します。

保存するのは、長さを制限して正規化したタスク文とアクションのメタデータです。元のツール引数、ファイル内容、ツール出力は保存しません。一般的な認証情報の形式は保存前に伏せますが、すべての秘密情報を検出できるわけではありません。厳密なデータ境界が必要な場合は、機密情報をプロンプトに含めないでください。モデルへ挿入する提案には数値推定と固定の説明だけを使い、過去のタスク文は含めません。

未完了の軌跡は確認できますが、検索には使いません。セッションツリーを移動すると、分岐内の記録からフィードバック対象を復元します。評価は SQLite に保存するため、リロード後も残ります。

## 開発

```bash
npm run check
npm test
npm run experiment
npm pack --dry-run
```

テストでは、累積報酬の計算、証拠の少ない状態、プロジェクト分離、永続化、分岐ごとのフィードバック、Pi の実際の拡張ローダーを確認します。モデルを呼び出さずに Pi の bash ツールも実行します。実験用スクリプトは合成軌跡を使い、advantage が参照方策に与える影響を示します。Agent の性能評価ではありません。

`src/core` は Pi に依存しない学習ロジックで、`pi-jitrl/core` からインポートできます。`src/storage` は SQLite 保存処理、`src/extension.ts` は Pi のイベントとコマンドを担当します。数式と論文との差分は[アルゴリズムノート](docs/algorithm.md)、実装範囲は [V1 の範囲](docs/v1.md)を参照してください。この二つの文書は英語です。

## 参考資料

[JitRL の公式実装](https://github.com/liushiliushi/JitRL) を軌跡検索と advantage 推定の参考にしています。Pi との接続方法は[拡張 API](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)と[パッケージ形式](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)に従います。

ライセンス：[MIT](LICENSE)。
