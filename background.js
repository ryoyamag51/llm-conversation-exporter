// background.js — service worker
// 1. 拡張インストール時の content script 注入
// 2. FETCH_IN_PAGE_CONTEXT: ChatGPT フォールバック用ページ文脈 fetch

const SUPPORTED_PATTERNS = [
  'https://claude.ai/*',
  'https://chatgpt.com/*',
  'https://gemini.google.com/*',
];

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LLM-Exporter] Extension installed');
  chrome.storage.sync.remove(['askSaveLocation', 'downloadSubfolder']);

  // Inject content script into already-open tabs when extension is installed/updated
  SUPPORTED_PATTERNS.forEach(pattern => {
    chrome.tabs.query({ url: pattern }, (tabs) => {
      tabs.forEach(tab => {
        Promise.all([
          chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] }),
          chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/i18n.js', 'content.js'] }),
        ]).catch(err => console.log('[LLM-Exporter] Could not inject into tab', tab.id, err));
      });
    });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'openOptionsPage') {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (msg.action === 'downloadExport') {
    const filename = String(msg.filename || 'conversation-export.txt')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'conversation-export.txt';
    const mimeType = String(msg.type || 'text/plain').replace(/[\r\n;,]/g, '');
    const url = 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(String(msg.content ?? ''));
    chrome.downloads.download({
      url,
      filename,
      conflictAction: 'uniquify',
    }, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) sendResponse({ success: false, error: error.message });
      else sendResponse({ success: true, downloadId });
    });
    return true;
  }

  // ChatGPT フォールバック: ページ文脈で fetch を実行
  // chatgpt.js → runtime.sendMessage → background.js → chrome.scripting.executeScript(world:"MAIN")
  if (msg.type === 'FETCH_IN_PAGE_CONTEXT') {
    // popup/options からのメッセージは tabId を持たないため早期リターン
    if (!sender.tab?.id) {
      sendResponse({ error: 'Cannot resolve tab ID. This message is only available from a content script.' });
      return false;
    }
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: async (url, token) => {
        try {
          const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
          const r = await fetch(url, {
            credentials: 'include',
            ...(headers ? { headers } : {}),
          });
          const body = r.ok ? await r.json() : null;
          return { status: r.status, ok: r.ok, data: body };
        } catch {
          // ネットワーク層の例外も握り潰さず、呼び出し元で統一的に扱う
          return { status: 0, ok: false, data: null };
        }
      },
      args: [msg.url, msg.token || null],
    }).then(([result]) => sendResponse(result.result))
      .catch(err => sendResponse({ error: err.message }));
    return true; // 非同期応答を有効化
  }

  return false;
});
