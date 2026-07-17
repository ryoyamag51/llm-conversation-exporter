const POPUP_DEFAULTS = { includeMetadata: true, showFloatingButton: true, uiLanguage: 'en' };
const FORMAT_LABEL_KEY = { markdown: 'markdown', json: 'json', text: 'plainText' };

let popupLanguage = 'en';
let popupStatusState = null;

function applyPopupLanguage(language) {
  popupLanguage = LLMExporterI18n.normalizeLanguage(language);
  LLMExporterI18n.apply(document, popupLanguage);
  document.querySelectorAll('[data-language]').forEach((button) => {
    const active = button.dataset.language === popupLanguage;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (popupStatusState) {
    document.getElementById('popupStatus').textContent = LLMExporterI18n.t(popupLanguage, popupStatusState.key, popupStatusState.params);
  }
}

function showPopupStatus(key, type, params) {
  const element = document.getElementById('popupStatus');
  element.textContent = LLMExporterI18n.t(popupLanguage, key, params);
  element.className = `status ${type}`;
  popupStatusState = { key, params };
}
function hidePopupStatus() {
  document.getElementById('popupStatus').className = 'status';
  popupStatusState = null;
}

function formatLabel(format) { return LLMExporterI18n.t(popupLanguage, FORMAT_LABEL_KEY[format] || 'markdown'); }

function runPopupExport(format) {
  const buttons = document.querySelectorAll('.export-btn');
  buttons.forEach((button) => { button.disabled = true; });
  showPopupStatus('exporting', 'success', { format: formatLabel(format) });
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) {
      buttons.forEach((button) => { button.disabled = false; });
      return showPopupStatus('popupUnsupportedTab', 'error');
    }
    chrome.tabs.sendMessage(tab.id, { action: 'exportConversation', format }, (response) => {
      buttons.forEach((button) => { button.disabled = false; });
      if (chrome.runtime.lastError) return showPopupStatus('popupUnsupportedTab', 'error');
      if (response?.success) {
        showPopupStatus('exportSuccess', 'success', { format: formatLabel(format) });
        setTimeout(hidePopupStatus, 2500);
      } else {
        showPopupStatus(response?.errorKey || 'genericError', 'error', response?.params);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(POPUP_DEFAULTS, (settings) => {
    document.getElementById('includeMetadata').checked = settings.includeMetadata;
    document.getElementById('showFloatingButton').checked = settings.showFloatingButton;
    applyPopupLanguage(settings.uiLanguage);
  });
  ['includeMetadata', 'showFloatingButton'].forEach((id) => {
    document.getElementById(id).addEventListener('change', (event) => chrome.storage.sync.set({ [id]: event.target.checked }));
  });
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', () => chrome.storage.sync.set({ uiLanguage: button.dataset.language }));
  });
  document.querySelectorAll('.export-btn').forEach((button) => {
    button.addEventListener('click', () => runPopupExport(button.dataset.format));
  });
  document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.includeMetadata) document.getElementById('includeMetadata').checked = changes.includeMetadata.newValue;
  if (changes.showFloatingButton) document.getElementById('showFloatingButton').checked = changes.showFloatingButton.newValue;
  if (changes.uiLanguage) applyPopupLanguage(changes.uiLanguage.newValue);
});
