// extractors/gemini.js — Gemini 会話エクスポーター
// DOM スクレイピングベース。公式 API がないため壊れやすい設計であることに留意。
// セレクタ候補を複数持ち、MutationObserver で遅延描画に対応する。

import { DomError } from '../lib/errors.js';

// --- セレクタ定数（複数候補） ---

const SELECTORS = {
  userQuery: [
    'user-query .query-text',
    'user-query .query-content',
    '[data-message-author-role="user"]',
  ],
  modelResponse: [
    'model-response .response-container',
    'model-response .markdown',
    'model-response message-content',
    '[data-message-author-role="model"]',
  ],
  conversationTitle: [
    'h1.conversation-title',
    '[data-conversation-title]',
    'title',
  ],
  modelName: [
    '.model-selector-button .model-name',
    '[data-model-name]',
  ],
  // ターン全体を取得するためのセレクタ
  conversationTurn: [
    'conversation-turn',
    '.conversation-turn',
    '[data-turn-id]',
  ],
};

function querySelector(candidates) {
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function querySelectorAll(candidates) {
  for (const sel of candidates) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) return Array.from(els);
  }
  return [];
}

// --- 待機戦略 ---

async function waitForContent(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (querySelectorAll(SELECTORS.userQuery).length > 0) {
      resolve();
      return;
    }
    const observer = new MutationObserver(() => {
      if (querySelectorAll(SELECTORS.userQuery).length > 0) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new DomError('Timed out loading Gemini content. Reload the page and try again.'));
    }, timeoutMs);
  });
}

// --- DOM からメッセージを抽出 ---

function extractMessages() {
  const messages = [];

  // 方法1: conversation-turn ベースで交互に取得
  const turns = querySelectorAll(SELECTORS.conversationTurn);
  if (turns.length > 0) {
    for (const turn of turns) {
      // ターン内のユーザークエリ
      const userEl = turn.querySelector('user-query .query-text')
        || turn.querySelector('user-query .query-content')
        || turn.querySelector('[data-message-author-role="user"]');

      if (userEl) {
        messages.push({
          role: 'user',
          content: userEl.innerText.trim(),
        });
      }

      // ターン内のモデル応答
      const modelEl = turn.querySelector('model-response .response-container')
        || turn.querySelector('model-response .markdown')
        || turn.querySelector('model-response message-content')
        || turn.querySelector('[data-message-author-role="model"]');

      if (modelEl) {
        messages.push({
          role: 'assistant',
          content: modelEl.innerText.trim(),
        });
      }
    }
    return messages;
  }

  // 方法2: ユーザー/モデル要素を個別に取得して交互に結合
  const userEls = querySelectorAll(SELECTORS.userQuery);
  const modelEls = querySelectorAll(SELECTORS.modelResponse);

  if (userEls.length === 0 && modelEls.length === 0) {
    throw new DomError(
      'Could not read the Gemini conversation. ' +
      'The page structure may have changed; please wait for an extension update.'
    );
  }

  const maxLen = Math.max(userEls.length, modelEls.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < userEls.length) {
      messages.push({
        role: 'user',
        content: userEls[i].innerText.trim(),
      });
    }
    if (i < modelEls.length) {
      messages.push({
        role: 'assistant',
        content: modelEls[i].innerText.trim(),
      });
    }
  }

  return messages;
}

function getConversationTitle() {
  const titleEl = querySelector(SELECTORS.conversationTitle);
  if (titleEl && titleEl.tagName === 'TITLE') {
    // <title> タグの場合、" - Gemini" のサフィックスを除去
    return titleEl.textContent.replace(/ - Gemini$/, '').trim() || 'Untitled Conversation';
  }
  return titleEl?.innerText?.trim() || document.title.replace(/ - Gemini$/, '').trim() || 'Untitled Conversation';
}

function getModelName() {
  const el = querySelector(SELECTORS.modelName);
  return el?.innerText?.trim() || undefined;
}

// --- 正規化 ---

function normalizeConversation() {
  const messages = extractMessages();
  return {
    id: location.pathname.split('/').pop() || 'gemini-conversation',
    name: getConversationTitle(),
    model: getModelName(),
    created_at: new Date().toISOString(),
    messages,
  };
}

// --- 出力フォーマット ---

function convertToMarkdown(conv, includeMetadata) {
  let md = `# ${conv.name}\n\n`;

  if (includeMetadata) {
    md += `**Exported:** ${new Date(conv.created_at).toLocaleString()}\n`;
    if (conv.model) md += `**Model:** ${conv.model}\n`;
    md += '\n---\n\n';
  }

  for (const msg of conv.messages) {
    const sender = msg.role === 'user' ? '**You**' : '**Gemini**';
    md += `${sender}:\n\n${msg.content}\n\n`;
    md += '---\n\n';
  }

  return md;
}

function convertToText(conv, includeMetadata) {
  let text = '';

  if (includeMetadata) {
    text += `${conv.name}\n`;
    text += `Exported: ${new Date(conv.created_at).toLocaleString()}\n`;
    if (conv.model) text += `Model: ${conv.model}\n`;
    text += '\n---\n\n';
  }

  let userSeen = false;
  let assistantSeen = false;

  for (const msg of conv.messages) {
    let label;
    if (msg.role === 'user') {
      label = userSeen ? 'H' : 'Human';
      userSeen = true;
    } else {
      label = assistantSeen ? 'A' : 'Assistant';
      assistantSeen = true;
    }
    text += `${label}: ${msg.content}\n\n`;
  }

  return text.trim();
}

async function downloadFile(content, filename, type = 'application/json') {
  const response = await chrome.runtime.sendMessage({
    action: 'downloadExport',
    content,
    filename,
    type
  });
  if (!response?.success) throw new Error(response?.error || 'Download failed');
}

// --- エクスポートハンドラ ---

export async function handleExport(request) {
  await waitForContent();
  const conv = normalizeConversation();

  let content, filename, type;

  switch (request.format) {
    case 'markdown':
      content = convertToMarkdown(conv, request.includeMetadata);
      filename = `gemini-conversation-${conv.name}.md`;
      type = 'text/markdown';
      break;
    case 'text':
      content = convertToText(conv, request.includeMetadata);
      filename = `gemini-conversation-${conv.name}.txt`;
      type = 'text/plain';
      break;
    default:
      content = JSON.stringify(conv, null, 2);
      filename = `gemini-conversation-${conv.name}.json`;
      type = 'application/json';
  }

  await downloadFile(content, filename, type);
  return { success: true };
}
