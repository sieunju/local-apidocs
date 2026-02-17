/* =====================================================
   Local API Docs — app.js
   ===================================================== */

(function () {
  'use strict';

  // ── 상수 ──────────────────────────────────────────
  const API_DIR = 'apis/';
  const HEADER_AUTOCOMPLETE = [
    'Authorization',
    'Content-Type',
    'Accept',
    'Accept-Language',
    'Cache-Control',
    'X-Requested-With',
    'X-API-Key',
    'X-Auth-Token',
    'X-CSRF-Token',
    'User-Agent',
    'Referer',
    'Origin',
    'Cookie',
  ];
  const CONTENT_TYPE_AUTOCOMPLETE = [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    'text/xml',
    'application/xml',
  ];
  const METHOD_COLORS = {
    GET: 'method-get',
    POST: 'method-post',
    PUT: 'method-put',
    DELETE: 'method-delete',
    PATCH: 'method-patch',
  };

  // ── 상태 ──────────────────────────────────────────
  let allGroups = [];
  let apiTestEnabled = false;
  let currentEndpoint = null;
  let serverPort = 3000;
  let targetHost = '';
  let bodyEditor = null; // CodeMirror 인스턴스

  // ── 초기화 ────────────────────────────────────────
  async function init() {
    // file:// 프로토콜로 직접 열면 fetch가 차단됨 → 안내 화면 표시
    if (location.protocol === 'file:') {
      showFileProtocolWarning();
      return;
    }
    await loadEnvConfig();
    await loadApiGroups();
    renderSidebar();
    bindEvents();
    checkUrlHash();
  }

  function showFileProtocolWarning() {
    document.getElementById('sidebarNav').innerHTML = '';
    document.getElementById('welcomeScreen').innerHTML = `
      <div style="text-align:left;max-width:520px;margin:3rem auto">
        <hgroup>
          <h2>⚠ 서버를 먼저 실행하세요</h2>
          <p>보안 정책상 <code>file://</code> 로 직접 열면 API 파일을 로드할 수 없습니다.</p>
        </hgroup>
        <p>아래 명령어로 서버를 실행한 뒤 접속하세요:</p>
        <pre style="background:var(--code-background-color,#f5f5f5);padding:1rem;border-radius:6px;font-size:0.88rem">node server.js</pre>
        <p>그런 다음 브라우저에서:</p>
        <pre style="background:var(--code-background-color,#f5f5f5);padding:1rem;border-radius:6px;font-size:0.88rem">http://localhost:3000</pre>
        <p style="color:var(--muted-color);font-size:0.82rem">포트는 <code>local.env</code> 의 <code>PORT</code> 값으로 변경할 수 있습니다.</p>
      </div>
    `;
  }

  async function loadEnvConfig() {
    try {
      const res = await fetch('local.env?' + Date.now());
      const text = await res.text();
      const portMatch = text.match(/^PORT\s*=\s*(\d+)/m);
      if (portMatch) serverPort = parseInt(portMatch[1], 10);
      const hostMatch = text.match(/^HOST\s*=\s*(.+)/m);
      if (hostMatch) targetHost = hostMatch[1].trim().replace(/\/$/, '');
    } catch (_) { /* local.env 없으면 기본값 사용 */ }
  }

  // ── API 목록 로드 ─────────────────────────────────
  async function loadApiGroups() {
    // apis/index.json 이 있으면 그걸 우선 사용, 없으면 known list fallback
    let fileList = [];
    try {
      const idxRes = await fetch(API_DIR + 'index.json?' + Date.now());
      if (idxRes.ok) {
        fileList = await idxRes.json(); // ["users.json", "auth.json", ...]
      }
    } catch (_) {}

    // fallback: 하드코딩 목록 대신 동적으로 apis/ 디렉토리 내 파일을 탐색
    if (fileList.length === 0) {
      // 서버 없이 file:// 또는 로컬 서버에서 탐색하기 위해 apis/index.json 갱신 방식 권장
      // 여기서는 알려진 파일들을 시도해서 로드
      fileList = await discoverApiFiles();
    }

    const results = await Promise.all(
      fileList.map(async (f) => {
        try {
          const r = await fetch(API_DIR + f + '?' + Date.now());
          if (!r.ok) return null;
          const data = await r.json();
          data._file = f;
          return data;
        } catch (_) { return null; }
      })
    );
    allGroups = results.filter(Boolean);
  }

  async function discoverApiFiles() {
    // apis/index.json 을 통해 관리. 없으면 known 파일 목록 시도
    const known = ['auth.json', 'users.json'];
    const found = [];
    for (const f of known) {
      try {
        const r = await fetch(API_DIR + f + '?' + Date.now());
        if (r.ok) found.push(f);
      } catch (_) {}
    }
    return found;
  }

  // ── 사이드바 렌더링 ───────────────────────────────
  function renderSidebar(filter = '') {
    const nav = document.getElementById('sidebarNav');
    nav.innerHTML = '';

    const lf = filter.toLowerCase();
    let anyVisible = false;

    allGroups.forEach((group) => {
      const endpoints = group.endpoints.filter((ep) => {
        if (!lf) return true;
        return (
          ep.path.toLowerCase().includes(lf) ||
          ep.summary.toLowerCase().includes(lf) ||
          ep.method.toLowerCase().includes(lf)
        );
      });
      if (endpoints.length === 0) return;
      anyVisible = true;

      const groupEl = document.createElement('div');
      groupEl.className = 'nav-group';

      const header = document.createElement('div');
      header.className = 'nav-group-header';
      header.innerHTML = `<span>${escapeHtml(group.group)}</span><span class="chevron">▾</span>`;
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        list.classList.toggle('collapsed');
      });

      const list = document.createElement('ul');
      list.className = 'nav-group-items';

      endpoints.forEach((ep) => {
        const item = document.createElement('li');
        item.className = 'nav-item';
        item.dataset.groupFile = group._file;
        item.dataset.endpointId = ep.id;
        item.innerHTML = `
          <span class="method-badge ${METHOD_COLORS[ep.method] || ''}">${ep.method}</span>
          <span class="path-text" title="${escapeHtml(ep.path)}">${escapeHtml(ep.path)}</span>
        `;
        item.addEventListener('click', () => selectEndpoint(group._file, ep.id, item));
        list.appendChild(item);
      });

      groupEl.appendChild(header);
      groupEl.appendChild(list);
      nav.appendChild(groupEl);
    });

    if (!anyVisible) {
      nav.innerHTML = '<p class="sidebar-loading">API가 없습니다.</p>';
    }
  }

  function selectEndpoint(groupFile, endpointId, navItem) {
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
    navItem.classList.add('active');

    const group = allGroups.find((g) => g._file === groupFile);
    if (!group) return;
    const ep = group.endpoints.find((e) => e.id === endpointId);
    if (!ep) return;

    currentEndpoint = { group, ep };
    renderEndpointView(group, ep);
    location.hash = `${groupFile}/${endpointId}`;
  }

  // ── 엔드포인트 뷰 렌더링 ──────────────────────────
  function renderEndpointView(group, ep) {
    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('docTestLayout').classList.remove('hidden');
    // API가 바뀌면 Drawer 닫기
    closeTryPanel();
    const view = document.getElementById('endpointView');

    const methodClass = METHOD_COLORS[ep.method] || '';

    let headersHtml = '';
    if (ep.headers && ep.headers.length) {
      headersHtml = `
        <div class="doc-section">
          <h4>Request Headers</h4>
          <table class="doc-table">
            <thead><tr><th>Key</th><th>Value</th><th>Required</th><th>Description</th></tr></thead>
            <tbody>
              ${ep.headers.map((h) => `
                <tr>
                  <td><code>${escapeHtml(h.key)}</code></td>
                  <td><code>${escapeHtml(h.value)}</code></td>
                  <td>${h.required ? '<span class="required-badge">Required</span>' : '<span style="color:var(--muted-color)">Optional</span>'}</td>
                  <td>${escapeHtml(h.description || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    let paramsHtml = '';
    if (ep.params && ep.params.length) {
      paramsHtml = `
        <div class="doc-section">
          <h4>Query Parameters</h4>
          <table class="doc-table">
            <thead><tr><th>Key</th><th>Example</th><th>Required</th><th>Encode</th><th>Description</th></tr></thead>
            <tbody>
              ${ep.params.map((p) => `
                <tr>
                  <td><code>${escapeHtml(p.key)}</code></td>
                  <td><code>${escapeHtml(p.value || '')}</code></td>
                  <td>${p.required ? '<span class="required-badge">Required</span>' : '<span style="color:var(--muted-color)">Optional</span>'}</td>
                  <td>${p.encode ? '<span class="badge">encode</span>' : '—'}</td>
                  <td>${escapeHtml(p.description || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    let bodyHtml = '';
    if (ep.body) {
      bodyHtml = `
        <div class="doc-section">
          <h4>Request Body <span class="badge">JSON</span></h4>
          <pre class="json-viewer">${syntaxHighlight(ep.body)}</pre>
        </div>`;
    }

    let responseHtml = '';
    if (ep.response) {
      const statusClass = ep.response.status >= 500 ? 'status-5xx'
        : ep.response.status >= 400 ? 'status-4xx' : 'status-2xx';
      responseHtml = `
        <div class="doc-section response-example">
          <h4>Response Example</h4>
          <div class="response-status-inline ${statusClass}">
            ${ep.response.status} ${httpStatusText(ep.response.status)}
          </div>
          <pre class="json-viewer">${syntaxHighlight(ep.response.example)}</pre>
        </div>`;
    }

    const tryItBtn = `<button class="outline btn-xs" id="tryItBtn" ${apiTestEnabled ? '' : 'disabled title="API Test를 켜주세요"'}>
      ▶ Try it out
    </button>`;

    view.innerHTML = `
      <div class="endpoint-header">
        <div class="endpoint-title">
          <span class="method-tag ${methodClass}">${ep.method}</span>
          <span class="endpoint-path">${escapeHtml(ep.path)}</span>
        </div>
        <div class="endpoint-actions">
          ${tryItBtn}
          <a href="editor.html?file=${encodeURIComponent(group._file)}&id=${encodeURIComponent(ep.id)}" role="button" class="outline secondary btn-xs">✏ Edit</a>
        </div>
      </div>

      ${ep.summary ? `<p><strong>${escapeHtml(ep.summary)}</strong></p>` : ''}
      ${ep.description ? `<p style="color:var(--muted-color);font-size:0.88rem">${escapeHtml(ep.description)}</p>` : ''}

      ${headersHtml}
      ${paramsHtml}
      ${bodyHtml}
      ${responseHtml}
    `;

    const tryBtn = document.getElementById('tryItBtn');
    if (tryBtn) {
      tryBtn.addEventListener('click', () => openTryPanel(ep));
    }
  }

  // ── Try Panel Drawer ──────────────────────────────
  function openTryPanel(ep) {
    // endpoint 정보 표시
    document.getElementById('tryPanelEndpoint').textContent = `${ep.method} ${ep.path}`;

    // base url
    document.getElementById('baseUrl').value = targetHost || `http://localhost:${serverPort}`;

    // headers
    renderKvFields('headerFields', ep.headers || [], true);

    // params
    const paramsSection = document.getElementById('paramsSection');
    if (ep.params && ep.params.length) {
      paramsSection.style.display = '';
      renderParamFields('paramFields', ep.params);
    } else {
      paramsSection.style.display = 'none';
    }

    // body
    const bodySection = document.getElementById('bodySection');
    if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
      bodySection.style.display = '';
      const initVal = ep.body ? JSON.stringify(ep.body, null, 2) : '';
      bodyEditor.setValue(initVal);
      // CodeMirror는 display:none 상태에서 생성되면 크기가 0이라 refresh 필요
      setTimeout(() => bodyEditor.refresh(), 50);
      validateJsonCm();
    } else {
      bodySection.style.display = 'none';
    }

    document.getElementById('responseSection').style.display = 'none';

    // 슬라이드인
    document.getElementById('tryPanel').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('open');
  }

  function closeTryPanel() {
    document.getElementById('tryPanel').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('open');
  }

  function renderKvFields(containerId, items, isHeader) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const toRender = items.length ? items : [{ key: '', value: '', required: false, encode: false }];
    toRender.forEach((item) => addKvRow(container, item.key, item.value, isHeader, item.encode));
  }

  function renderParamFields(containerId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const toRender = items.length ? items : [{ key: '', value: '', encode: false }];
    toRender.forEach((item) => addKvRow(container, item.key, item.value, false, item.encode));
  }

  function addKvRow(container, key = '', value = '', isHeader = false, encode = false) {
    const row = document.createElement('div');
    row.className = 'kv-row';

    const keyWrap = document.createElement('div');
    keyWrap.className = 'kv-key';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Key';
    keyInput.value = key;
    keyInput.className = 'kv-key-input';

    keyWrap.appendChild(keyInput);

    if (isHeader) {
      bindHeaderAutocomplete(keyInput, container.closest('.form-section'));
    }

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.placeholder = 'Value';
    valInput.value = value;

    if (isHeader) {
      keyInput.addEventListener('change', () => prefillHeaderValue(keyInput, valInput));
    }

    const encodeBtn = document.createElement('button');
    encodeBtn.className = 'encode-btn' + (encode ? ' active' : '');
    encodeBtn.textContent = 'Encode';
    encodeBtn.type = 'button';
    encodeBtn.title = 'URL encode 적용';
    encodeBtn.addEventListener('click', () => encodeBtn.classList.toggle('active'));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-row-btn';
    removeBtn.textContent = '✕';
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => {
      row.remove();
    });

    row.appendChild(keyWrap);
    row.appendChild(valInput);
    row.appendChild(encodeBtn);
    row.appendChild(removeBtn);
    container.appendChild(row);
  }

  // Header Key 자동완성
  function bindHeaderAutocomplete(keyInput, section) {
    const list = document.createElement('ul');
    list.className = 'autocomplete-list';
    list.style.display = 'none';
    keyInput.parentNode.appendChild(list);

    keyInput.addEventListener('input', () => {
      const q = keyInput.value.toLowerCase();
      const suggestions = q
        ? HEADER_AUTOCOMPLETE.filter((h) => h.toLowerCase().startsWith(q))
        : HEADER_AUTOCOMPLETE;
      renderAutoList(list, suggestions, keyInput);
    });

    keyInput.addEventListener('focus', () => {
      const q = keyInput.value.toLowerCase();
      const suggestions = q
        ? HEADER_AUTOCOMPLETE.filter((h) => h.toLowerCase().startsWith(q))
        : HEADER_AUTOCOMPLETE.slice(0, 6);
      renderAutoList(list, suggestions, keyInput);
    });

    document.addEventListener('click', (e) => {
      if (!keyInput.contains(e.target) && !list.contains(e.target)) {
        list.style.display = 'none';
      }
    });
  }

  function renderAutoList(list, suggestions, keyInput) {
    if (suggestions.length === 0) { list.style.display = 'none'; return; }
    list.innerHTML = suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
    list.style.display = '';
    list.querySelectorAll('li').forEach((li) => {
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        keyInput.value = li.textContent;
        list.style.display = 'none';
      });
    });
  }

  function prefillHeaderValue(keyInput, valInput) {
    if (valInput.value) return;
    const k = keyInput.value.toLowerCase();
    if (k === 'content-type') valInput.value = 'application/json';
    if (k === 'authorization') valInput.value = 'Bearer ';
    if (k === 'accept') valInput.value = 'application/json';
  }

  // JSON 유효성 검사
  function validateJson(text) {
    const el = document.getElementById('jsonValidStatus');
    if (!text.trim()) { el.textContent = ''; el.className = 'json-valid-status'; return true; }
    try {
      JSON.parse(text);
      el.textContent = '✓ Valid JSON';
      el.className = 'json-valid-status valid';
      return true;
    } catch (e) {
      el.textContent = '✗ ' + e.message;
      el.className = 'json-valid-status invalid';
      return false;
    }
  }

  // ── API 요청 실행 ─────────────────────────────────
  async function sendRequest() {
    if (!currentEndpoint) return;
    const { ep } = currentEndpoint;

    const baseUrl = document.getElementById('baseUrl').value.replace(/\/$/, '');
    const sendBtn = document.getElementById('sendRequestBtn');
    sendBtn.setAttribute('aria-busy', 'true');
    sendBtn.disabled = true;

    // Headers
    const headers = {};
    document.querySelectorAll('#headerFields .kv-row').forEach((row) => {
      const key = row.querySelector('.kv-key-input').value.trim();
      const val = row.querySelectorAll('input')[1]?.value.trim() || '';
      if (key) headers[key] = val;
    });

    // Params
    const paramPairs = [];
    document.querySelectorAll('#paramFields .kv-row').forEach((row) => {
      const key = row.querySelector('.kv-key-input').value.trim();
      const val = row.querySelectorAll('input')[1]?.value.trim() || '';
      const encode = row.querySelector('.encode-btn')?.classList.contains('active');
      if (key) paramPairs.push({ key, val, encode });
    });

    let url = baseUrl + ep.path;
    if (paramPairs.length) {
      const qs = paramPairs
        .map(({ key, val, encode }) => `${encodeURIComponent(key)}=${encode ? encodeURIComponent(val) : val}`)
        .join('&');
      url += '?' + qs;
    }

    // Body (CodeMirror)
    let body = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
      const raw = bodyEditor.getValue().trim();
      if (raw && !validateJsonCm()) {
        sendBtn.removeAttribute('aria-busy');
        sendBtn.disabled = false;
        return;
      }
      if (raw) body = raw;
    }

    // 같은 origin(server.js)의 /proxy 로 요청 → server.js 가 타겟 API 호출
    try {
      const res = await fetch('/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: ep.method, url, headers, body: body || null }),
      });

      const result = await res.json();
      showResponse(result.status, result.body);
    } catch (err) {
      showResponse('error', { error: '서버 연결 실패. API Test 서버가 실행 중인지 확인하세요.', detail: err.message });
    } finally {
      sendBtn.removeAttribute('aria-busy');
      sendBtn.disabled = false;
    }
  }

  function showResponse(status, body) {
    const section = document.getElementById('responseSection');
    const badge = document.getElementById('responseStatus');
    const viewer = document.getElementById('responseBody');

    section.style.display = '';

    if (status === 'error') {
      badge.textContent = 'Error';
      badge.style.background = '#fce4ec';
      badge.style.color = '#c62828';
    } else {
      const bg   = status >= 500 ? '#fce4ec' : status >= 400 ? '#fff3e0' : '#e8f5e9';
      const text = status >= 500 ? '#c62828' : status >= 400 ? '#e65100' : '#2e7d32';
      badge.textContent = `${status} ${httpStatusText(status)}`;
      badge.style.background = bg;
      badge.style.color = text;
    }

    // json-formatter 로 렌더링
    viewer.innerHTML = '';
    let parsed = body;
    if (typeof body === 'string') {
      try { parsed = JSON.parse(body); } catch (_) { parsed = body; }
    }

    if (parsed !== null && typeof parsed === 'object') {
      const formatter = new JSONFormatter(parsed, 2, {
        hoverPreviewEnabled: true,
        hoverPreviewArrayCount: 5,
        hoverPreviewFieldCount: 5,
        animateOpen: true,
        animateClose: false,
      });
      viewer.appendChild(formatter.render());
    } else {
      // 문자열이면 그냥 pre 로
      const pre = document.createElement('pre');
      pre.style.cssText = 'margin:0;font-size:0.78rem;white-space:pre-wrap;word-break:break-all';
      pre.textContent = String(parsed);
      viewer.appendChild(pre);
    }

    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── URL Hash 처리 (딥링크) ────────────────────────
  function checkUrlHash() {
    const hash = location.hash.replace('#', '');
    if (!hash) return;
    const parts = hash.split('/');
    if (parts.length < 2) return;
    const file = parts[0];
    const id = parts.slice(1).join('/');
    const group = allGroups.find((g) => g._file === file);
    if (!group) return;
    const ep = group.endpoints.find((e) => e.id === id);
    if (!ep) return;

    const navItem = document.querySelector(`[data-group-file="${file}"][data-endpoint-id="${id}"]`);
    if (navItem) selectEndpoint(file, id, navItem);
  }

  // ── 이벤트 바인딩 ─────────────────────────────────
  function bindEvents() {
    // 검색
    document.getElementById('searchInput').addEventListener('input', (e) => {
      renderSidebar(e.target.value);
    });

    // API Test 토글
    const toggle = document.getElementById('apiTestToggle');
    const toggleLabel = document.getElementById('toggleLabel');
    const serverStatus = document.getElementById('serverStatus');

    toggle.addEventListener('change', async () => {
      apiTestEnabled = toggle.checked;
      toggleLabel.textContent = apiTestEnabled ? 'API Test ON' : 'API Test OFF';

      if (apiTestEnabled) {
        serverStatus.textContent = `서버 시작 중... (port ${serverPort})`;
        serverStatus.classList.remove('hidden');
        // server.js 는 별도 실행이지만, 상태 확인
        await checkServerHealth();
      } else {
        serverStatus.classList.add('hidden');
      }

      // 현재 엔드포인트 재렌더링 (Try it out 버튼 활성화 상태 반영)
      if (currentEndpoint) {
        renderEndpointView(currentEndpoint.group, currentEndpoint.ep);
      }
    });

    // CodeMirror 초기화 (RequestBody 에디터)
    bodyEditor = CodeMirror(document.getElementById('bodyEditorWrap'), {
      mode: { name: 'javascript', json: true },
      theme: 'default',
      lineNumbers: true,
      tabSize: 2,
      indentWithTabs: false,
      lineWrapping: false,
      autofocus: false,
      extraKeys: {
        // Tab → 스페이스 2칸 들여쓰기
        'Tab': (cm) => cm.execCommand('indentMore'),
        'Shift-Tab': (cm) => cm.execCommand('indentLess'),
        // Ctrl/Cmd+Shift+F → Format
        'Ctrl-Shift-F': () => formatBodyJson(),
        'Cmd-Shift-F':  () => formatBodyJson(),
      },
    });
    bodyEditor.on('change', () => validateJsonCm());

    // Try Panel 이벤트
    document.getElementById('addHeaderBtn').addEventListener('click', () => {
      addKvRow(document.getElementById('headerFields'), '', '', true, false);
    });
    document.getElementById('addParamBtn').addEventListener('click', () => {
      addKvRow(document.getElementById('paramFields'), '', '', false, false);
    });
    document.getElementById('formatJsonBtn').addEventListener('click', formatBodyJson);
    document.getElementById('sendRequestBtn').addEventListener('click', sendRequest);
    document.getElementById('closeTryPanel').addEventListener('click', closeTryPanel);
    document.getElementById('drawerBackdrop').addEventListener('click', closeTryPanel);
  }

  function formatBodyJson() {
    try {
      const val = bodyEditor.getValue();
      bodyEditor.setValue(JSON.stringify(JSON.parse(val), null, 2));
      validateJsonCm();
    } catch (_) {}
  }

  function validateJsonCm() {
    const el = document.getElementById('jsonValidStatus');
    const val = bodyEditor.getValue().trim();
    if (!val) { el.textContent = ''; el.className = 'json-valid-status'; return true; }
    try {
      JSON.parse(val);
      el.textContent = '✓ Valid JSON';
      el.className = 'json-valid-status valid';
      return true;
    } catch (e) {
      el.textContent = '✗ ' + e.message;
      el.className = 'json-valid-status invalid';
      return false;
    }
  }

  async function checkServerHealth() {
    const serverStatus = document.getElementById('serverStatus');
    try {
      const res = await fetch('/health', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        serverStatus.textContent = `✓ 서버 실행 중 (port ${serverPort})`;
        return true;
      }
    } catch (_) {}
    serverStatus.textContent = `⚠ 서버 미연결 — 아래 명령어로 실행하세요: node server.js`;
    return false;
  }

  // ── 유틸 ──────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function syntaxHighlight(obj) {
    const json = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-bool';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${escapeHtml(match)}</span>`;
    });
  }

  function httpStatusText(code) {
    const map = {
      200: 'OK', 201: 'Created', 204: 'No Content',
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
      404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity',
      500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
    };
    return map[code] || '';
  }

  // ── JSON Syntax Highlight CSS (동적 주입) ─────────
  const syntaxStyle = document.createElement('style');
  syntaxStyle.textContent = `
    .json-key    { color: #0d47a1; }
    .json-string { color: #2e7d32; }
    .json-number { color: #b71c1c; }
    .json-bool   { color: #6a1b9a; font-weight:600; }
    .json-null   { color: #546e7a; font-style:italic; }
    [data-theme="dark"] .json-key    { color: #82b1ff; }
    [data-theme="dark"] .json-string { color: #a5d6a7; }
    [data-theme="dark"] .json-number { color: #ef9a9a; }
    [data-theme="dark"] .json-bool   { color: #ce93d8; }
    [data-theme="dark"] .json-null   { color: #90a4ae; }
  `;
  document.head.appendChild(syntaxStyle);

  // ── 시작 ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
