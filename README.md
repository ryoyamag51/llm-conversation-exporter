# LLM Conversation Exporter

[English](#english) | [日本語](#日本語)

https://github.com/user-attachments/assets/a842a7b9-a745-4049-97d5-47992e6b1a5a

## English

Export conversations from Claude.ai, ChatGPT, and Gemini as Markdown, JSON, or plain text.

### Features

- Choose Markdown, JSON, or plain text from the floating three-button format picker.
- Click the active format icon to export the current conversation.
- Hover over the icon to reveal the other two formats.
- Press and hold the active icon for 300 ms, then drag it anywhere within the safe screen area. Its position is shared across supported sites.
- Use the toolbar popup to include or exclude metadata and show or hide the floating button.
- Switch extension-owned interface text between English and Japanese. English is the default.

### Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this repository folder.
4. Open the extension popup and select **Open options** to configure services.

### Claude Organization ID

Claude exports require the Organization ID shown at [claude.ai/settings/account](https://claude.ai/settings/account). Paste the UUID into the Options page and save it.

### Supported output

- Markdown (`.md`): readable conversation formatting with optional metadata.
- JSON (`.json`): normalized conversation data.
- Plain text (`.txt`): compact speaker-and-message output with optional metadata.

The extension reads only the currently selected conversation on supported sites. Site-side API or DOM changes can affect export availability.

---

## 日本語

Claude.ai、ChatGPT、Geminiの会話をMarkdown、JSON、プレーンテキストでエクスポートするChrome拡張機能です。

### 主な機能

- 3つの丸型形式ボタンからMarkdown、JSON、プレーンテキストを選択できます。
- 選択中の形式アイコンをクリックすると、現在の会話をエクスポートします。
- アイコンへカーソルを合わせると、残り2形式が左側に表示されます。
- 選択中のアイコンを300ms長押ししてからドラッグできます。位置は対応サイト間で共通保存されます。
- ツールバーのポップアップから、メタデータとフローティングボタンの表示を切り替えられます。
- 拡張機能のUIを英語／日本語に切り替えられます。初期表示は英語です。

### インストール

1. Chromeで `chrome://extensions` を開きます。
2. **デベロッパーモード**を有効にします。
3. **パッケージ化されていない拡張機能を読み込む**を選び、このリポジトリのフォルダーを指定します。
4. 拡張機能のポップアップから**オプションを開く**を選び、各サービスを設定します。

### Claude Organization ID

Claudeのエクスポートには、[claude.ai/settings/account](https://claude.ai/settings/account) に表示されるOrganization IDが必要です。UUIDをオプションページへ貼り付けて保存してください。

### 出力形式

- Markdown（`.md`）：読みやすく整形された会話と、任意のメタデータ。
- JSON（`.json`）：正規化された会話データ。
- プレーンテキスト（`.txt`）：話者名と本文を中心とした簡潔な出力と、任意のメタデータ。

この拡張機能は、対応サイトで現在選択されている会話だけを読み取ります。サイト側のAPIやDOM構造が変わると、一時的にエクスポートできなくなる場合があります。
