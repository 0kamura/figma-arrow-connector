# Arrow Connector — Plugin Description

## English

**Arrow Connector** — FigJam-style arrows, right inside Figma Design.

No more switching to FigJam just to draw arrows. Connect any frames with clean elbow or smooth bezier arrows — directly on your design canvas.

Pick exactly where arrows attach with the visual 8-point picker. Move a frame, and the arrow follows automatically. Add labels, change colors from your existing styles and variables, and tweak bend positions — all without leaving your workflow.

Already drew an arrow? Click it to re-edit anytime. Need to update every arrow at once? One click handles it. Your settings are saved automatically, so everything is ready next time you open the plugin.

## Japanese

**Arrow Connector** — FigJamスタイルの矢印を、Figma Designでそのまま。

矢印を引くためだけにFigJamに切り替える必要はもうありません。デザインキャンバス上で直接、エルボーやベジェの矢印でフレーム同士を繋げます。

接続位置は8点ピッカーで直感的に選択。フレームを動かせば矢印が自動で追従します。ラベルの追加、既存のカラースタイルやバリアブルからの色変更、折れ位置の調整も、ワークフローを離れずにすべて完結。

作った矢印はクリックでいつでも再編集。全矢印の一括更新もワンクリック。設定は自動保存されるので、次回もすぐ使い始められます。

## Tags
arrow, connector, flowchart, diagram, wireframe

## Publish form notes
- tagline は100文字以内
- tag は最大5個まで

## Data security form answers
1. Backend service → **No, I do not host a backend service**（バックエンドなし）
2. Network requests → **My plugin/widget does not make any network requests**（ui.htmlに外部リソースなし・manifestで networkAccess: none 宣言済み。loadFontAsyncはFigma内部APIなので該当しない）
3. User authentication → **No**（ログイン機能なし）
4. Store data from plugin API → **Yes, stores locally (localStorage / setPluginData)** のみ（矢印メタデータを setPluginData、設定をlocalStorageに保存。外部送信はないので3番目は選ばない）
5. Updates → **I am a solo developer**
