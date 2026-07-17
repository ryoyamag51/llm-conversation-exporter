// extractors/chatgpt.js — ChatGPT 会話エクスポーター
// 認証戦略: セッショントークン取得 + Authorization ヘッダー付き API 呼び出し
// メッセージ正規化: current_node から親を辿り「現行表示ブランチ」を正とする

import { AuthError, NotFoundError, ApiError, parseResponse } from '../lib/errors.js';

// --- 認証戦略 ---

let _cachedToken = null;
let _tokenExpiresAt = 0;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const SESSION_URL = 'https://chatgpt.com/api/auth/session';

function clearTokenCache() {
  _cachedToken = null;
  _tokenExpiresAt = 0;
}

// 手順 1: content script 起点の直接 fetch
async function fetchDirect(url, token = null) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const res = await fetch(url, {
    credentials: 'include',
    ...(headers ? { headers } : {}),
  });
  const data = res.ok ? await res.json() : null;
  return parseResponse({ status: res.status, ok: res.ok, data });
}

// 手順 2: background 経由 MAIN world（フォールバック）
// chatgpt.js → chrome.runtime.sendMessage → background.js → chrome.scripting.executeScript(world:"MAIN")
async function fetchViaBackground(url, token = null) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_IN_PAGE_CONTEXT', url, token },
      (response) => {
        if (chrome.runtime.lastError) return reject(new ApiError(chrome.runtime.lastError.message));
        if (response.error) return reject(new ApiError(response.error));
        try {
          resolve(parseResponse(response));
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

async function fetchSession() {
  try {
    return await fetchDirect(SESSION_URL);
  } catch (directError) {
    try {
      return await fetchViaBackground(SESSION_URL);
    } catch (backgroundError) {
      if (backgroundError instanceof AuthError) throw backgroundError;
      if (directError instanceof AuthError) throw directError;
      throw backgroundError;
    }
  }
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && _cachedToken && Date.now() + TOKEN_REFRESH_BUFFER_MS < _tokenExpiresAt) {
    return _cachedToken;
  }

  const session = await fetchSession();
  const token = session?.accessToken;
  if (!token) {
    clearTokenCache();
    throw new AuthError('Could not get an access token. Make sure you are signed in to chatgpt.com.');
  }

  const expiresAt = Date.parse(session?.expires ?? '');
  if (Number.isFinite(expiresAt)) {
    _cachedToken = token;
    _tokenExpiresAt = expiresAt;
  } else {
    // expires が不正な場合はキャッシュせず、毎回取り直す
    clearTokenCache();
  }

  return token;
}

// 正式エントリーポイント: 2 系統をオーケストレート
async function fetchWithAuth(url) {
  const token = await getAccessToken();

  if (!token) {
    clearTokenCache();
    throw new AuthError('Could not get an access token. Make sure you are signed in to chatgpt.com.');
  }

  try {
    return await fetchDirect(url, token);
  } catch (err) {
    if (err instanceof AuthError) {
      clearTokenCache();
      const freshToken = await getAccessToken(true);
      return await fetchViaBackground(url, freshToken);
    }

    if (err instanceof NotFoundError && token) {
      try {
        clearTokenCache();
        const refreshedToken = await getAccessToken(true);
        return await fetchDirect(url, refreshedToken);
      } catch (retryErr) {
        try {
          const tokenForFallback = await getAccessToken();
          return await fetchViaBackground(url, tokenForFallback);
        } catch {
          throw retryErr;
        }
      }
    }

    try {
      return await fetchViaBackground(url, token);
    } catch (backgroundErr) {
      if (backgroundErr instanceof AuthError) {
        clearTokenCache();
        const freshToken = await getAccessToken(true);
        return await fetchViaBackground(url, freshToken);
      }
      throw backgroundErr;
    }
  }
}

async function fetchConversation(url) {
  return fetchWithAuth(url);
}

// --- メッセージ正規化 ---

function normalizeContentPart(part) {
  if (typeof part === 'string') return part;
  if (part?.content_type === 'text') return part.text ?? '';
  if (part?.content_type === 'code') return `\`\`\`\n${part.text ?? ''}\n\`\`\``;
  if (part?.content_type === 'image_asset_pointer') return '[Image attachment]';
  if (part?.content_type === 'tether_browsing_display') return `[Web search result: ${part.result?.url ?? ''}]`;
  if (part?.content_type === 'multimodal_text') {
    return (part.parts ?? []).map(normalizeContentPart).join('');
  }
  console.warn('[LLM-Exporter] Unknown content_type:', part?.content_type, part);
  return '[Unsupported content]';
}

function normalizeMessage(node) {
  const msg = node.message;
  if (!msg) return null;

  // system メッセージや tool の結果は表示用として含めるが、
  // author.role が未知の場合は 'assistant' にフォールバック
  const role = msg.author?.role ?? 'assistant';

  // 「system」ロールのうち非表示のメタデータメッセージをスキップ
  if (role === 'system' && msg.metadata?.is_visually_hidden_from_conversation) return null;

  const parts = msg.content?.parts ?? [];
  const content = parts.map(normalizeContentPart).join('\n').trim();

  // 空コンテンツの tool メッセージなどはスキップ
  if (!content && role === 'tool') return null;

  return {
    role,
    content,
    created_at: msg.create_time
      ? new Date(msg.create_time * 1000).toISOString()
      : undefined,
  };
}

// current_node から親を辿って「現行表示ブランチ」を構築
function extractCurrentBranch(data) {
  const mapping = data.mapping;
  if (!mapping || !data.current_node) return [];

  const branch = [];
  let nodeId = data.current_node;

  while (nodeId && mapping[nodeId]) {
    const node = mapping[nodeId];
    const normalized = normalizeMessage(node);
    if (normalized) {
      branch.unshift(normalized);
    }
    nodeId = node.parent;
  }

  return branch;
}

// 会話データを正規化
function normalizeConversation(data) {
  return {
    id: data.conversation_id ?? '',
    name: data.title ?? 'Untitled Conversation',
    model: data.default_model_slug ?? undefined,
    created_at: data.create_time
      ? new Date(data.create_time * 1000).toISOString()
      : new Date().toISOString(),
    messages: extractCurrentBranch(data),
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return null;
}

// --- 出力フォーマット ---

function convertToMarkdown(conv, includeMetadata) {
  let md = `# ${conv.name}\n\n`;

  if (includeMetadata) {
    md += `**Created:** ${new Date(conv.created_at).toLocaleString()}\n`;
    if (conv.model) md += `**Model:** ${conv.model}\n`;
    if (conv.project_name) md += `**Project:** ${conv.project_name}\n`;
    if (conv.project_id) md += `**Project ID:** ${conv.project_id}\n`;
    md += '\n---\n\n';
  }

  for (const msg of conv.messages) {
    const sender = msg.role === 'user' ? '**You**' : '**ChatGPT**';
    md += `${sender}:\n\n${msg.content}\n\n`;
    if (includeMetadata && msg.created_at) {
      md += `*${new Date(msg.created_at).toLocaleString()}*\n\n`;
    }
    md += '---\n\n';
  }

  return md;
}

function convertToText(conv, includeMetadata) {
  let text = '';

  if (includeMetadata) {
    text += `${conv.name}\n`;
    text += `Created: ${new Date(conv.created_at).toLocaleString()}\n`;
    if (conv.model) text += `Model: ${conv.model}\n`;
    if (conv.project_name) text += `Project: ${conv.project_name}\n`;
    if (conv.project_id) text += `Project ID: ${conv.project_id}\n`;
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
  const conversationId = request.conversationId;
  const apiUrl = `https://chatgpt.com/backend-api/conversation/${conversationId}`;

  const rawData = await fetchConversation(apiUrl);
  const conv = normalizeConversation(rawData);
  conv.project_id = firstNonEmpty(request.projectId, conv.project_id);
  conv.project_name = firstNonEmpty(request.projectName, conv.project_name);

  let content, filename, type;

  switch (request.format) {
    case 'markdown':
      content = convertToMarkdown(conv, request.includeMetadata);
      filename = `chatgpt-conversation-${conv.name || conversationId}.md`;
      type = 'text/markdown';
      break;
    case 'text':
      content = convertToText(conv, request.includeMetadata);
      filename = `chatgpt-conversation-${conv.name || conversationId}.txt`;
      type = 'text/plain';
      break;
    default:
      content = JSON.stringify(conv, null, 2);
      filename = `chatgpt-conversation-${conv.name || conversationId}.json`;
      type = 'application/json';
  }

  await downloadFile(content, filename, type);
  return { success: true };
}
