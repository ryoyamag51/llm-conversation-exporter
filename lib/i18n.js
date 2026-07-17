(function (global) {
  const DEFAULT_LANGUAGE = 'en';
  const messages = {
    en: {
      languageEnglish: 'English', languageJapanese: 'Japanese', popupSubtitle: 'Quick Settings',
      includeMetadata: 'Include metadata', includeMetadataDesc: 'Add dates, model names, and other details to exports.',
      showFloatingButton: 'Show floating button', showFloatingButtonDesc: 'Display the format button on supported conversation pages.',
      openOptions: 'Open settings', optionsSubtitle: 'Export conversations from Claude, ChatGPT, and Gemini.',
      exportSettings: 'Export settings', outputFormat: 'Output format', markdown: 'Markdown', json: 'JSON',
      jsonFull: 'JSON (all data)', plainText: 'Plain Text', claudeOrganization: 'Claude.ai — Organization ID',
      organizationPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', organizationDesc: 'A UUID-format ID required to export from claude.ai.',
      save: 'Save', testConnection: 'Test connection', organizationHelp: 'How to find your Organization ID',
      organizationHelpStep1: 'Open claude.ai/settings/account.', organizationHelpStep2: 'Copy the Organization ID.',
      organizationHelpStep3: 'Paste it above and save.', supportedPlatforms: 'Supported platforms',
      claudeDesc: 'Export through the REST API', chatgptDesc: 'Export through the internal API',
      geminiDesc: 'Export the conversation shown on the page', organizationRequired: 'Enter an Organization ID.',
      organizationInvalid: 'The Organization ID format is invalid.', saved: 'Saved.',
      saveOrganizationFirst: 'Save the Organization ID first.', checkingConnection: 'Checking the connection…',
      connectionSuccess: 'Success: {count} conversations found.', notAuthenticated: 'Not authenticated. Make sure you are signed in to claude.ai.',
      accessDenied: 'Access denied. The Organization ID may be incorrect.', connectionFailed: 'Connection failed (status: {status}).',
      connectionError: 'Connection error: {message}', exportAs: 'Export as {format}', chooseFormat: 'Use {format}',
      exporting: 'Exporting as {format}…', exportSuccess: '{format} export saved.', openConversation: 'Open a conversation to export it.',
      exportDisabled: '{platform} export is disabled. Enable it in Settings.', setupRequired: 'Set your Claude Organization ID in Settings.',
      clickToOpenOptions: 'Click to open Settings.', authenticationError: 'Your session is invalid. Sign in and try again.',
      conversationNotFound: 'The conversation could not be found.', contentError: 'The conversation content could not be read. Reload the page and try again.',
      apiError: 'The conversation could not be exported. Try again.', genericError: 'Export failed. Try again.',
      popupExportTitle: 'Export current conversation', popupUnsupportedTab: 'Open a conversation on claude.ai, chatgpt.com, or gemini.google.com first.'
    },
    ja: {
      languageEnglish: '英語', languageJapanese: '日本語', popupSubtitle: 'クイック設定',
      includeMetadata: 'メタデータを含める', includeMetadataDesc: '作成日時・モデル名などを出力に含めます。',
      showFloatingButton: 'フローティングボタンを表示', showFloatingButtonDesc: '対応する会話ページに形式ボタンを表示します。',
      openOptions: '設定を開く', optionsSubtitle: 'Claude、ChatGPT、Geminiの会話をエクスポートします。',
      exportSettings: 'エクスポート設定', outputFormat: '出力形式', markdown: 'Markdown', json: 'JSON',
      jsonFull: 'JSON（全データ）', plainText: 'プレーンテキスト', claudeOrganization: 'Claude.ai — Organization ID',
      organizationPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', organizationDesc: 'claude.aiのエクスポートに必要なUUID形式のIDです。',
      save: '保存', testConnection: '接続テスト', organizationHelp: 'Organization IDの調べ方',
      organizationHelpStep1: 'claude.ai/settings/accountを開きます。', organizationHelpStep2: 'Organization IDをコピーします。',
      organizationHelpStep3: '上の欄に貼り付けて保存します。', supportedPlatforms: '対応プラットフォーム',
      claudeDesc: 'REST API経由でエクスポート', chatgptDesc: '内部API経由でエクスポート',
      geminiDesc: 'ページに表示された会話をエクスポート', organizationRequired: 'Organization IDを入力してください。',
      organizationInvalid: 'Organization IDの形式が不正です。', saved: '保存しました。',
      saveOrganizationFirst: 'Organization IDを先に保存してください。', checkingConnection: '接続を確認しています…',
      connectionSuccess: '成功: {count}件の会話が見つかりました。', notAuthenticated: '未認証です。claude.aiにログインしているか確認してください。',
      accessDenied: 'アクセスが拒否されました。Organization IDが間違っている可能性があります。', connectionFailed: '接続に失敗しました（status: {status}）。',
      connectionError: '接続エラー: {message}', exportAs: '{format}でエクスポート', chooseFormat: '{format}を使用',
      exporting: '{format}でエクスポートしています…', exportSuccess: '{format}形式で保存しました。', openConversation: 'エクスポートする会話を開いてください。',
      exportDisabled: '{platform}のエクスポートは無効です。設定から有効にしてください。', setupRequired: '設定でClaudeのOrganization IDを設定してください。',
      clickToOpenOptions: 'クリックして設定を開きます。', authenticationError: 'セッションが無効です。ログインして再度お試しください。',
      conversationNotFound: '会話が見つかりませんでした。', contentError: '会話内容を取得できませんでした。ページを再読み込みしてお試しください。',
      apiError: '会話をエクスポートできませんでした。再度お試しください。', genericError: 'エクスポートに失敗しました。再度お試しください。',
      popupExportTitle: '現在の会話をエクスポート', popupUnsupportedTab: 'claude.ai / chatgpt.com / gemini.google.com の会話を開いてください。'
    }
  };

  function normalizeLanguage(language) { return language === 'ja' ? 'ja' : DEFAULT_LANGUAGE; }
  function t(language, key, params = {}) {
    const lang = normalizeLanguage(language);
    const template = messages[lang][key] || messages.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? `{${name}}`));
  }
  function apply(root, language) {
    const lang = normalizeLanguage(language);
    root.documentElement?.setAttribute('lang', lang);
    root.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = t(lang, element.dataset.i18n); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => { element.setAttribute('placeholder', t(lang, element.dataset.i18nPlaceholder)); });
    root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => { element.setAttribute('aria-label', t(lang, element.dataset.i18nAriaLabel)); });
  }
  global.LLMExporterI18n = { DEFAULT_LANGUAGE, messages, normalizeLanguage, t, apply };
})(globalThis);
