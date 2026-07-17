// Supported-site bridge, floating format picker, and one-click export.
(function () {
  function detectPlatform(hostname) {
    if (hostname === 'claude.ai') return 'claude';
    if (hostname === 'chatgpt.com') return 'chatgpt';
    if (hostname === 'gemini.google.com') return 'gemini';
    return null;
  }

  const platform = detectPlatform(location.hostname);
  if (!platform || window.__llmExporterInitialized) return;
  window.__llmExporterInitialized = true;

  const { t, normalizeLanguage } = globalThis.LLMExporterI18n;
  const DEFAULTS = {
    enableClaude: true, enableChatGPT: true, enableGemini: false,
    exportFormat: 'markdown', includeMetadata: true, showFloatingButton: true,
    organizationId: '', uiLanguage: 'en', fabPosition: null
  };
  const FORMATS = {
    markdown: { image: 'images/MD.png', label: 'Markdown' },
    json: { image: 'images/JSON.png', label: 'JSON' },
    text: { image: 'images/TXT.png', label: 'Plain Text' }
  };
  const STATUS_IMAGES = { success: 'images/green_check.png', error: 'images/red_cross.png' };
  const FAB_ID = 'llm-exporter-fab';
  const MOVE_TOLERANCE = 6;

  let extractorPromise = null;
  let fabEl = null;
  let mainButton = null;
  let currentLanguage = 'en';
  let currentPosition = null;
  let fabState = 'idle';
  let statusDescriptor = { key: 'exportAs', params: {} };

  function getExtractor() {
    if (!extractorPromise) extractorPromise = import(chrome.runtime.getURL(`extractors/${platform}.js`));
    return extractorPromise;
  }
  function getFlags() { return new Promise((resolve) => chrome.storage.sync.get(DEFAULTS, resolve)); }
  function getConversationIdFromUrl(url) {
    const pathname = new URL(url).pathname;
    if (platform === 'claude') return pathname.match(/\/chat\/([a-f0-9-]+)/)?.[1] || null;
    if (platform === 'chatgpt') return pathname.match(/\/c\/([a-f0-9-]+)/)?.[1] || null;
    if (platform === 'gemini') return 'dom-scrape';
    return null;
  }
  function isPlatformEnabled(flags) {
    return (platform === 'claude' && flags.enableClaude) ||
      (platform === 'chatgpt' && flags.enableChatGPT) ||
      (platform === 'gemini' && flags.enableGemini);
  }
  function classifyError(error) {
    if (error?.name === 'AuthError') return 'authenticationError';
    if (error?.name === 'NotFoundError') return 'conversationNotFound';
    if (error?.name === 'DomError') return 'contentError';
    if (error?.name === 'ApiError') return 'apiError';
    return 'genericError';
  }

  async function runExport(formatOverride) {
    const flags = await getFlags();
    if (!isPlatformEnabled(flags)) return { success: false, errorKey: 'exportDisabled', params: { platform } };
    const conversationId = getConversationIdFromUrl(location.href);
    if (!conversationId) return { success: false, errorKey: 'openConversation' };
    if (platform === 'claude' && !flags.organizationId) return { success: false, errorKey: 'setupRequired', needsSetup: true };
    const request = {
      action: 'exportConversation', conversationId, orgId: flags.organizationId,
      format: FORMATS[formatOverride] ? formatOverride : flags.exportFormat,
      includeMetadata: flags.includeMetadata
    };
    try {
      const extractor = await getExtractor();
      if (typeof extractor.handleExport !== 'function') throw new Error('Unsupported extractor');
      return await extractor.handleExport(request);
    } catch (error) {
      console.error('[LLM-Exporter] Export error:', error);
      return { success: false, errorKey: classifyError(error) };
    }
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action !== 'exportConversation') return false;
    runExport(request.format).then(sendResponse);
    return true;
  });

  function formatLabel(format) { return FORMATS[format]?.label || FORMATS.markdown.label; }
  function setStatusDescriptor(key, params = {}) {
    statusDescriptor = { key, params };
    const tooltip = fabEl?.querySelector('.llm-exporter-fab-tooltip');
    if (tooltip) tooltip.textContent = t(currentLanguage, key, params);
  }
  function updateLocalizedFab() {
    if (!fabEl) return;
    setStatusDescriptor(statusDescriptor.key, statusDescriptor.params);
    mainButton.setAttribute('aria-label', t(currentLanguage, 'exportAs', { format: formatLabel('markdown') }));
    fabEl.querySelectorAll('.llm-exporter-format-choice').forEach((button) => {
      const label = t(currentLanguage, 'exportAs', { format: formatLabel(button.dataset.format) });
      button.setAttribute('aria-label', label);
      button.title = label;
    });
  }
  function renderFormatButtons() {
    if (!fabEl) return;
    mainButton.querySelector('img').src = chrome.runtime.getURL(FORMATS.markdown.image);
    const choices = fabEl.querySelector('.llm-exporter-format-choices');
    choices.replaceChildren();
    ['json', 'text'].forEach((format) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'llm-exporter-format-choice';
      button.dataset.format = format;
      const image = document.createElement('img');
      image.src = chrome.runtime.getURL(FORMATS[format].image);
      image.alt = '';
      button.appendChild(image);
      const statusBadge = document.createElement('span');
      statusBadge.className = 'llm-exporter-status-badge';
      statusBadge.setAttribute('aria-hidden', 'true');
      const statusIcon = document.createElement('img');
      statusIcon.className = 'llm-exporter-status-icon';
      statusIcon.alt = '';
      statusBadge.appendChild(statusIcon);
      button.appendChild(statusBadge);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        triggerExport(format);
      });
      choices.appendChild(button);
    });
    updateLocalizedFab();
  }

  function safeBounds() {
    const buttonSize = 48;
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(0, innerWidth - buttonSize),
      maxY: Math.max(0, innerHeight - buttonSize)
    };
  }
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
  function updateChoicePlacement(left, top) {
    if (!fabEl) return;
    fabEl.classList.toggle('choices-right', left < 56);
    fabEl.classList.toggle('choices-align-top', top < 28);
    fabEl.classList.toggle('choices-align-bottom', top > innerHeight - 76);
  }
  function applyStoredPosition(position) {
    if (!fabEl || !position || !Number.isFinite(position.xRatio) || !Number.isFinite(position.yRatio)) return;
    const bounds = safeBounds();
    const left = bounds.minX + clamp(position.xRatio, 0, 1) * (bounds.maxX - bounds.minX);
    const top = bounds.minY + clamp(position.yRatio, 0, 1) * (bounds.maxY - bounds.minY);
    fabEl.style.left = `${left}px`;
    fabEl.style.top = `${top}px`;
    fabEl.style.right = 'auto';
    fabEl.style.bottom = 'auto';
    updateChoicePlacement(left, top);
  }
  function persistPosition(left, top) {
    const bounds = safeBounds();
    const position = {
      xRatio: bounds.maxX === bounds.minX ? 0 : (left - bounds.minX) / (bounds.maxX - bounds.minX),
      yRatio: bounds.maxY === bounds.minY ? 0 : (top - bounds.minY) / (bounds.maxY - bounds.minY)
    };
    currentPosition = position;
    chrome.storage.sync.set({ fabPosition: position });
  }

  function installDragBehavior(button) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let suppressClick = false;

    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || fabState === 'busy') return;
      suppressClick = false;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      const rect = fabEl.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      button.setPointerCapture(pointerId);
    });
    button.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) <= MOVE_TOLERANCE) return;
        dragging = true;
        suppressClick = true;
        fabEl.classList.add('is-dragging');
        fabEl.style.left = `${startLeft}px`;
        fabEl.style.top = `${startTop}px`;
        fabEl.style.right = 'auto';
        fabEl.style.bottom = 'auto';
      }
      event.preventDefault();
      const bounds = safeBounds();
      const nextLeft = clamp(event.clientX - offsetX, bounds.minX, bounds.maxX);
      const nextTop = clamp(event.clientY - offsetY, bounds.minY, bounds.maxY);
      fabEl.style.left = `${nextLeft}px`;
      fabEl.style.top = `${nextTop}px`;
      updateChoicePlacement(nextLeft, nextTop);
    });
    function finish(event) {
      if (event.pointerId !== pointerId) return;
      if (dragging) {
        const rect = fabEl.getBoundingClientRect();
        persistPosition(rect.left, rect.top);
        fabEl.classList.remove('is-dragging');
        dragging = false;
      }
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      pointerId = null;
    }
    button.addEventListener('pointerup', finish);
    button.addEventListener('pointercancel', finish);
    button.addEventListener('click', (event) => {
      if (suppressClick) {
        event.preventDefault();
        suppressClick = false;
        return;
      }
      triggerExport('markdown');
    });
  }

  function ensureFab() {
    if (fabEl) return fabEl;
    fabEl = document.createElement('div');
    fabEl.id = FAB_ID;
    fabEl.innerHTML = '<div class="llm-exporter-format-choices"></div><button class="llm-exporter-main-button" type="button" data-format="markdown"><img alt=""><span class="llm-exporter-status-badge" aria-hidden="true"><img class="llm-exporter-status-icon" alt=""></span></button><span class="llm-exporter-fab-tooltip" role="status" aria-live="polite"></span>';
    mainButton = fabEl.querySelector('.llm-exporter-main-button');
    installDragBehavior(mainButton);
    document.documentElement.appendChild(fabEl);
    renderFormatButtons();
    applyStoredPosition(currentPosition);
    return fabEl;
  }
  function setFabState(state, key, params = {}, format = null) {
    fabState = state;
    ensureFab();
    fabEl.classList.remove('is-busy', 'is-success', 'is-error', 'is-dim');
    fabEl.querySelectorAll('.llm-exporter-main-button, .llm-exporter-format-choice').forEach((button) => {
      button.classList.remove('is-busy', 'is-success', 'is-error');
    });
    fabEl.querySelectorAll('.llm-exporter-status-icon').forEach((icon) => icon.removeAttribute('src'));
    if (state !== 'idle') fabEl.classList.add(`is-${state}`);
    if (format && ['busy', 'success', 'error'].includes(state)) {
      const statusButton = fabEl.querySelector(`[data-format="${format}"]`);
      statusButton?.classList.add(`is-${state}`);
      const image = STATUS_IMAGES[state];
      if (image) statusButton?.querySelector('.llm-exporter-status-icon')?.setAttribute('src', chrome.runtime.getURL(image));
    }
    setStatusDescriptor(key, params);
  }

  async function triggerExport(format) {
    if (fabState === 'busy') return;
    if (fabEl.dataset.pendingSetup === '1') {
      delete fabEl.dataset.pendingSetup;
      chrome.runtime.sendMessage({ action: 'openOptionsPage' });
      refreshFabState();
      return;
    }
    if (fabState === 'dim') {
      setFabState('dim', 'openConversation');
      return;
    }
    setFabState('busy', 'exporting', { format: formatLabel(format) }, format);
    const result = await runExport(format);
    if (result?.success) {
      setFabState('success', 'exportSuccess', { format: formatLabel(format) }, format);
      setTimeout(refreshFabState, 1800);
    } else if (result?.needsSetup) {
      fabEl.dataset.pendingSetup = '1';
      setFabState('error', 'clickToOpenOptions', {}, format);
    } else {
      setFabState('error', result?.errorKey || 'genericError', result?.params, format);
      setTimeout(refreshFabState, 2600);
    }
  }

  async function refreshFabState() {
    const flags = await getFlags();
    currentLanguage = normalizeLanguage(flags.uiLanguage);
    currentPosition = flags.fabPosition;
    if (!flags.showFloatingButton || !isPlatformEnabled(flags)) {
      fabEl?.remove();
      fabEl = null;
      mainButton = null;
      return;
    }
    ensureFab();
    renderFormatButtons();
    applyStoredPosition(currentPosition);
    delete fabEl.dataset.pendingSetup;
    if (!getConversationIdFromUrl(location.href)) setFabState('dim', 'openConversation');
    else setFabState('idle', 'exportAs', { format: formatLabel('markdown') });
  }

  function watchUrlChanges(onChange) {
    let lastUrl = location.href;
    const check = () => { if (location.href !== lastUrl) { lastUrl = location.href; onChange(); } };
    const wrap = (fn) => function (...args) { const result = fn.apply(this, args); check(); return result; };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    addEventListener('popstate', check);
    setInterval(check, 1000);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.uiLanguage) currentLanguage = normalizeLanguage(changes.uiLanguage.newValue);
    if (changes.fabPosition) currentPosition = changes.fabPosition.newValue;
    refreshFabState();
  });
  addEventListener('resize', () => {
    if (!fabEl) return;
    if (currentPosition) applyStoredPosition(currentPosition);
    else {
      const rect = fabEl.getBoundingClientRect();
      const bounds = safeBounds();
      const nextLeft = clamp(rect.left, bounds.minX, bounds.maxX);
      const nextTop = clamp(rect.top, bounds.minY, bounds.maxY);
      fabEl.style.left = `${nextLeft}px`;
      fabEl.style.top = `${nextTop}px`;
      fabEl.style.right = 'auto'; fabEl.style.bottom = 'auto';
      updateChoicePlacement(nextLeft, nextTop);
    }
  });

  function init() { refreshFabState(); watchUrlChanges(refreshFabState); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  console.log(`[LLM-Exporter] ${platform} listener registered`);
})();
