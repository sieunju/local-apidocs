/* =====================================================
   Local API Docs — editor.js
   API 추가 / 수정 / 삭제
   ===================================================== */

(function () {
  'use strict';

  const API_DIR = 'apis/';
  const HEADER_AUTOCOMPLETE = [
    'Authorization', 'Content-Type', 'Accept', 'Accept-Language',
    'Cache-Control', 'X-Requested-With', 'X-API-Key', 'X-Auth-Token',
    'X-CSRF-Token', 'User-Agent', 'Referer', 'Origin', 'Cookie',
  ];

  // ── 상태 ──────────────────────────────────────────
  let editingFile = null;
  let editingId = null;
  let existingGroup = null;
  let serverPort = 3000;
  let cmBody = null; // CodeMirror: Request Body
  let cmRes  = null; // CodeMirror: Response Example

  // ── 초기화 ────────────────────────────────────────
  async function init() {
    if (location.protocol === 'file:') {
      document.body.innerHTML = `
        <div style="max-width:520px;margin:6rem auto;padding:2rem;text-align:center">
          <h2>⚠ 서버를 먼저 실행하세요</h2>
          <p><code>file://</code> 프로토콜에서는 저장 기능을 사용할 수 없습니다.</p>
          <pre style="background:#f5f5f5;padding:1rem;border-radius:6px;text-align:left">node server.js</pre>
          <p>→ <a href="http://localhost:3000/editor.html">http://localhost:3000/editor.html</a></p>
        </div>`;
      return;
    }
    await loadEnvConfig();
    parseUrlParams();
    bindEvents();
    updatePreview();
  }

  async function loadEnvConfig() {
    try {
      const res = await fetch('local.env?' + Date.now());
      const text = await res.text();
      const portMatch = text.match(/^PORT\s*=\s*(\d+)/m);
      if (portMatch) serverPort = parseInt(portMatch[1], 10);
    } catch (_) {}
  }

  function parseUrlParams() {
    const params = new URLSearchParams(location.search);
    editingFile = params.get('file');
    editingId   = params.get('id');

    if (editingFile && editingId) {
      loadExistingEndpoint(editingFile, editingId);
    } else {
      // 신규: 기본 헤더 1개 추가
      addHeaderRow('', '');
      addParamRow('', '', false, false, '');
      document.getElementById('editorTitle').textContent = 'New API';
    }
  }

  async function loadExistingEndpoint(file, id) {
    document.getElementById('editorTitle').textContent = 'Edit API';
    try {
      const res = await fetch(API_DIR + file + '?' + Date.now());
      if (!res.ok) throw new Error('File not found');
      existingGroup = await res.json();

      const ep = existingGroup.endpoints.find((e) => e.id === id);
      if (!ep) throw new Error('Endpoint not found');

      // 그룹 정보
      document.getElementById('groupName').value = existingGroup.group || '';
      document.getElementById('fileName').value = file.replace('.json', '');
      document.getElementById('groupDesc').value = existingGroup.description || '';

      // 엔드포인트
      document.getElementById('epMethod').value = ep.method || 'GET';
      document.getElementById('epPath').value = ep.path || '';
      document.getElementById('epSummary').value = ep.summary || '';
      document.getElementById('epDescription').value = ep.description || '';

      // Headers
      if (ep.headers && ep.headers.length) {
        ep.headers.forEach((h) => addHeaderRow(h.key, h.value, h.required));
      } else {
        addHeaderRow('', '');
      }

      // Params
      if (ep.params && ep.params.length) {
        ep.params.forEach((p) => addParamRow(p.key, p.value, p.required, p.encode, p.description));
      } else {
        addParamRow('', '', false, false, '');
      }

      // Body
      if (ep.body && cmBody) {
        cmBody.setValue(JSON.stringify(ep.body, null, 2));
        validateJsonCm(cmBody, 'editorJsonStatus');
      }

      // Response
      if (ep.response) {
        document.getElementById('resStatus').value = ep.response.status || '200';
        if (ep.response.example && cmRes) {
          cmRes.setValue(JSON.stringify(ep.response.example, null, 2));
          validateJsonCm(cmRes, 'editorResJsonStatus');
        }
      }

      // 삭제 버튼 표시
      showDeleteButton();
      updatePreview();
    } catch (err) {
      showSaveStatus('로드 실패: ' + err.message, true);
    }
  }

  // ── KV Row: Headers ──────────────────────────────
  function addHeaderRow(key = '', value = '', required = false) {
    const container = document.getElementById('editorHeaderFields');
    const row = document.createElement('div');
    row.className = 'editor-header-row';

    const keyWrap = document.createElement('div');
    keyWrap.className = 'kv-key';
    keyWrap.style.position = 'relative';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Header Key';
    keyInput.value = key;
    keyWrap.appendChild(keyInput);
    bindHeaderAutocomplete(keyInput);

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.placeholder = 'Value';
    valInput.value = value;
    keyInput.addEventListener('change', () => prefillHeaderValue(keyInput, valInput));

    const reqSelect = document.createElement('select');
    reqSelect.style.fontSize = '0.72rem';
    reqSelect.style.padding = '0.3rem 0.3rem';
    reqSelect.style.margin = '0';
    const optReq = new Option('Required', 'true');
    const optOpt = new Option('Optional', 'false');
    reqSelect.appendChild(optReq);
    reqSelect.appendChild(optOpt);
    reqSelect.value = required ? 'true' : 'false';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-row-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => { row.remove(); updatePreview(); });

    row.appendChild(keyWrap);
    row.appendChild(valInput);
    row.appendChild(reqSelect);
    row.appendChild(removeBtn);
    container.appendChild(row);

    [keyInput, valInput, reqSelect].forEach((el) =>
      el.addEventListener('input', updatePreview)
    );
  }

  // ── KV Row: Params ───────────────────────────────
  function addParamRow(key = '', value = '', required = false, encode = false, desc = '') {
    const container = document.getElementById('editorParamFields');
    const row = document.createElement('div');
    row.className = 'editor-kv-row';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Key';
    keyInput.value = key;

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.placeholder = 'Example';
    valInput.value = value;

    const reqSelect = document.createElement('select');
    reqSelect.style.fontSize = '0.72rem';
    reqSelect.style.padding = '0.3rem 0.3rem';
    reqSelect.style.margin = '0';
    reqSelect.appendChild(new Option('Required', 'true'));
    reqSelect.appendChild(new Option('Optional', 'false'));
    reqSelect.value = required ? 'true' : 'false';

    const encodeBtn = document.createElement('button');
    encodeBtn.type = 'button';
    encodeBtn.className = 'encode-btn' + (encode ? ' active' : '');
    encodeBtn.textContent = 'Encode';
    encodeBtn.addEventListener('click', () => {
      encodeBtn.classList.toggle('active');
      updatePreview();
    });

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.placeholder = 'Description';
    descInput.value = desc;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-row-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => { row.remove(); updatePreview(); });

    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(reqSelect);
    row.appendChild(encodeBtn);
    row.appendChild(descInput);
    row.appendChild(removeBtn);
    container.appendChild(row);

    [keyInput, valInput, reqSelect, descInput].forEach((el) =>
      el.addEventListener('input', updatePreview)
    );
  }

  // ── 자동완성 ──────────────────────────────────────
  function bindHeaderAutocomplete(keyInput) {
    const list = document.createElement('ul');
    list.className = 'autocomplete-list';
    list.style.display = 'none';
    keyInput.parentNode.appendChild(list);

    function show() {
      const q = keyInput.value.toLowerCase();
      const suggestions = q
        ? HEADER_AUTOCOMPLETE.filter((h) => h.toLowerCase().startsWith(q))
        : HEADER_AUTOCOMPLETE.slice(0, 8);
      if (!suggestions.length) { list.style.display = 'none'; return; }
      list.innerHTML = suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
      list.style.display = '';
      list.querySelectorAll('li').forEach((li) => {
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          keyInput.value = li.textContent;
          list.style.display = 'none';
          updatePreview();
        });
      });
    }

    keyInput.addEventListener('input', show);
    keyInput.addEventListener('focus', show);
    document.addEventListener('click', (e) => {
      if (!keyInput.contains(e.target)) list.style.display = 'none';
    });
  }

  function prefillHeaderValue(keyInput, valInput) {
    if (valInput.value) return;
    const k = keyInput.value.toLowerCase();
    if (k === 'content-type') valInput.value = 'application/json';
    if (k === 'authorization') valInput.value = 'Bearer ';
    if (k === 'accept') valInput.value = 'application/json';
    updatePreview();
  }

  // ── JSON 유효성 (CodeMirror 인스턴스 기반) ─────────
  function validateJsonCm(cm, statusId) {
    const el = document.getElementById(statusId);
    const text = cm.getValue().trim();
    if (!text) { el.textContent = ''; el.className = 'json-valid-status'; return true; }
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

  // ── 폼 → 데이터 수집 ─────────────────────────────
  function collectFormData() {
    const groupName = document.getElementById('groupName').value.trim();
    const fileNameRaw = document.getElementById('fileName').value.trim();
    const fileName = fileNameRaw.endsWith('.json') ? fileNameRaw : fileNameRaw + '.json';

    const headers = [];
    document.querySelectorAll('#editorHeaderFields .editor-header-row').forEach((row) => {
      const inputs = row.querySelectorAll('input');
      const sel = row.querySelector('select');
      const key = inputs[0]?.value.trim();
      const val = inputs[1]?.value.trim();
      if (key) headers.push({ key, value: val || '', required: sel?.value === 'true', description: '' });
    });

    const params = [];
    document.querySelectorAll('#editorParamFields .editor-kv-row').forEach((row) => {
      const inputs = row.querySelectorAll('input');
      const sel = row.querySelector('select');
      const encBtn = row.querySelector('.encode-btn');
      const key = inputs[0]?.value.trim();
      const val = inputs[1]?.value.trim() || '';
      const desc = inputs[2]?.value.trim() || '';
      if (key) params.push({
        key, value: val,
        required: sel?.value === 'true',
        encode: encBtn?.classList.contains('active') || false,
        description: desc,
      });
    });

    let body = null;
    const bodyRaw = cmBody ? cmBody.getValue().trim() : '';
    if (bodyRaw) {
      try { body = JSON.parse(bodyRaw); } catch (_) { body = null; }
    }

    let responseExample = null;
    const resRaw = cmRes ? cmRes.getValue().trim() : '';
    if (resRaw) {
      try { responseExample = JSON.parse(resRaw); } catch (_) {}
    }

    return {
      groupName,
      groupDesc: document.getElementById('groupDesc').value.trim(),
      fileName,
      endpoint: {
        id: editingId || generateId(
          document.getElementById('epMethod').value,
          document.getElementById('epPath').value
        ),
        method: document.getElementById('epMethod').value,
        path: document.getElementById('epPath').value.trim(),
        summary: document.getElementById('epSummary').value.trim(),
        description: document.getElementById('epDescription').value.trim(),
        headers,
        params,
        body,
        response: {
          status: parseInt(document.getElementById('resStatus').value, 10),
          example: responseExample,
        },
      },
    };
  }

  function generateId(method, path) {
    return (method + '-' + path)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ── Live Preview ──────────────────────────────────
  function updatePreview() {
    const data = collectFormData();
    const ep = data.endpoint;
    const preview = document.getElementById('previewArea');

    if (!ep.method && !ep.path) {
      preview.innerHTML = '<p class="preview-placeholder">작성하면 여기에 미리보기가 표시됩니다.</p>';
      return;
    }

    const methodColors = {
      GET: '#61affe', POST: '#49cc90', PUT: '#fca130', DELETE: '#f93e3e', PATCH: '#50e3c2'
    };

    let html = `
      <div style="margin-bottom:0.75rem">
        <span class="preview-method" style="background:${methodColors[ep.method] || '#888'}">${ep.method || '?'}</span>
        <span class="preview-path">${escapeHtml(ep.path || '/')}</span>
      </div>
    `;

    if (ep.summary) html += `<p style="font-size:0.82rem;font-weight:600;margin:0 0 0.25rem">${escapeHtml(ep.summary)}</p>`;
    if (ep.description) html += `<p style="font-size:0.78rem;color:var(--muted-color);margin:0 0 0.75rem">${escapeHtml(ep.description)}</p>`;

    // Headers
    const validHeaders = ep.headers.filter((h) => h.key);
    if (validHeaders.length) {
      html += `<div class="preview-section"><h6>Headers</h6><table class="preview-table">`;
      validHeaders.forEach((h) => {
        html += `<tr><td>${escapeHtml(h.key)}</td><td>${escapeHtml(h.value)}</td><td style="color:var(--muted-color);font-size:0.7rem">${h.required ? 'Required' : 'Optional'}</td></tr>`;
      });
      html += `</table></div>`;
    }

    // Params
    const validParams = ep.params.filter((p) => p.key);
    if (validParams.length) {
      html += `<div class="preview-section"><h6>Query Params</h6><table class="preview-table">`;
      validParams.forEach((p) => {
        html += `<tr><td>${escapeHtml(p.key)}</td><td>${escapeHtml(p.value)}</td><td style="color:var(--muted-color);font-size:0.7rem">${p.required ? 'Required' : 'Optional'}${p.encode ? ' · encode' : ''}</td></tr>`;
      });
      html += `</table></div>`;
    }

    // Body
    if (ep.body) {
      html += `<div class="preview-section"><h6>Request Body</h6><pre class="preview-json">${escapeHtml(JSON.stringify(ep.body, null, 2))}</pre></div>`;
    }

    // Response
    if (ep.response && ep.response.example) {
      html += `<div class="preview-section"><h6>Response ${ep.response.status}</h6><pre class="preview-json">${escapeHtml(JSON.stringify(ep.response.example, null, 2))}</pre></div>`;
    }

    preview.innerHTML = html;
  }

  // ── 저장 ──────────────────────────────────────────
  async function save() {
    const data = collectFormData();

    if (!data.groupName) { alert('Group Name을 입력하세요.'); return; }
    if (!data.fileName || data.fileName === '.json') { alert('File Name을 입력하세요.'); return; }
    if (!data.endpoint.path) { alert('Path를 입력하세요.'); return; }

    // Body / Response JSON 유효성 확인
    const bodyRaw = cmBody ? cmBody.getValue().trim() : '';
    if (bodyRaw && !validateJsonCm(cmBody, 'editorJsonStatus')) {
      alert('Request Body JSON이 유효하지 않습니다.'); return;
    }
    const resRaw = cmRes ? cmRes.getValue().trim() : '';
    if (resRaw && !validateJsonCm(cmRes, 'editorResJsonStatus')) {
      alert('Response Example JSON이 유효하지 않습니다.'); return;
    }

    // 그룹 구성
    let groupData;
    if (editingFile && existingGroup && editingFile === data.fileName) {
      // 같은 파일 수정
      groupData = { ...existingGroup };
      const idx = groupData.endpoints.findIndex((e) => e.id === editingId);
      if (idx >= 0) {
        groupData.endpoints[idx] = data.endpoint;
      } else {
        groupData.endpoints.push(data.endpoint);
      }
      groupData.group = data.groupName;
      groupData.description = data.groupDesc;
    } else if (editingFile && existingGroup && editingFile !== data.fileName) {
      // 파일명 변경: 기존 파일에서 엔드포인트 제거 후 새 파일에 추가
      await saveGroupToFile(editingFile, {
        ...existingGroup,
        endpoints: existingGroup.endpoints.filter((e) => e.id !== editingId),
      });
      // 새 파일 구성
      groupData = await loadOrCreateGroup(data.fileName, data.groupName, data.groupDesc);
      groupData.endpoints = groupData.endpoints.filter((e) => e.id !== data.endpoint.id);
      groupData.endpoints.push(data.endpoint);
    } else {
      // 신규
      groupData = await loadOrCreateGroup(data.fileName, data.groupName, data.groupDesc);
      groupData.group = data.groupName;
      groupData.description = data.groupDesc;
      // 같은 id 중복 방지
      groupData.endpoints = groupData.endpoints.filter((e) => e.id !== data.endpoint.id);
      groupData.endpoints.push(data.endpoint);
    }

    const success = await saveGroupToFile(data.fileName, groupData);
    if (success) {
      await updateIndexFile(data.fileName);
      showSaveStatus('저장 완료 ✓', false);
      editingFile = data.fileName;
      editingId = data.endpoint.id;
      existingGroup = groupData;
      history.replaceState(null, '', `editor.html?file=${encodeURIComponent(data.fileName)}&id=${encodeURIComponent(data.endpoint.id)}`);
      document.getElementById('editorTitle').textContent = 'Edit API';
      showDeleteButton();
    }
  }

  async function loadOrCreateGroup(fileName, groupName, groupDesc) {
    try {
      const r = await fetch(API_DIR + fileName + '?' + Date.now());
      if (r.ok) return await r.json();
    } catch (_) {}
    return { group: groupName, description: groupDesc, endpoints: [] };
  }

  async function saveGroupToFile(fileName, groupData) {
    // server.js 통해 저장
    try {
      const res = await fetch(`http://localhost:${serverPort}/save-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, data: groupData }),
      });
      if (res.ok) return true;
      const err = await res.json();
      showSaveStatus('저장 실패: ' + (err.error || 'unknown'), true);
      return false;
    } catch (_) {
      showSaveStatus('서버 미연결 — node server.js 를 실행하세요.', true);
      return false;
    }
  }

  async function updateIndexFile(newFile) {
    try {
      const res = await fetch(`http://localhost:${serverPort}/update-index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: newFile }),
      });
      return res.ok;
    } catch (_) { return false; }
  }

  // ── 삭제 ──────────────────────────────────────────
  function showDeleteButton() {
    const actions = document.querySelector('.header-right');
    if (document.getElementById('deleteBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'deleteBtn';
    btn.textContent = 'Delete';
    btn.className = 'outline btn-sm';
    btn.style.borderColor = '#e74c3c';
    btn.style.color = '#e74c3c';
    btn.addEventListener('click', () => {
      document.getElementById('deleteDialog').showModal();
    });
    actions.insertBefore(btn, document.getElementById('cancelBtn'));
  }

  async function deleteEndpoint() {
    if (!editingFile || !editingId || !existingGroup) return;
    const updated = {
      ...existingGroup,
      endpoints: existingGroup.endpoints.filter((e) => e.id !== editingId),
    };
    const success = await saveGroupToFile(editingFile, updated);
    if (success) {
      location.href = 'index.html';
    }
  }

  // ── UI 유틸 ───────────────────────────────────────
  function showSaveStatus(msg, isError) {
    const el = document.getElementById('saveStatus');
    el.textContent = msg;
    el.className = 'save-status ' + (isError ? 'error' : 'success');
    if (!isError) setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 3000);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 이벤트 바인딩 ─────────────────────────────────
  function bindEvents() {
    document.getElementById('saveBtn').addEventListener('click', save);
    document.getElementById('cancelBtn').addEventListener('click', () => {
      location.href = 'index.html';
    });

    document.getElementById('addEditorHeaderBtn').addEventListener('click', () => {
      addHeaderRow('', '');
    });
    document.getElementById('addEditorParamBtn').addEventListener('click', () => {
      addParamRow('', '', false, false, '');
    });

    // CodeMirror 초기화
    const cmOptions = {
      mode: { name: 'javascript', json: true },
      theme: 'default',
      lineNumbers: true,
      tabSize: 2,
      indentWithTabs: false,
      lineWrapping: false,
      extraKeys: {
        'Tab': (cm) => cm.execCommand('indentMore'),
        'Shift-Tab': (cm) => cm.execCommand('indentLess'),
      },
    };

    cmBody = CodeMirror(document.getElementById('editorBodyWrap'), cmOptions);
    cmBody.on('change', () => { validateJsonCm(cmBody, 'editorJsonStatus'); updatePreview(); });

    cmRes = CodeMirror(document.getElementById('editorResWrap'), cmOptions);
    cmRes.on('change', () => { validateJsonCm(cmRes, 'editorResJsonStatus'); updatePreview(); });

    document.getElementById('formatEditorJsonBtn').addEventListener('click', () => {
      try { cmBody.setValue(JSON.stringify(JSON.parse(cmBody.getValue()), null, 2)); } catch (_) {}
      validateJsonCm(cmBody, 'editorJsonStatus');
    });
    document.getElementById('formatEditorResJsonBtn').addEventListener('click', () => {
      try { cmRes.setValue(JSON.stringify(JSON.parse(cmRes.getValue()), null, 2)); } catch (_) {}
      validateJsonCm(cmRes, 'editorResJsonStatus');
    });

    // 실시간 프리뷰 트리거
    ['groupName', 'fileName', 'epMethod', 'epPath', 'epSummary', 'epDescription', 'resStatus'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updatePreview);
    });

    // 삭제 다이얼로그
    document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
      document.getElementById('deleteDialog').close();
      deleteEndpoint();
    });
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
      document.getElementById('deleteDialog').close();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
