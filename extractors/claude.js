// extractors/claude.js — Claude.ai 会話エクスポーター
// 既存 content.js から移植。JSON schema / Markdown 整形を厳密に維持（下位互換保証）

import { parseResponse } from '../lib/errors.js';

// Default model timeline for null models
const DEFAULT_MODEL_TIMELINE = [
  { date: new Date('2024-01-01'), model: 'claude-3-sonnet-20240229' },
  { date: new Date('2024-06-20'), model: 'claude-3-5-sonnet-20240620' },
  { date: new Date('2024-10-22'), model: 'claude-3-5-sonnet-20241022' },
  { date: new Date('2025-02-29'), model: 'claude-3-7-sonnet-20250219' },
  { date: new Date('2025-05-14'), model: 'claude-sonnet-4-20250514' },
  { date: new Date('2025-09-29'), model: 'claude-sonnet-4-5-20250929' },
];

function inferModel(conversation) {
  if (conversation.model) {
    return conversation.model;
  }
  const conversationDate = new Date(conversation.created_at);
  for (let i = DEFAULT_MODEL_TIMELINE.length - 1; i >= 0; i--) {
    if (conversationDate >= DEFAULT_MODEL_TIMELINE[i].date) {
      return DEFAULT_MODEL_TIMELINE[i].model;
    }
  }
  return DEFAULT_MODEL_TIMELINE[0].model;
}

// Fetch conversation data
async function fetchConversation(orgId, conversationId) {
  const url = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`;

  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });

  const data = response.ok ? await response.json() : null;
  return parseResponse({ status: response.status, ok: response.ok, data });
}

// Helper function to reconstruct the current branch from the message tree
function getCurrentBranch(data) {
  if (!data.chat_messages || !data.current_leaf_message_uuid) {
    return [];
  }

  const messageMap = new Map();
  data.chat_messages.forEach(msg => {
    messageMap.set(msg.uuid, msg);
  });

  const branch = [];
  let currentUuid = data.current_leaf_message_uuid;

  while (currentUuid && messageMap.has(currentUuid)) {
    const message = messageMap.get(currentUuid);
    branch.unshift(message);
    currentUuid = message.parent_message_uuid;
    if (!messageMap.has(currentUuid)) {
      break;
    }
  }

  return branch;
}

// Convert to markdown format (既存互換)
function convertToMarkdown(data, includeMetadata) {
  let markdown = `# ${data.name || 'Untitled Conversation'}\n\n`;

  if (includeMetadata) {
    markdown += `**Created:** ${new Date(data.created_at).toLocaleString()}\n`;
    markdown += `**Updated:** ${new Date(data.updated_at).toLocaleString()}\n`;
    markdown += `**Model:** ${data.model}\n\n`;
    markdown += '---\n\n';
  }

  const branchMessages = getCurrentBranch(data);

  for (const message of branchMessages) {
    const sender = message.sender === 'human' ? '**You**' : '**Claude**';
    markdown += `${sender}:\n\n`;

    if (message.content) {
      for (const content of message.content) {
        if (content.text) {
          markdown += `${content.text}\n\n`;
        }
      }
    } else if (message.text) {
      markdown += `${message.text}\n\n`;
    }

    if (includeMetadata && message.created_at) {
      markdown += `*${new Date(message.created_at).toLocaleString()}*\n\n`;
    }

    markdown += '---\n\n';
  }

  return markdown;
}

// Convert to plain text (既存互換)
function convertToText(data, includeMetadata) {
  let text = '';

  if (includeMetadata) {
    text += `${data.name || 'Untitled Conversation'}\n`;
    text += `Created: ${new Date(data.created_at).toLocaleString()}\n`;
    text += `Updated: ${new Date(data.updated_at).toLocaleString()}\n`;
    text += `Model: ${data.model}\n\n`;
    text += '---\n\n';
  }

  const branchMessages = getCurrentBranch(data);

  let humanSeen = false;
  let assistantSeen = false;

  branchMessages.forEach((message) => {
    let messageText = '';
    if (message.content) {
      for (const content of message.content) {
        if (content.text) {
          messageText += content.text;
        }
      }
    } else if (message.text) {
      messageText = message.text;
    }

    let senderLabel;
    if (message.sender === 'human') {
      senderLabel = humanSeen ? 'H' : 'Human';
      humanSeen = true;
    } else {
      senderLabel = assistantSeen ? 'A' : 'Assistant';
      assistantSeen = true;
    }

    text += `${senderLabel}: ${messageText}\n\n`;
  });

  return text.trim();
}

// Download file utility
async function downloadFile(content, filename, type = 'application/json') {
  const response = await chrome.runtime.sendMessage({
    action: 'downloadExport',
    content,
    filename,
    type
  });
  if (!response?.success) throw new Error(response?.error || 'Download failed');
}

// Handle export request
export async function handleExport(request) {
  const data = await fetchConversation(request.orgId, request.conversationId);
  data.model = inferModel(data);

  let content, filename, type;

  switch (request.format) {
    case 'markdown':
      content = convertToMarkdown(data, request.includeMetadata);
      filename = `claude-conversation-${data.name || request.conversationId}.md`;
      type = 'text/markdown';
      break;
    case 'text':
      content = convertToText(data, request.includeMetadata);
      filename = `claude-conversation-${data.name || request.conversationId}.txt`;
      type = 'text/plain';
      break;
    default:
      content = JSON.stringify(data, null, 2);
      filename = `claude-conversation-${data.name || request.conversationId}.json`;
      type = 'application/json';
  }

  await downloadFile(content, filename, type);
  return { success: true };
}
