export function buildDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AnyClick Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      background: #1e293b;
      padding: 15px 30px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-bottom: 1px solid #334155;
    }
    header h1 {
      font-size: 20px;
      font-weight: 600;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .toolbar-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .top-controls {
      display: flex;
      gap: 10px;
      align-items: center;
      flex: 1;
    }

    .top-controls input[type="text"] {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #f8fafc;
      border-radius: 4px;
      font-size: 14px;
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .toolbar-actions button,
    .top-controls button {
      padding: 8px 15px;
      background: #38bdf8;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }

    .toolbar-actions button:hover,
    .top-controls button:hover {
      background: #0ea5e9;
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .busy-indicator {
      display: none;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #94a3b8;
    }

    .busy-indicator.active {
      display: inline-flex;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid #334155;
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .session-info {
      font-size: 12px;
      color: #94a3b8;
      display: flex;
      gap: 20px;
      margin-top: 5px;
      flex-wrap: wrap;
    }

    .status-message {
      font-size: 13px;
      padding: 8px 12px;
      border-radius: 4px;
      margin-top: 6px;
      display: none;
    }
    .status-message.success {
      background: #153e2d;
      color: #4ade80;
      border: 1px solid #16a34a;
    }
    .status-message.error {
      background: #4a1c1c;
      color: #fca5a5;
      border: 1px solid #dc2626;
    }

    .main-workspace {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #334155;
      overflow-y: auto;
      padding: 15px;
      min-width: 0;
    }
    .pane:last-child { border-right: none; }
    .pane-title {
      font-size: 16px;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 15px;
    }

    .flow-header,
    .elements-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 15px;
    }

    .flow-header .pane-title,
    .elements-header .pane-title {
      margin-bottom: 0;
    }

    .flow-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .elements-tools {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 15px;
    }

    .elements-filter {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #f8fafc;
      border-radius: 4px;
      font-size: 13px;
    }

    .save-flow-btn,
    .run-flow-btn {
      padding: 7px 12px;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }

    .save-flow-btn {
      background: #22c55e;
    }
    .save-flow-btn:hover {
      background: #16a34a;
    }

    .run-flow-btn {
      background: #38bdf8;
    }
    .run-flow-btn:hover {
      background: #0ea5e9;
    }

    .save-flow-btn:disabled,
    .run-flow-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .element-group { margin-bottom: 20px; }
    .element-group-title {
      font-size: 14px;
      text-transform: uppercase;
      color: #94a3b8;
      letter-spacing: 0.05em;
      margin-bottom: 10px;
      border-bottom: 1px solid #33415555;
      padding-bottom: 5px;
    }
    .element-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-size: 13px;
    }
    .element-card-label-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .element-id-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 30px;
      padding: 2px 8px;
      border-radius: 999px;
      background: #0ea5e9;
      color: white;
      font-size: 11px;
      font-weight: 700;
    }
    .element-card-label {
      font-weight: 600;
      color: #f8fafc;
      word-break: break-word;
    }
    .element-card-text {
      color: #cbd5e1;
      word-break: break-word;
    }
    .element-card-meta {
      font-size: 11px;
      color: #94a3b8;
      word-break: break-word;
    }
    .element-card-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 2px;
    }
    .element-card-actions button {
      padding: 6px 10px;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }
    .element-card-actions .test-element-btn {
      background: #6366f1;
    }
    .element-card-actions .test-element-btn:hover {
      background: #4f46e5;
    }
    .element-card-actions .add-to-flow-btn {
      background: #22c55e;
    }
    .element-card-actions .add-to-flow-btn:hover {
      background: #16a34a;
    }

    .flow-step-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 13px;
      position: relative;
    }
    .flow-step-actions {
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      gap: 5px;
    }
    .flow-step-actions button {
      padding: 4px 8px;
      font-size: 11px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: #334155;
      color: #cbd5e1;
      transition: background 0.2s;
    }
    .flow-step-actions button:hover { background: #475569; }
    .flow-step-actions .run-btn {
      background: #38bdf8;
      color: white;
    }
    .flow-step-actions .run-btn:hover { background: #0ea5e9; }

    .flow-step-label {
      font-weight: 600;
      color: #f8fafc;
      margin-right: 110px;
      word-break: break-word;
    }

    .flow-step-controls {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
      align-items: center;
      margin-right: 110px;
    }

    .flow-step-controls label {
      color: #94a3b8;
      font-size: 12px;
    }

    .flow-step-action-select,
    .flow-step-value-input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #f8fafc;
      border-radius: 4px;
      font-size: 13px;
    }

    .flow-step-value-row {
      display: none;
      grid-template-columns: 150px 1fr;
      gap: 10px;
      align-items: center;
      margin-right: 110px;
    }

    .flow-step-value-row.visible {
      display: grid;
    }

    .bottom-panel-area {
      display: flex;
      height: 32vh;
      border-top: 1px solid #334155;
      overflow: hidden;
    }
    .bottom-section {
      flex: 1;
      border-right: 1px solid #334155;
      overflow-y: auto;
      padding: 15px;
      min-width: 0;
    }
    .bottom-section:last-child { border-right: none; }

    .section-title {
      font-size: 14px;
      text-transform: uppercase;
      color: #94a3b8;
      letter-spacing: 0.05em;
      margin-bottom: 10px;
    }

    .memory-card,
    .session-card,
    .health-card {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      margin-bottom: 10px;
      padding: 10px;
      transition: all 0.2s;
    }
    .memory-card:hover,
    .session-card:hover,
    .health-card:hover {
      border-color: #38bdf8;
      background: #172033;
    }

    .memory-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }

    .memory-actions button {
      padding: 6px 10px;
      border: none;
      border-radius: 4px;
      color: white;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .memory-run-btn {
      background: #38bdf8;
    }
    .memory-run-btn:hover {
      background: #0ea5e9;
    }

    .memory-edit-btn {
      background: #6366f1;
    }
    .memory-edit-btn:hover {
      background: #4f46e5;
    }

    .memory-delete-btn {
      background: #ef4444;
    }
    .memory-delete-btn:hover {
      background: #dc2626;
    }

    .editing-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 6px;
      border-radius: 999px;
      background: #22c55e;
      color: white;
      font-size: 10px;
      font-weight: 700;
      margin-left: 8px;
    }

    .card-title {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 8px;
      color: #f8fafc;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      word-break: break-word;
    }
    .card-meta {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 8px;
      word-break: break-word;
    }
    .card-content {
      font-size: 12px;
      color: #cbd5e1;
      word-break: break-word;
    }
    .card-stats {
      margin-top: 10px;
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }

    .memory-step {
      font-size: 12px;
      background: #334155;
      padding: 4px 8px;
      border-radius: 4px;
      display: inline-block;
      margin: 2px 4px 2px 0;
      color: #cbd5e1;
      word-break: break-word;
    }

    .logs-panel {
      background: #000;
      border: 1px solid #334155;
      border-radius: 4px;
      overflow-y: auto;
      font-family: "Menlo", "Monaco", "Courier New", monospace;
      font-size: 13px;
      line-height: 1.5;
      padding: 10px;
      height: 100%;
    }
    .log-entry {
      margin-bottom: 5px;
      display: flex;
      gap: 8px;
      word-break: break-word;
    }
    .log-time {
      color: #64748b;
      min-width: 60px;
      flex-shrink: 0;
    }
    .log-level-info { color: #38bdf8; }
    .log-level-error { color: #ef4444; }
    .log-level-warn { color: #f59e0b; }
    .log-level-debug { color: #a855f7; }
    .log-msg {
      color: #e2e8f0;
      flex: 1;
      word-break: break-word;
    }
    .log-meta {
      color: #94a3b8;
      font-size: 11px;
      margin-top: 4px;
      word-break: break-word;
    }
    .badge {
      background: #0ea5e9;
      color: white;
      padding: 2px 6px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: bold;
    }
    .thinking-block {
      margin-top: 6px;
      padding: 8px;
      background: #1e293b;
      border-left: 3px solid #38bdf8;
      color: #cbd5e1;
      font-style: italic;
      border-radius: 0 4px 4px 0;
      font-family: sans-serif;
      display: block;
      font-size: 12px;
      word-break: break-word;
    }

    .screenshot-panel {
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      border: 1px solid #334155;
      border-radius: 4px;
      height: 100%;
    }
    .screenshot-panel img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .screenshot-placeholder {
      color: #94a3b8;
      font-style: italic;
      text-align: center;
      padding: 10px;
    }
  </style>
</head>
<body>
  <header>
    <h1>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="8" y1="21" x2="16" y2="21"></line>
        <line x1="12" y1="17" x2="12" y2="21"></line>
      </svg>
      AnyClick Dashboard
    </h1>

    <div class="toolbar-row">
      <div class="top-controls">
        <input type="text" id="url-input" placeholder="Enter URL to explore" value="https://news.ycombinator.com/">
      </div>

      <div class="toolbar-actions">
        <div id="busy-indicator" class="busy-indicator" aria-live="polite">
          <span class="spinner"></span>
          <span id="busy-text">Loading...</span>
        </div>
        <button id="start-session-btn">Start New Session</button>
        <button id="refresh-state-btn">Refresh State</button>
      </div>
    </div>

    <div class="session-info">
      <span id="session-id-display">Session ID: N/A</span>
      <span id="current-url-display">URL: N/A</span>
      <span id="current-title-display">Title: N/A</span>
    </div>

    <div id="status-message" class="status-message" aria-live="polite"></div>
  </header>

  <div class="main-workspace">
    <div class="pane" id="available-elements-pane">
      <div class="elements-header">
        <h3 class="pane-title">Available Elements</h3>
      </div>
      <div class="elements-tools">
        <input
          type="text"
          id="elements-filter-input"
          class="elements-filter"
          placeholder="Filter by id, label, text, placeholder, tag, role..."
        >
      </div>
      <div id="elements-list"></div>
    </div>

    <div class="pane" id="flow-builder-pane">
      <div class="flow-header">
        <h3 class="pane-title" id="flow-builder-title">Flow Builder</h3>
        <div class="flow-header-actions">
          <button id="clear-flow-btn" class="run-flow-btn" type="button" style="background: #334155; color: #f8fafc;">Clear Flow</button>
          <button id="run-flow-btn" class="run-flow-btn" type="button" disabled>Run Flow</button>
          <button id="save-flow-btn" class="save-flow-btn" type="button" disabled>Save This Flow</button>
        </div>
      </div>
      <div id="flow-steps-list"></div>
    </div>
  </div>

  <div class="bottom-panel-area">
    <div class="bottom-section">
      <h3 class="section-title">Memory Bank <span class="badge" id="memory-count">0</span></h3>
      <div id="memory-list"></div>
    </div>

    <div class="bottom-section">
      <h3 class="section-title">Active Sessions <span class="badge" id="sessions-count">0</span></h3>
      <div id="sessions-list"></div>
    </div>

    <div class="bottom-section">
      <h3 class="section-title">Health Check</h3>
      <div id="health-panel"></div>
    </div>

    <div class="bottom-section">
      <h3 class="section-title">Live Activity Logs</h3>
      <div class="logs-panel" id="logs-panel"></div>
    </div>

    <div class="bottom-section">
      <h3 class="section-title">Screenshot</h3>
      <div class="screenshot-panel" id="screenshot-panel"></div>
    </div>
  </div>

  <script>
    let currentSessionId = null;
    let flowSteps = [];
    let allAvailableElements = [];
    let currentScreenshotObjectUrl = null;
    let statusHideTimer = null;
    let elementsFilterValue = '';
    let editingRecipeId = null;

    const elementsList = document.getElementById('elements-list');
    const flowStepsList = document.getElementById('flow-steps-list');
    const memoryList = document.getElementById('memory-list');
    const sessionsList = document.getElementById('sessions-list');
    const healthPanel = document.getElementById('health-panel');
    const logsPanel = document.getElementById('logs-panel');
    const screenshotPanel = document.getElementById('screenshot-panel');
    const statusMessageElement = document.getElementById('status-message');
    const urlInput = document.getElementById('url-input');
    const elementsFilterInput = document.getElementById('elements-filter-input');
    const sessionIdDisplay = document.getElementById('session-id-display');
    const currentUrlDisplay = document.getElementById('current-url-display');
    const currentTitleDisplay = document.getElementById('current-title-display');
    const memoryCount = document.getElementById('memory-count');
    const sessionsCount = document.getElementById('sessions-count');
    const startSessionButton = document.getElementById('start-session-btn');
    const refreshStateButton = document.getElementById('refresh-state-btn');
    const clearFlowButton = document.getElementById('clear-flow-btn');
    const runFlowButton = document.getElementById('run-flow-btn');
    const saveFlowButton = document.getElementById('save-flow-btn');
    const busyIndicator = document.getElementById('busy-indicator');
    const busyText = document.getElementById('busy-text');

    function clearChildren(node) {
      while (node.firstChild) {
        node.removeChild(node.firstChild);
      }
    }

    function appendCenteredMessage(container, message, color) {
      clearChildren(container);
      const div = document.createElement('div');
      div.style.padding = '10px';
      div.style.color = color;
      div.style.textAlign = 'center';
      div.style.fontSize = '14px';
      div.textContent = message;
      container.appendChild(div);
    }

    function setScreenshotPlaceholder(message, color) {
      clearChildren(screenshotPanel);
      const span = document.createElement('span');
      span.className = 'screenshot-placeholder';
      if (color) {
        span.style.color = color;
      }
      span.textContent = message;
      screenshotPanel.appendChild(span);
    }

    function setBusy(isBusy, message = 'Loading...') {
      if (isBusy) {
        busyText.textContent = message;
        busyIndicator.classList.add('active');
      } else {
        busyIndicator.classList.remove('active');
        busyText.textContent = 'Loading...';
      }

      startSessionButton.disabled = isBusy;
      refreshStateButton.disabled = isBusy;
      runFlowButton.disabled = isBusy || flowSteps.length === 0;
      saveFlowButton.disabled = isBusy || flowSteps.length === 0;
      urlInput.disabled = isBusy;
      elementsFilterInput.disabled = isBusy;
    }

    function updateFlowButtons() {
      const disabled = flowSteps.length === 0;
      runFlowButton.disabled = disabled;
      saveFlowButton.disabled = disabled;
    }

    async function apiCall(method, path, body) {
      const response = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : null
      });

      if (path === '/browser/screenshot' && response.ok) {
        return response.blob();
      }

      return response.json();
    }

    function updateStatus(message, isError = false) {
      statusMessageElement.textContent = message;
      statusMessageElement.className = 'status-message ' + (isError ? 'error' : 'success');
      statusMessageElement.style.display = 'block';

      if (statusHideTimer) {
        clearTimeout(statusHideTimer);
      }

      statusHideTimer = setTimeout(() => {
        statusMessageElement.style.display = 'none';
      }, 4000);
    }

    function updateFlowBuilderTitle() {
      const titleEl = document.getElementById('flow-builder-title');
      if (titleEl) {
        if (editingRecipeId) {
          titleEl.innerHTML = 'Flow Builder <span style="font-size:12px; padding:2px 6px; border-radius:4px; background:#3b82f6; color:white; margin-left:8px; vertical-align:middle;">Editing: ' + editingRecipeId + '</span>';
        } else {
          titleEl.textContent = 'Flow Builder';
        }
      }
    }

    function updateSessionInfo(url = 'N/A', title = 'N/A') {
      sessionIdDisplay.textContent = 'Session ID: ' + (currentSessionId || 'N/A');
      currentUrlDisplay.textContent = 'URL: ' + url;
      currentTitleDisplay.textContent = 'Title: ' + title;
    }

    function getElementKind(el) {
      const tag = typeof el.tag === 'string' ? el.tag.toUpperCase() : '';
      const typeAttr = typeof el.type === 'string' ? el.type.toLowerCase() : '';
      const role = typeof el.role === 'string' ? el.role.toLowerCase() : '';

      if (tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'link') {
        return 'buttonsLinks';
      }
      if ((tag === 'INPUT' && ['text', 'email', 'password', 'search', 'url', 'tel'].includes(typeAttr)) || tag === 'TEXTAREA') {
        return 'inputsTextareas';
      }
      if (tag === 'SELECT') {
        return 'selects';
      }
      if ((tag === 'INPUT' && ['checkbox', 'radio'].includes(typeAttr)) || role === 'checkbox' || role === 'radio') {
        return 'toggles';
      }
      return 'other';
    }

    function inferDefaultAction(elementData) {
      const kind = getElementKind(elementData);
      if (kind === 'inputsTextareas') return 'type';
      if (kind === 'selects') return 'select';
      return 'click';
    }

    function getElementDisplayLabel(el) {
      return el.label || el.text || el.placeholder || el.tag || 'Element';
    }

    function getElementId(el) {
      return typeof el.id === 'number' ? el.id : null;
    }

    function buildTargetFromElement(elementData) {
      return {
        label: elementData.label || undefined,
        text: elementData.text || undefined,
        placeholder: elementData.placeholder || undefined,
        role: elementData.role || undefined,
        tag: elementData.tag || undefined,
        cssSelector: elementData.selector || undefined,
        type: elementData.type || undefined
      };
    }

    function inferFlowIntent() {
      if (!flowSteps.length) {
        return 'Untitled flow';
      }

      const first = flowSteps[0];
      const firstLabel = getElementDisplayLabel(first.target);
      return 'Flow: ' + first.action + ' ' + firstLabel;
    }

    function escapeJsString(value) {
      return String(value || '')
        .replace(/\\\\/g, '\\\\\\\\')
        .replace(/'/g, "\\\\'")
        .replace(/\\r/g, '\\\\r')
        .replace(/\\n/g, '\\\\n');
    }

    function generateFlowPlaywrightScript(steps, startUrl) {
      const lines = [
        "const { chromium } = require('playwright');",
        "",
        "(async () => {",
        "  const browser = await chromium.launch({ headless: false });",
        "  const page = await browser.newPage();",
      ];

      if (startUrl) {
        lines.push("  await page.goto('" + escapeJsString(startUrl) + "', { waitUntil: 'domcontentloaded' });");
      }

      for (const step of steps) {
        const selector = step && step.target ? step.target.cssSelector || '' : '';
        const action = step && step.action ? step.action : 'click';
        const value = step && typeof step.value === 'string' ? step.value : '';

        if (!selector) {
          lines.push("  // Missing selector for step: " + action);
          continue;
        }

        lines.push("  await page.locator('" + escapeJsString(selector) + "').first().scrollIntoViewIfNeeded().catch(() => {});");

        if (action === 'click') {
          lines.push("  await page.locator('" + escapeJsString(selector) + "').first().click();");
        } else if (action === 'type') {
          lines.push("  await page.locator('" + escapeJsString(selector) + "').first().fill('" + escapeJsString(value) + "');");
        } else if (action === 'select') {
          lines.push("  await page.locator('" + escapeJsString(selector) + "').first().selectOption('" + escapeJsString(value) + "');");
        } else {
          lines.push("  // Unsupported action: " + action);
        }
      }

      lines.push("  // await browser.close();");
      lines.push("})();");

      return lines.join('\\\\n');
    }

    async function startSessionForFlow(url) {
      const response = await apiCall('POST', '/browser/session/start', { url });

      if (!response || !response.ok) {
        throw new Error((response && response.error) || 'Failed to start session');
      }

      currentSessionId = response.sessionId || null;

      if (response.url) {
        urlInput.value = response.url;
        updateSessionInfo(
          response.url,
          (response.fingerprint && response.fingerprint.title) || 'N/A'
        );
      }

      return response;
    }

    function recipeToFlowSteps(recipe) {
      const locators = Array.isArray(recipe && recipe.locators) ? recipe.locators : [];
      if (recipe && recipe.startUrl) {
        urlInput.value = recipe.startUrl;
      }
      return locators.map((locator, index) => ({
        action: locator.action || 'click',
        target: {
          label: locator.label || undefined,
          text: locator.text || undefined,
          placeholder: locator.placeholder || undefined,
          role: locator.role || undefined,
          tag: locator.tag || undefined,
          cssSelector: locator.selector || undefined,
          type: locator.type || undefined,
          elementId: typeof locator.elementId === 'number' ? locator.elementId : undefined
        },
        value: locator.value || '',
        recipeLocatorIndex: index
      }));
    }

    function loadRecipeIntoBuilder(recipe) {
      flowSteps = recipeToFlowSteps(recipe);
      editingRecipeId = recipe.id || null;

      if (recipe && recipe.startUrl) {
        urlInput.value = recipe.startUrl;
      }

      renderFlowSteps();
      updateFlowButtons();
      updateFlowBuilderTitle();
      updateStatus('Flow loaded into builder.');
    }

    function buildRecipeFromFlow(stateResponse) {
      const currentUrl = stateResponse && stateResponse.state ? stateResponse.state.url : '';
      let site = 'unknown';

      try {
        if (currentUrl) {
          site = new URL(currentUrl).hostname;
        }
      } catch {}

      const fingerprint = stateResponse && stateResponse.fingerprint ? stateResponse.fingerprint : {};
      const title = stateResponse && stateResponse.state ? stateResponse.state.title || '' : '';
      const startUrl = urlInput.value.trim() || currentUrl || '';

      const locators = flowSteps.map((step, index) => ({
        kind: 'css',
        selector: step.target.cssSelector || ('flow-step-' + (index + 1)),
        text: step.target.text || undefined,
        role: step.target.role || undefined,
        label: step.target.label || undefined,
        placeholder: step.target.placeholder || undefined,
        tag: step.target.tag || undefined,
        type: step.target.type || undefined,
        elementId: typeof step.target.elementId === 'number' ? step.target.elementId : undefined,
        priority: index,
        confidence: 0.8,
        action: step.action,
        value: step.value || '',
        ...(step.action === 'wait' && {
          wait: {
            kind: 'text_appears',
            text: step.value || '',
            timeout_ms: 10000
          }
        }),
        ...(step.action === 'download' && {
          download: {
            mode: 'auto',
            filename_template: step.value || '',
            close_popup: true,
            timeout_ms: 30000
          }
        })
      }));

      return {
        site,
        pageType: fingerprint.pageType || 'unknown',
        intent: inferFlowIntent(),
        fingerprint: {
          title: fingerprint.title || title || '',
          headings: Array.isArray(fingerprint.headings) ? fingerprint.headings : [],
          pathPattern: fingerprint.pathPattern || ''
        },
        startUrl,
        generatedScript: generateFlowPlaywrightScript(flowSteps, startUrl),
        locators,
        fallbackTexts: flowSteps
          .map((step) => getElementDisplayLabel(step.target))
          .filter(Boolean),
        confidence: 0.8,
        lastSuccessAt: new Date().toISOString(),
        successCount: 1,
        failureCount: 0,
        stale: false
      };
    }

    async function saveCurrentFlow() {
      if (!flowSteps.length) {
        updateStatus('Add at least one step before saving.', true);
        return;
      }

      setBusy(true, editingRecipeId ? 'Updating flow...' : 'Saving flow to memory...');

      try {
        const stateResponse = await apiCall('GET', '/browser/session/state');
        if (!stateResponse || !stateResponse.ok) {
          throw new Error((stateResponse && stateResponse.error) || 'Failed to read current page state');
        }

        const recipe = buildRecipeFromFlow(stateResponse);

        let response;
        if (editingRecipeId) {
          response = await apiCall('POST', '/memory/update-recipe', {
            recipeId: editingRecipeId,
            recipe
          });
        } else {
          response = await apiCall('POST', '/memory/save-recipe', { recipe });
        }

        if (!response || !response.ok) {
          throw new Error((response && response.error) || 'Failed to save flow');
        }

        if (response.data && response.data.recipe && response.data.recipe.id) {
          editingRecipeId = response.data.recipe.id;
        }

        await fetchMemory();
        updateFlowBuilderTitle();
        updateStatus(editingRecipeId ? 'Flow updated.' : 'Flow saved to memory bank.');
      } catch (error) {
        console.error('Save flow error:', error);
        updateStatus('Save flow failed: ' + error.message, true);
      } finally {
        setBusy(false);
      }
    }

    async function refreshScreenshot() {
      if (!currentSessionId) {
        if (currentScreenshotObjectUrl) {
          URL.revokeObjectURL(currentScreenshotObjectUrl);
          currentScreenshotObjectUrl = null;
        }
        setScreenshotPlaceholder('Screenshot will appear here after session start or action.');
        return;
      }

      try {
        const blob = await apiCall('POST', '/browser/screenshot');

        if (!(blob instanceof Blob)) {
          throw new Error('Expected Blob response for screenshot');
        }

        if (currentScreenshotObjectUrl) {
          URL.revokeObjectURL(currentScreenshotObjectUrl);
          currentScreenshotObjectUrl = null;
        }

        currentScreenshotObjectUrl = URL.createObjectURL(blob);

        clearChildren(screenshotPanel);
        const img = document.createElement('img');
        img.src = currentScreenshotObjectUrl;
        img.alt = 'Current browser screenshot';
        screenshotPanel.appendChild(img);
      } catch (error) {
        console.error('Failed to load screenshot:', error);
        setScreenshotPlaceholder('Failed to load screenshot.', '#ef4444');
      }
    }

    function elementMatchesFilter(el) {
      if (!elementsFilterValue) {
        return true;
      }

      const query = elementsFilterValue.toLowerCase();
      const idText = getElementId(el) !== null ? String(getElementId(el)) : '';
      const haystack = [
        idText,
        el.label || '',
        el.text || '',
        el.placeholder || '',
        el.tag || '',
        el.role || '',
        el.type || ''
      ].join(' ').toLowerCase();

      return haystack.includes(query);
    }

    async function refreshAvailableElements() {
      if (!currentSessionId) {
        allAvailableElements = [];
        appendCenteredMessage(elementsList, 'Start a session to load elements.', '#64748b');
        return;
      }

      try {
        const response = await apiCall('POST', '/browser/get-interactable-elements', { sessionId: currentSessionId });

        if (!response.ok || !response.data || !Array.isArray(response.data.elements)) {
          appendCenteredMessage(elementsList, 'Error loading elements.', '#ef4444');
          return;
        }

        allAvailableElements = response.data.elements;
        renderAvailableElements();
      } catch (error) {
        console.error('Failed to load interactable elements:', error);
        appendCenteredMessage(elementsList, 'Error loading elements.', '#ef4444');
      }
    }

    function renderAvailableElements() {
      if (!currentSessionId) {
        appendCenteredMessage(elementsList, 'Start a session to load elements.', '#64748b');
        return;
      }

      const visibleElements = allAvailableElements.filter(elementMatchesFilter);

      if (visibleElements.length === 0) {
        appendCenteredMessage(
          elementsList,
          allAvailableElements.length === 0 ? 'No interactable elements found.' : 'No elements match your filter.',
          '#64748b'
        );
        return;
      }

      const groupedElements = {
        buttonsLinks: [],
        inputsTextareas: [],
        selects: [],
        toggles: [],
        other: []
      };

      visibleElements.forEach((el) => {
        const originalIndex = allAvailableElements.indexOf(el);
        const kind = getElementKind(el);
        groupedElements[kind].push({ el, index: originalIndex });
      });

      clearChildren(elementsList);

      function renderGroup(title, items) {
        if (items.length === 0) {
          return;
        }

        const groupDiv = document.createElement('div');
        groupDiv.className = 'element-group';

        const groupTitle = document.createElement('div');
        groupTitle.className = 'element-group-title';
        groupTitle.textContent = title;
        groupDiv.appendChild(groupTitle);

        items.forEach(({ el, index }) => {
          const card = document.createElement('div');
          card.className = 'element-card';

          const labelRow = document.createElement('div');
          labelRow.className = 'element-card-label-row';

          const elementId = getElementId(el);
          if (elementId !== null) {
            const idBadge = document.createElement('span');
            idBadge.className = 'element-id-badge';
            idBadge.textContent = '#' + elementId;
            labelRow.appendChild(idBadge);
          }

          const labelSpan = document.createElement('span');
          labelSpan.className = 'element-card-label';
          labelSpan.textContent = getElementDisplayLabel(el);
          labelRow.appendChild(labelSpan);

          card.appendChild(labelRow);

          if (el.text) {
            const textSpan = document.createElement('span');
            textSpan.className = 'element-card-text';
            textSpan.textContent = 'Text: ' + String(el.text);
            card.appendChild(textSpan);
          }

          if (el.placeholder) {
            const placeholderSpan = document.createElement('span');
            placeholderSpan.className = 'element-card-text';
            placeholderSpan.textContent = 'Placeholder: ' + String(el.placeholder);
            card.appendChild(placeholderSpan);
          }

          const metaSpan = document.createElement('span');
          metaSpan.className = 'element-card-meta';
          metaSpan.textContent =
            'Tag: ' + (el.tag || 'N/A') +
            ', Role: ' + (el.role || 'N/A') +
            ', Type: ' + (el.type || 'N/A');
          card.appendChild(metaSpan);

          const actionsRow = document.createElement('div');
          actionsRow.className = 'element-card-actions';

          const testButton = document.createElement('button');
          testButton.className = 'test-element-btn';
          testButton.type = 'button';
          testButton.textContent = 'Test';
          testButton.dataset.elementIndex = String(index);
          actionsRow.appendChild(testButton);

          const addButton = document.createElement('button');
          addButton.className = 'add-to-flow-btn';
          addButton.type = 'button';
          addButton.textContent = 'Add to Flow';
          addButton.dataset.elementIndex = String(index);
          actionsRow.appendChild(addButton);

          card.appendChild(actionsRow);
          groupDiv.appendChild(card);
        });

        elementsList.appendChild(groupDiv);
      }

      renderGroup('Buttons & Links', groupedElements.buttonsLinks);
      renderGroup('Inputs & Textareas', groupedElements.inputsTextareas);
      renderGroup('Selects', groupedElements.selects);
      renderGroup('Toggles (Checkboxes/Radios)', groupedElements.toggles);
      renderGroup('Other Elements', groupedElements.other);
    }

    function renderFlowSteps() {
      clearChildren(flowStepsList);

      if (flowSteps.length === 0) {
        appendCenteredMessage(flowStepsList, 'Add elements from the left pane to build a flow.', '#64748b');
        updateFlowButtons();
        return;
      }

      flowSteps.forEach((step, index) => {
        const card = document.createElement('div');
        card.className = 'flow-step-card';

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'flow-step-actions';

        const runButton = document.createElement('button');
        runButton.className = 'run-btn';
        runButton.type = 'button';
        runButton.dataset.stepIndex = String(index);
        runButton.textContent = 'Run';
        actionsDiv.appendChild(runButton);

        const upButton = document.createElement('button');
        upButton.className = 'move-up-btn';
        upButton.type = 'button';
        upButton.dataset.stepIndex = String(index);
        upButton.textContent = '▲';
        upButton.disabled = index === 0;
        actionsDiv.appendChild(upButton);

        const downButton = document.createElement('button');
        downButton.className = 'move-down-btn';
        downButton.type = 'button';
        downButton.dataset.stepIndex = String(index);
        downButton.textContent = '▼';
        downButton.disabled = index === flowSteps.length - 1;
        actionsDiv.appendChild(downButton);

        const removeButton = document.createElement('button');
        removeButton.className = 'remove-btn';
        removeButton.type = 'button';
        removeButton.dataset.stepIndex = String(index);
        removeButton.textContent = '✕';
        actionsDiv.appendChild(removeButton);

        card.appendChild(actionsDiv);

        const labelDiv = document.createElement('div');
        labelDiv.className = 'flow-step-label';
        const idPrefix = typeof step.target.elementId === 'number' ? ('#' + step.target.elementId + ' ') : '';
        labelDiv.textContent =
          (index + 1) + '. ' +
          String(step.action).toUpperCase() + ': ' +
          idPrefix +
          getElementDisplayLabel(step.target);
        card.appendChild(labelDiv);

        const actionRow = document.createElement('div');
        actionRow.className = 'flow-step-controls';

        const actionLabel = document.createElement('label');
        actionLabel.textContent = 'Action';
        actionRow.appendChild(actionLabel);

        const actionSelect = document.createElement('select');
        actionSelect.className = 'flow-step-action-select';
        actionSelect.dataset.stepIndex = String(index);

        ['click', 'type', 'select', 'wait', 'download'].forEach((actionName) => {
          const option = document.createElement('option');
          option.value = actionName;
          option.textContent = actionName.toUpperCase();
          option.selected = step.action === actionName;
          actionSelect.appendChild(option);
        });

        actionRow.appendChild(actionSelect);
        card.appendChild(actionRow);

        const valueRow = document.createElement('div');
        valueRow.className = 'flow-step-value-row' + ((step.action === 'type' || step.action === 'select' || step.action === 'wait' || step.action === 'download') ? ' visible' : '');

        const valueLabel = document.createElement('label');
        if (step.action === 'select') valueLabel.textContent = 'Option / Value';
        else if (step.action === 'wait') valueLabel.textContent = 'Wait Text / Selector';
        else if (step.action === 'download') valueLabel.textContent = 'Filename Template';
        else valueLabel.textContent = 'Text / Value';
        valueRow.appendChild(valueLabel);

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'flow-step-value-input';
        if (step.action === 'select') valueInput.placeholder = 'Enter option value';
        else if (step.action === 'wait') valueInput.placeholder = 'Enter text to wait for';
        else if (step.action === 'download') valueInput.placeholder = 'e.g. {{account}}_bill.pdf';
        else valueInput.placeholder = 'Enter text or phone number';
        valueInput.value = step.value || '';
        valueInput.dataset.stepIndex = String(index);
        valueRow.appendChild(valueInput);

        card.appendChild(valueRow);
        flowStepsList.appendChild(card);
      });

      updateFlowButtons();
    }

    function addElementToFlowByIndex(elementIndex) {
      if (!currentSessionId) {
        updateStatus('Please start a session first.', true);
        return;
      }

      const elementData = allAvailableElements[elementIndex];
      if (!elementData) {
        updateStatus('Selected element not found.', true);
        return;
      }

      flowSteps.push({
        action: inferDefaultAction(elementData),
        target: {
          ...buildTargetFromElement(elementData),
          elementId: getElementId(elementData)
        },
        value: ''
      });

      renderFlowSteps();
      updateStatus('Element added to flow builder.');
    }

    async function testElementByIndex(elementIndex) {
      if (!currentSessionId) {
        updateStatus('Please start a session first.', true);
        return;
      }

      const elementData = allAvailableElements[elementIndex];
      if (!elementData) {
        updateStatus('Selected element not found.', true);
        return;
      }

      setBusy(true, 'Testing element...');

      try {
        const response = await apiCall('POST', '/browser/test-click', {
          sessionId: currentSessionId,
          target: buildTargetFromElement(elementData)
        });

        if (!response || !response.ok) {
          throw new Error((response && response.error) || 'Test action failed');
        }

        await refreshAllState();
        await fetchActiveSessions();
        await fetchHealthCheck();

        const idText = getElementId(elementData) !== null ? ('#' + getElementId(elementData) + ' ') : '';
        updateStatus(
          'Test executed for ' +
          idText +
          getElementDisplayLabel(elementData) +
          '. Screenshot and elements refreshed.'
        );
      } catch (error) {
        console.error('Test element error:', error);
        updateStatus('Test failed: ' + error.message, true);
      } finally {
        setBusy(false);
      }
    }

    async function executeDirectStep(step) {
      if (!step || !step.target || !step.target.cssSelector) {
        return null;
      }

      if (step.action === 'wait') {
        return await apiCall('POST', '/browser/wait-for-condition', {
          condition: 'text_appears',
          text: step.value || '',
          timeout: 5000
        });
      }

      if (step.action === 'click') {
        return await apiCall('POST', '/browser/direct-click', {
          selector: step.target.cssSelector
        });
      }

      if (step.action === 'type') {
        return await apiCall('POST', '/browser/direct-type', {
          selector: step.target.cssSelector,
          value: step.value || ''
        });
      }

      if (step.action === 'select') {
        return await apiCall('POST', '/browser/direct-select', {
          selector: step.target.cssSelector,
          value: step.value || ''
        });
      }

      if (step.action === 'download') {
        return await apiCall('POST', '/browser/direct-download', {
          selector: step.target.cssSelector,
          value: step.value || ''
        });
      }

      return null;
    }

    async function executeFallbackStep(step) {
      let apiPath = '';
      const requestBody = {
        sessionId: currentSessionId,
        target: {
          label: step.target.label,
          text: step.target.text,
          placeholder: step.target.placeholder,
          role: step.target.role,
          tag: step.target.tag,
          cssSelector: step.target.cssSelector,
          type: step.target.type
        }
      };

      if (step.action === 'wait') {
        apiPath = '/browser/wait-for-condition';
        requestBody.condition = 'text_appears';
        requestBody.text = step.value || '';
        requestBody.timeout = 5000;
      } else if (step.action === 'click') {
        apiPath = '/browser/click';
      } else if (step.action === 'type') {
        apiPath = '/browser/type';
        requestBody.value = step.value || '';
      } else if (step.action === 'select') {
        apiPath = '/browser/select';
        requestBody.value = step.value || '';
      } else if (step.action === 'download') {
        apiPath = '/browser/download';
        requestBody.value = step.value || '';
      } else {
        throw new Error('Unsupported action type: ' + step.action);
      }

      return await apiCall('POST', apiPath, requestBody);
    }

    async function runFlowStepByIndex(index) {
      if (!currentSessionId) {
        updateStatus('Please start a session first.', true);
        return false;
      }

      const step = flowSteps[index];
      if (!step) {
        updateStatus('Step not found.', true);
        return false;
      }

      setBusy(true, 'Running flow step...');

      try {
        let response = null;
        let executionMode = 'fallback';

        if (step.target && step.target.cssSelector) {
          response = await executeDirectStep(step);
          executionMode = 'direct';

          if (!response || !response.ok) {
            response = await executeFallbackStep(step);
            executionMode = 'fallback';
          }
        } else {
          response = await executeFallbackStep(step);
          executionMode = 'fallback';
        }

        if (response && response.ok) {
          updateStatus(
            'Step ' + (index + 1) + ' (' + step.action + ') executed successfully via ' + executionMode + ' mode.'
          );
          return true;
        } else {
          updateStatus(
            'Step ' + (index + 1) + ' (' + step.action + ') failed: ' + ((response && response.error) || 'Unknown error'),
            true
          );
          return false;
        }
      } catch (error) {
        console.error('API call failed:', error);
        updateStatus('API error for step ' + (index + 1) + ': ' + error.message, true);
        return false;
      } finally {
        await refreshAllState();
        await fetchActiveSessions();
        await fetchHealthCheck();
        setBusy(false);
      }
    }

    async function runCurrentFlow() {
      if (!flowSteps.length) {
        updateStatus('There are no steps to run.', true);
        return;
      }

      const startUrl = urlInput.value.trim();

      setBusy(true, 'Running saved flow...');

      try {
        if (!currentSessionId) {
          if (!startUrl) {
            throw new Error('Please enter a start URL before running the flow.');
          }
          await startSessionForFlow(startUrl);
        } else if (startUrl) {
          const stateResponse = await apiCall('GET', '/browser/session/state');
          const currentUrl = stateResponse && stateResponse.state ? stateResponse.state.url || '' : '';

          if (currentUrl !== startUrl) {
            const navResponse = await apiCall('POST', '/browser/load-url', {
              url: startUrl,
              sessionId: currentSessionId
            });

            if (!navResponse || !navResponse.ok) {
              throw new Error((navResponse && navResponse.error) || 'Failed to load flow start URL');
            }
          }
        }

        const response = await apiCall('POST', '/browser/run-flow', {
          sessionId: currentSessionId,
          startUrl,
          steps: flowSteps
        });

        await refreshAllState();
        await fetchActiveSessions();
        await fetchHealthCheck();

        if (response && response.ok) {
          updateStatus('Flow completed successfully.');
          return;
        }

        const failedIndex =
          response && response.data && typeof response.data.failedStepIndex === 'number'
            ? response.data.failedStepIndex
            : -1;

        const failedStepNumber = failedIndex >= 0 ? failedIndex + 1 : '?';
        const failedMessage = (response && response.error) || 'Unknown flow error';

        const shouldEdit = window.confirm(
          'Flow failed at step ' + failedStepNumber + ': ' + failedMessage + '\\n\\nOpen this flow in edit mode now?'
        );

        if (shouldEdit) {
          renderFlowSteps();
        }

        updateStatus('Flow stopped at step ' + failedStepNumber + ': ' + failedMessage, true);
      } catch (error) {
        console.error('Run flow error:', error);
        updateStatus('Run flow failed: ' + error.message, true);
      } finally {
        setBusy(false);
      }
    }

    function updateFlowStepValue(index, value) {
      if (flowSteps[index]) {
        flowSteps[index].value = value;
      }
    }

    function updateFlowStepAction(index, action) {
      if (!flowSteps[index]) return;
      flowSteps[index].action = action;
      if (action === 'click') {
        flowSteps[index].value = '';
      }
      renderFlowSteps();
    }

    function moveFlowStep(index, direction) {
      if (direction === -1 && index > 0) {
        const temp = flowSteps[index - 1];
        flowSteps[index - 1] = flowSteps[index];
        flowSteps[index] = temp;
      } else if (direction === 1 && index < flowSteps.length - 1) {
        const temp = flowSteps[index + 1];
        flowSteps[index + 1] = flowSteps[index];
        flowSteps[index] = temp;
      }
      renderFlowSteps();
    }

    function removeFlowStep(index) {
      flowSteps.splice(index, 1);
      renderFlowSteps();
    }

    async function refreshAllState() {
      if (!currentSessionId) {
        updateSessionInfo();
        allAvailableElements = [];
        appendCenteredMessage(elementsList, 'Start a session to load elements.', '#64748b');
        setScreenshotPlaceholder('Screenshot will appear here after session start or action.');
        return;
      }

      try {
        const stateResponse = await apiCall('GET', '/browser/session/state');

        if (stateResponse && stateResponse.ok && stateResponse.state) {
          updateSessionInfo(stateResponse.state.url || 'N/A', stateResponse.state.title || 'N/A');
          if (stateResponse.state.url) {
            urlInput.value = stateResponse.state.url;
          }
        } else {
          updateSessionInfo('Error', 'Error');
          updateStatus('Failed to get session state.', true);
        }
      } catch (error) {
        console.error('API error getting session state:', error);
        updateSessionInfo('Error', 'Error');
        updateStatus('API error getting session state: ' + error.message, true);
      }

      await refreshAvailableElements();
      await refreshScreenshot();
    }

    async function fetchMemory() {
      try {
        const res = await fetch('/api/memory');
        const json = await res.json();

        if (!json.ok || !json.data || !json.data.recipes) {
          throw new Error('Invalid memory response');
        }

        const recipes = Array.isArray(json.data.recipes.items) ? json.data.recipes.items : [];
        memoryCount.textContent = String(json.data.recipes.count || 0);

        clearChildren(memoryList);

        if (recipes.length === 0) {
          appendCenteredMessage(memoryList, 'No memory recipes saved yet.', '#64748b');
          return;
        }

        recipes.forEach((entry) => {
          const card = document.createElement('div');
          card.className = 'memory-card';

          const goalDiv = document.createElement('div');
          goalDiv.className = 'card-title';

          const titleWrap = document.createElement('div');
          titleWrap.textContent = entry.intent || 'Untitled';

          if (editingRecipeId && entry.id === editingRecipeId) {
            const badge = document.createElement('span');
            badge.className = 'editing-badge';
            badge.textContent = 'EDITING';
            titleWrap.appendChild(badge);
          }

          goalDiv.appendChild(titleWrap);
          card.appendChild(goalDiv);

          const urlDiv = document.createElement('div');
          urlDiv.className = 'card-meta';
          urlDiv.textContent = (entry.site || 'Unknown site') + ' (' + (entry.pageType || 'unknown') + ')';
          card.appendChild(urlDiv);

          const stepsDiv = document.createElement('div');
          if (Array.isArray(entry.locators)) {
            entry.locators.slice(0, 3).forEach((locator) => {
              const span = document.createElement('span');
              span.className = 'memory-step';
              span.textContent = locator.selector || locator.text || locator.label || 'selector';
              stepsDiv.appendChild(span);
            });

            if (entry.locators.length > 3) {
              const more = document.createElement('span');
              more.className = 'memory-step';
              more.textContent = '...';
              stepsDiv.appendChild(more);
            }
          }
          card.appendChild(stepsDiv);

          const statsDiv = document.createElement('div');
          statsDiv.className = 'card-stats';

          const confidenceSpan = document.createElement('span');
          const confidence = typeof entry.confidence === 'number' ? entry.confidence : 0;
          confidenceSpan.textContent = 'Confidence: ' + (confidence * 100).toFixed(0) + '%';
          statsDiv.appendChild(confidenceSpan);

          const hitsSpan = document.createElement('span');
          hitsSpan.textContent =
            'Hits: ' + (entry.successCount || 0) + ' | Misses: ' + (entry.failureCount || 0);
          statsDiv.appendChild(hitsSpan);

          card.appendChild(statsDiv);

          const actionRow = document.createElement('div');
          actionRow.className = 'memory-actions';

          const runButton = document.createElement('button');
          runButton.className = 'memory-run-btn';
          runButton.type = 'button';
          runButton.textContent = 'Run';
          runButton.dataset.recipeId = entry.id || '';
          actionRow.appendChild(runButton);

          const editButton = document.createElement('button');
          editButton.className = 'memory-edit-btn';
          editButton.type = 'button';
          editButton.textContent = 'Edit';
          editButton.dataset.recipeId = entry.id || '';
          actionRow.appendChild(editButton);

          const duplicateButton = document.createElement('button');
          duplicateButton.className = 'memory-duplicate-btn';
          duplicateButton.type = 'button';
          duplicateButton.textContent = 'Duplicate';
          duplicateButton.dataset.recipeId = entry.id || '';
          actionRow.appendChild(duplicateButton);

          const renameButton = document.createElement('button');
          renameButton.className = 'memory-rename-btn';
          renameButton.type = 'button';
          renameButton.textContent = 'Rename';
          renameButton.dataset.recipeId = entry.id || '';
          actionRow.appendChild(renameButton);

          const deleteButton = document.createElement('button');
          deleteButton.className = 'memory-delete-btn';
          deleteButton.type = 'button';
          deleteButton.textContent = 'Delete';
          deleteButton.dataset.recipeId = entry.id || '';
          actionRow.appendChild(deleteButton);

          card.appendChild(actionRow);
          memoryList.appendChild(card);
        });
      } catch (err) {
        console.error('Failed to load memory', err);
        appendCenteredMessage(memoryList, 'Error loading memories.', '#ef4444');
      }
    }

    async function getAllRecipes() {
      const res = await fetch('/api/memory');
      const json = await res.json();
      if (!json.ok || !json.data || !json.data.recipes || !Array.isArray(json.data.recipes.items)) {
        throw new Error('Invalid memory response');
      }
      return json.data.recipes.items;
    }

    async function editRecipeById(recipeId) {
      const recipes = await getAllRecipes();
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) {
        updateStatus('Recipe not found.', true);
        return;
      }
      loadRecipeIntoBuilder(recipe);
      await fetchMemory();
    }

    async function runRecipeById(recipeId) {
      const recipes = await getAllRecipes();
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) {
        updateStatus('Recipe not found.', true);
        return;
      }

      loadRecipeIntoBuilder(recipe);

      if (recipe.startUrl) {
        urlInput.value = recipe.startUrl;
      }

      await fetchMemory();
      await runCurrentFlow();
    }

    async function renameRecipeById(recipeId) {
      const recipes = await getAllRecipes();
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe) return;
      const newIntent = window.prompt('Enter new flow name:', recipe.intent);
      if (!newIntent || newIntent === recipe.intent) return;
      
      recipe.intent = newIntent.trim();
      setBusy(true, 'Renaming flow...');
      try {
        const response = await apiCall('POST', '/memory/update-recipe', { recipeId, recipe });
        if (!response || !response.ok) throw new Error((response && response.error) || 'Failed to rename via API');
        await fetchMemory();
        updateStatus('Flow renamed successfully.');
      } catch (err) {
        console.error('Rename error:', err);
        updateStatus('Failed to rename: ' + err.message, true);
      } finally {
        setBusy(false);
      }
    }

    async function duplicateRecipeById(recipeId) {
      const recipes = await getAllRecipes();
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe) return;
      
      const defaultName = recipe.intent + ' (Copy)';
      const newIntent = window.prompt('Enter name for the duplicated flow:', defaultName);
      if (!newIntent) return;
      
      const newRecipe = JSON.parse(JSON.stringify(recipe));
      delete newRecipe.id;
      newRecipe.intent = newIntent.trim();
      newRecipe.successCount = 0;
      newRecipe.failureCount = 0;
      
      setBusy(true, 'Duplicating flow...');
      try {
        const response = await apiCall('POST', '/memory/save-recipe', { recipe: newRecipe });
        if (!response || !response.ok) throw new Error((response && response.error) || 'Failed to duplicate via API');
        await fetchMemory();
        updateStatus('Flow duplicated successfully.');
      } catch (err) {
        console.error('Duplicate error:', err);
        updateStatus('Failed to duplicate: ' + err.message, true);
      } finally {
        setBusy(false);
      }
    }

    async function deleteRecipeById(recipeId) {
      const confirmed = window.confirm('Delete this saved flow?');
      if (!confirmed) return;

      setBusy(true, 'Deleting flow...');

      try {
        const response = await apiCall('POST', '/memory/delete-recipe', { recipeId });
        if (!response || !response.ok) {
          throw new Error((response && response.error) || 'Failed to delete recipe');
        }

        if (editingRecipeId === recipeId) {
          editingRecipeId = null;
          flowSteps = [];
          renderFlowSteps();
        }

        await fetchMemory();
        updateStatus('Flow deleted.');
      } catch (error) {
        console.error('Delete recipe error:', error);
        updateStatus('Delete failed: ' + error.message, true);
      } finally {
        setBusy(false);
      }
    }

    async function fetchActiveSessions() {
      try {
        const res = await fetch('/api/sessions');
        const json = await res.json();

        if (!json.ok || !json.data) {
          throw new Error('Invalid sessions response');
        }

        const sessions = Array.isArray(json.data.sessions) ? json.data.sessions : [];
        sessionsCount.textContent = String(json.data.count || 0);
        clearChildren(sessionsList);

        if (sessions.length === 0) {
          appendCenteredMessage(sessionsList, 'No active sessions.', '#64748b');
          return;
        }

        sessions.forEach((session) => {
          const card = document.createElement('div');
          card.className = 'session-card';

          const titleDiv = document.createElement('div');
          titleDiv.className = 'card-title';
          const shortId = typeof session.sessionId === 'string' ? session.sessionId.slice(0, 8) + '...' : 'Unknown';
          titleDiv.textContent = 'Session ' + shortId;
          card.appendChild(titleDiv);

          const metaDiv = document.createElement('div');
          metaDiv.className = 'card-meta';
          metaDiv.textContent =
            'Site: ' + (session.site || 'N/A') +
            ', Mode: ' + (session.mode || 'N/A');
          card.appendChild(metaDiv);

          const contentDiv = document.createElement('div');
          contentDiv.className = 'card-content';
          contentDiv.textContent = 'Goal: ' + (session.goal || 'N/A');
          card.appendChild(contentDiv);

          const statsDiv = document.createElement('div');
          statsDiv.className = 'card-stats';

          const stepsSpan = document.createElement('span');
          stepsSpan.textContent = 'Steps: ' + (session.stepCount || 0);
          statsDiv.appendChild(stepsSpan);

          const aiCallsSpan = document.createElement('span');
          aiCallsSpan.textContent = 'AI Calls: ' + (session.aiCallCount || 0);
          statsDiv.appendChild(aiCallsSpan);

          card.appendChild(statsDiv);
          sessionsList.appendChild(card);
        });
      } catch (err) {
        console.error('Failed to load active sessions', err);
        appendCenteredMessage(sessionsList, 'Error loading sessions.', '#ef4444');
      }
    }

    async function fetchHealthCheck() {
      try {
        const res = await fetch('/health');
        const json = await res.json();

        clearChildren(healthPanel);

        const card = document.createElement('div');
        card.className = 'health-card';

        if (json.ok) {
          const title = document.createElement('div');
          title.className = 'card-title';
          title.style.color = '#4ade80';
          title.textContent = 'Status: Online';
          card.appendChild(title);

          const uptimeDiv = document.createElement('div');
          uptimeDiv.className = 'card-content';
          uptimeDiv.textContent = 'Uptime: ' + Number(json.uptime || 0).toFixed(0) + 's';
          card.appendChild(uptimeDiv);

          const sessionsDiv = document.createElement('div');
          sessionsDiv.className = 'card-content';
          sessionsDiv.textContent = 'Active Sessions: ' + (json.sessions || 0);
          card.appendChild(sessionsDiv);

          const memoryDiv = document.createElement('div');
          memoryDiv.className = 'card-content';
          const recipes = json.memory && typeof json.memory.recipes === 'number' ? json.memory.recipes : 0;
          const fingerprints = json.memory && typeof json.memory.fingerprints === 'number' ? json.memory.fingerprints : 0;
          memoryDiv.textContent = 'Memory Recipes: ' + recipes + ', Fingerprints: ' + fingerprints;
          card.appendChild(memoryDiv);
        } else {
          const title = document.createElement('div');
          title.className = 'card-title';
          title.style.color = '#ef4444';
          title.textContent = 'Status: Error';
          card.appendChild(title);
        }

        healthPanel.appendChild(card);
      } catch (err) {
        console.error('Failed to load health check', err);
        appendCenteredMessage(healthPanel, 'Error loading health data.', '#ef4444');
      }
    }

    clearChildren(logsPanel);
    const initialLogDiv = document.createElement('div');
    initialLogDiv.style.color = '#64748b';
    initialLogDiv.style.fontStyle = 'italic';
    initialLogDiv.style.marginBottom = '10px';
    initialLogDiv.textContent = 'Waiting for orchestrator events...';
    logsPanel.appendChild(initialLogDiv);

    const evtSource = new EventSource('/api/logs/stream');
    evtSource.onmessage = (event) => {
      const logData = JSON.parse(event.data);
      if (!logData) return;

      const entry = document.createElement('div');
      entry.className = 'log-entry';

      const timeDiv = document.createElement('div');
      timeDiv.className = 'log-time';
      timeDiv.textContent = new Date(logData.time).toLocaleTimeString([], { hour12: false });
      entry.appendChild(timeDiv);

      const levelDiv = document.createElement('div');
      let levelClass = 'log-level-info';
      if (logData.level === 50) levelClass = 'log-level-error';
      if (logData.level === 40) levelClass = 'log-level-warn';
      if (logData.level === 20) levelClass = 'log-level-debug';
      levelDiv.className = levelClass;
      levelDiv.textContent = '[' + (logData.name || 'log') + ']';
      entry.appendChild(levelDiv);

      const messageContainer = document.createElement('div');
      messageContainer.style.flex = '1';

      const msgSpan = document.createElement('div');
      msgSpan.className = 'log-msg';
      msgSpan.textContent = logData.msg || '';
      messageContainer.appendChild(msgSpan);

      if (logData.thinking) {
        const thinkingBlock = document.createElement('div');
        thinkingBlock.className = 'thinking-block';
        thinkingBlock.textContent = 'AI Thinking: ' + logData.thinking;
        messageContainer.appendChild(thinkingBlock);
      }

      const metaKeys = Object.keys(logData).filter((k) => {
        return !['v', 'pid', 'hostname', 'name', 'level', 'time', 'msg', 'thinking'].includes(k);
      });

      if (metaKeys.length > 0) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'log-meta';
        metaDiv.textContent = metaKeys.map((k) => {
          let value = logData[k];
          if (typeof value === 'object') {
            value = JSON.stringify(value);
          }
          return k + '=' + String(value);
        }).join(' ');
        messageContainer.appendChild(metaDiv);
      }

      entry.appendChild(messageContainer);
      logsPanel.appendChild(entry);
      logsPanel.scrollTop = logsPanel.scrollHeight;
    };

    document.getElementById('start-session-btn').addEventListener('click', async () => {
      const url = urlInput.value.trim();

      if (!url) {
        updateStatus('Please enter a URL.', true);
        return;
      }

      setBusy(true, 'Starting new session and loading page...');

      try {
        currentSessionId = null;
        flowSteps = [];
        editingRecipeId = null;
        allAvailableElements = [];
        renderFlowSteps();
        updateSessionInfo('Loading...', 'Loading...');
        appendCenteredMessage(elementsList, 'Loading page elements...', '#64748b');
        setScreenshotPlaceholder('Loading screenshot...');

        const response = await apiCall('POST', '/browser/session/start', { url });

        if (!response || !response.ok) {
          throw new Error((response && response.error) || 'Failed to start session');
        }

        currentSessionId = response.sessionId || null;

        if (response.url) {
          urlInput.value = response.url;
          updateSessionInfo(
            response.url,
            (response.fingerprint && response.fingerprint.title) || 'N/A'
          );
        }

        await refreshAllState();
        await fetchActiveSessions();
        await fetchHealthCheck();
        await fetchMemory();

        updateStatus('New session started successfully.');
      } catch (error) {
        console.error('Session start error:', error);
        updateStatus('Error: ' + error.message, true);
      } finally {
        setBusy(false);
      }
    });

    document.getElementById('refresh-state-btn').addEventListener('click', async () => {
      if (!currentSessionId) {
        updateStatus('Please start a session first to refresh state.', true);
        return;
      }

      setBusy(true, 'Refreshing page state...');

      try {
        await refreshAllState();
        await fetchActiveSessions();
        await fetchHealthCheck();
        updateStatus('State refreshed!');
      } catch (error) {
        console.error('Refresh error:', error);
        updateStatus('Refresh failed: ' + error.message, true);
      } finally {
        setBusy(false);
      }
    });

    if (clearFlowButton) {
      clearFlowButton.addEventListener('click', () => {
        flowSteps = [];
        editingRecipeId = null;
        renderFlowSteps();
        updateFlowBuilderTitle();
        updateStatus('Flow cleared. Ready for a new flow.');
      });
    }

    runFlowButton.addEventListener('click', async () => {
      await runCurrentFlow();
    });

    saveFlowButton.addEventListener('click', async () => {
      await saveCurrentFlow();
    });

    elementsFilterInput.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      elementsFilterValue = target.value.trim();
      renderAvailableElements();
    });

    elementsList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const rawIndex = target.dataset.elementIndex;
      const elementIndex = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : -1;
      if (!Number.isInteger(elementIndex) || elementIndex < 0) return;

      if (target.classList.contains('add-to-flow-btn')) {
        addElementToFlowByIndex(elementIndex);
      } else if (target.classList.contains('test-element-btn')) {
        testElementByIndex(elementIndex);
      }
    });

    memoryList.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const recipeId = target.dataset.recipeId;
      if (!recipeId) return;

      if (target.classList.contains('memory-run-btn')) {
        await runRecipeById(recipeId);
      } else if (target.classList.contains('memory-edit-btn')) {
        await editRecipeById(recipeId);
      } else if (target.classList.contains('memory-duplicate-btn')) {
        await duplicateRecipeById(recipeId);
      } else if (target.classList.contains('memory-rename-btn')) {
        await renameRecipeById(recipeId);
      } else if (target.classList.contains('memory-delete-btn')) {
        await deleteRecipeById(recipeId);
      }
    });

    flowStepsList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const rawIndex = target.dataset.stepIndex;
      const index = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : -1;
      if (!Number.isInteger(index) || index < 0) return;

      if (target.classList.contains('run-btn')) {
        runFlowStepByIndex(index);
      } else if (target.classList.contains('move-up-btn')) {
        moveFlowStep(index, -1);
      } else if (target.classList.contains('move-down-btn')) {
        moveFlowStep(index, 1);
      } else if (target.classList.contains('remove-btn')) {
        removeFlowStep(index);
      }
    });

    flowStepsList.addEventListener('input', (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.classList.contains('flow-step-value-input')) {
        const rawIndex = target.dataset.stepIndex;
        const index = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : -1;
        if (Number.isInteger(index) && index >= 0) {
          updateFlowStepValue(index, target.value);
        }
        return;
      }
    });

    flowStepsList.addEventListener('change', (event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.classList.contains('flow-step-action-select')) {
        const rawIndex = target.dataset.stepIndex;
        const index = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : -1;
        if (Number.isInteger(index) && index >= 0) {
          updateFlowStepAction(index, target.value);
        }
      }
    });

    document.addEventListener('DOMContentLoaded', async () => {
      appendCenteredMessage(elementsList, 'Start a session to load elements.', '#64748b');
      appendCenteredMessage(flowStepsList, 'Add elements from the left pane to build a flow.', '#64748b');
      appendCenteredMessage(memoryList, 'Loading memories...', '#64748b');
      appendCenteredMessage(sessionsList, 'Loading sessions...', '#64748b');
      appendCenteredMessage(healthPanel, 'Loading health data...', '#64748b');
      setScreenshotPlaceholder('Screenshot will appear here after session start or action.');
      updateFlowButtons();

      await fetchMemory();
      await fetchActiveSessions();
      await fetchHealthCheck();
      renderFlowSteps();

      setInterval(async () => {
        await fetchMemory();
        await fetchActiveSessions();
        await fetchHealthCheck();
      }, 5000);

      try {
        const sessionsResponse = await apiCall('GET', '/api/sessions');

        if (sessionsResponse && sessionsResponse.ok && sessionsResponse.data && Array.isArray(sessionsResponse.data.sessions) && sessionsResponse.data.sessions.length > 0) {
          currentSessionId = sessionsResponse.data.sessions[0].sessionId || null;
          updateStatus('Re-connected to existing browser session.');
          await refreshAllState();
        } else {
          updateSessionInfo();
        }
      } catch (error) {
        console.error('Failed to check active sessions:', error);
        updateSessionInfo('Error', 'Error');
        updateStatus('Error checking active sessions: ' + error.message, true);
      }
    });
  </script>
</body>
</html>`;
}