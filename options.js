const DEFAULT_SETTINGS = {
  enableClaude: true, enableChatGPT: true, enableGemini: false,
  exportFormat: 'markdown', includeMetadata: true, showFloatingButton: true, uiLanguage: 'en'
};
let currentLanguage = 'en';
const visibleStatuses = new Map();

function message(key, params) { return LLMExporterI18n.t(currentLanguage, key, params); }
function applyLanguage(language) {
  currentLanguage = LLMExporterI18n.normalizeLanguage(language);
  LLMExporterI18n.apply(document, currentLanguage);
  document.querySelectorAll('[data-language]').forEach((button) => {
    const active = button.dataset.language === currentLanguage;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  visibleStatuses.forEach((status, id) => {
    document.getElementById(id).textContent = message(status.key, status.params);
  });
}
function showStatus(id, key, type, params) {
  const element = document.getElementById(id);
  element.textContent = message(key, params);
  element.className = `status ${type}`;
  visibleStatuses.set(id, { key, params });
}
function hideStatus(id) {
  document.getElementById(id).className = 'status';
  visibleStatuses.delete(id);
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({ ...DEFAULT_SETTINGS, organizationId: '' }, (settings) => {
    document.getElementById('orgId').value = settings.organizationId;
    document.getElementById('enableClaude').checked = settings.enableClaude;
    document.getElementById('enableChatGPT').checked = settings.enableChatGPT;
    document.getElementById('enableGemini').checked = settings.enableGemini;
    document.getElementById('format').value = settings.exportFormat;
    document.getElementById('includeMetadata').checked = settings.includeMetadata;
    document.getElementById('showFloatingButton').checked = settings.showFloatingButton;
    applyLanguage(settings.uiLanguage);
  });

  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', () => chrome.storage.sync.set({ uiLanguage: button.dataset.language }));
  });
  document.getElementById('format').addEventListener('change', (event) => chrome.storage.sync.set({ exportFormat: event.target.value }));
  ['includeMetadata', 'showFloatingButton', 'enableClaude', 'enableChatGPT', 'enableGemini'].forEach((id) => {
    document.getElementById(id).addEventListener('change', (event) => chrome.storage.sync.set({ [id]: event.target.checked }));
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const organizationId = document.getElementById('orgId').value.trim();
    if (!organizationId) return showStatus('status', 'organizationRequired', 'error');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
      return showStatus('status', 'organizationInvalid', 'error');
    }
    chrome.storage.sync.set({ organizationId }, () => {
      showStatus('status', 'saved', 'success');
      setTimeout(() => hideStatus('status'), 2000);
    });
  });

  document.getElementById('testBtn').addEventListener('click', async () => {
    const organizationId = document.getElementById('orgId').value.trim();
    if (!organizationId) return showStatus('testStatus', 'saveOrganizationFirst', 'error');
    showStatus('testStatus', 'checkingConnection', 'success');
    try {
      const response = await fetch(`https://claude.ai/api/organizations/${organizationId}/chat_conversations`, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (response.ok) {
        const data = await response.json();
        showStatus('testStatus', 'connectionSuccess', 'success', { count: data.length });
      } else if (response.status === 401) showStatus('testStatus', 'notAuthenticated', 'error');
      else if (response.status === 403) showStatus('testStatus', 'accessDenied', 'error');
      else showStatus('testStatus', 'connectionFailed', 'error', { status: response.status });
    } catch (error) {
      showStatus('testStatus', 'connectionError', 'error', { message: error.message });
    }
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.uiLanguage) applyLanguage(changes.uiLanguage.newValue);
  if (changes.exportFormat) document.getElementById('format').value = changes.exportFormat.newValue;
  ['includeMetadata', 'showFloatingButton', 'enableClaude', 'enableChatGPT', 'enableGemini'].forEach((id) => {
    if (changes[id]) document.getElementById(id).checked = changes[id].newValue;
  });
});
