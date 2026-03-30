export function buildDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AnyClick Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; height: 100vh; }
    header { background: #1e293b; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
    header h1 { font-size: 20px; font-weight: 600; color: #38bdf8; display: flex; align-items: center; gap: 10px; }
    .container { display: flex; flex: 1; overflow: hidden; }
    .sidebar { width: 350px; background: #1e293b; border-right: 1px solid #334155; display: flex; flex-direction: column; overflow-y: auto; }
    .main { flex: 1; display: flex; flex-direction: column; padding: 20px; }
    h2 { font-size: 14px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin: 20px; margin-bottom: 10px; }
    .memory-card { background: #0f172a; border: 1px solid #334155; border-radius: 8px; margin: 0 20px 15px; padding: 15px; cursor: pointer; transition: all 0.2s; }
    .memory-card:hover { border-color: #38bdf8; background: #172033; }
    .memory-goal { font-weight: 600; font-size: 15px; margin-bottom: 8px; color: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
    .memory-goal button { background: none; border: none; color: #64748b; cursor: pointer; padding: 4px; border-radius: 4px; transition: color 0.2s; }
    .memory-goal button:hover { color: #38bdf8; background: #1e293b; }
    .memory-url { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 12px; }
    .memory-step { font-size: 12px; background: #334155; padding: 4px 8px; border-radius: 4px; display: inline-block; margin: 2px 0; color: #cbd5e1; }
    .memory-stats { margin-top: 10px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
    .logs-panel { flex: 1; background: #000; border: 1px solid #334155; border-radius: 8px; overflow-y: auto; font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 13px; line-height: 1.5; padding: 15px; }
    .log-entry { margin-bottom: 8px; display: flex; gap: 10px; word-break: break-word; }
    .log-time { color: #64748b; min-width: 75px; flex-shrink: 0; }
    .log-level-info { color: #38bdf8; }
    .log-level-error { color: #ef4444; }
    .log-level-warn { color: #f59e0b; }
    .log-level-debug { color: #a855f7; }
    .log-msg { color: #e2e8f0; }
    .log-meta { color: #94a3b8; font-size: 12px; margin-left: auto; }
    .badge { background: #0ea5e9; color: white; padding: 2px 6px; border-radius: 99px; font-size: 11px; font-weight: bold; }
    .thinking-block { margin-top: 6px; padding: 10px; background: #1e293b; border-left: 3px solid #38bdf8; color: #cbd5e1; font-style: italic; border-radius: 0 4px 4px 0; font-family: sans-serif; display: block; }
  </style>
</head>
<body>
  <header>
    <h1><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg> AnyClick Dashboard</h1>
    <div>Status: <span style="color: #4ade80">â— Online</span></div>
  </header>
  <div class="container">
    <div class="sidebar">
      <h2>Memory Bank <span class="badge" id="memory-count">0</span></h2>
      <div id="memory-list">
        <div style="padding: 20px; color: #64748b; font-size: 14px; text-align: center;">Loading memories...</div>
      </div>
    </div>
    <div class="main">
      <h2 style="margin: 0 0 15px 0">Live Activity Logs</h2>
      <div class="logs-panel" id="logs-panel">
        <div style="color: #64748b; font-style: italic; margin-bottom: 10px;">Waiting for orchestrator events...</div>
      </div>
    </div>
  </div>

  <script>
    // ─── Load Memory ───────────────────────────────────────────────────────────
    async function fetchMemory() {
      try {
        const res = await fetch('/api/memory');
        const data = await res.json();
        const list = document.getElementById('memory-list');
        const keys = Object.keys(data.memory);
        document.getElementById('memory-count').textContent = keys.length;
        
        if (keys.length === 0) {
          list.innerHTML = '<div style="padding: 20px; color: #64748b; font-size: 14px; text-align: center;">No successful workflows saved yet.</div>';
          return;
        }

        list.innerHTML = '';
        keys.forEach(key => {
          const entry = data.memory[key];
          const len = entry.steps.length;
          
          const card = document.createElement('div');
          card.className = 'memory-card';
          
          let previewSteps = entry.steps.slice(0, 3).map(s => \`<span class="memory-step">\${s.action}(\${s.target?.description || ''})</span>\`).join(' ');
          if (len > 3) previewSteps += ' ...';

          const safeGoalStr = encodeURIComponent(entry.goal);

          card.innerHTML = \`
            <div class="memory-goal">
              <span>\${entry.goal}</span>
              <div>
                <button onclick="runGoal('\${safeGoalStr}')" title="Run Flow Now" style="color: #4ade80; margin-right: 5px;">▶ Run</button>
                <button onclick="renameGoal('\${safeGoalStr}')" title="Rename Goal">✏️</button>
              </div>
            </div>
            <div class="memory-url">\${entry.url}</div>
            <div>\${previewSteps}</div>
            <div class="memory-stats">
              <span>\${len} steps mapped</span>
            </div>
          \`;
          list.appendChild(card);
        });
      } catch (err) {
        console.error('Failed to load memory', err);
      }
    }

    async function renameGoal(encodedGoal) {
      const oldGoal = decodeURIComponent(encodedGoal);
      const newGoal = prompt('Rename this goal exactly to what you will type in n8n:', oldGoal);
      if (!newGoal || newGoal === oldGoal) return;
      
      try {
        await fetch('/api/memory/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldGoal, newGoal })
        });
        fetchMemory();
      } catch (err) {
        alert('Failed to rename goal.');
      }
    }

    async function runGoal(encodedGoal) {
      const goal = decodeURIComponent(encodedGoal);
      if (!confirm('Run "' + goal + '" autonomously in Chrome?')) return;
      
      try {
        await fetch('/api/memory/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal })
        });
        // The SSE logs panel will instantly show activity
      } catch (err) {
        alert('Failed to start run.');
      }
    }

    fetchMemory();
    setInterval(fetchMemory, 5000); // Polling for updates

    // ─── Live SSE Logs ────────────────────────────────────────────────────────
    const logsPanel = document.getElementById('logs-panel');
    const evtSource = new EventSource('/api/logs/stream');
    
    evtSource.onmessage = (event) => {
      const log = JSON.parse(event.data);
      if (!log) return;
      
      const el = document.createElement('div');
      el.className = 'log-entry';
      
      const time = new Date(log.time).toLocaleTimeString([], { hour12: false });
      let levelClass = 'log-level-info';
      if (log.level === 50) levelClass = 'log-level-error';
      if (log.level === 40) levelClass = 'log-level-warn';
      if (log.level === 20) levelClass = 'log-level-debug';

      const meta = Object.keys(log)
        .filter(k => !['v', 'pid', 'hostname', 'name', 'level', 'time', 'msg'].includes(k))
        .map(k => {
          if (k === 'thinking' && log[k]) return ''; // handled dynamically below
          let val = log[k];
          if (typeof val === 'object') val = JSON.stringify(val);
          return \`\${k}=\${val}\`;
        }).filter(Boolean).join(' ');

      let inner = \`
        <div class="log-time">\${time}</div>
        <div class="\${levelClass}">[\${log.name}]</div>
        <div style="flex: 1;">
          <span class="log-msg">\${log.msg}</span>
          \${log.thinking ? \`<div class="thinking-block">AI Thinking: \${log.thinking}</div>\` : ''}
        </div>
      \`;

      if (meta) {
        inner += \`<div class="log-meta">\${meta}</div>\`;
      }

      el.innerHTML = inner;
      logsPanel.appendChild(el);
      logsPanel.scrollTop = logsPanel.scrollHeight;
    };
  </script>
</body>
</html>`;
}
