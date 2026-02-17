/* =====================================================
   Local API Docs — config.js
   공통 헤더 설정을 local.env 에 저장/로드
   ===================================================== */

(function () {
  'use strict';

  const HEADER_SUGGESTIONS = [
    'Authorization',
    'Cookie',
    'Content-Type',
    'Accept',
    'Accept-Language',
    'Cache-Control',
    'X-Requested-With',
    'X-API-Key',
    'X-Auth-Token',
    'X-CSRF-Token',
  ];

  // ── 초기화 ────────────────────────────────────────
  async function init() {
    await loadConfig();
    document.getElementById('addHeaderBtn').addEventListener('click', () => addRow('', ''));
    document.getElementById('saveBtn').addEventListener('click', saveConfig);
  }

  // ── 헤더 로드 ─────────────────────────────────────
  async function loadConfig() {
    try {
      const res = await fetch('/get-config?' + Date.now());
      const data = await res.json();
      const list = document.getElementById('headerList');
      list.innerHTML = '';
      if (data.headers && data.headers.length) {
        data.headers.forEach((h) => addRow(h.key, h.value));
      } else {
        addRow('', '');
      }
    } catch (_) {
      addRow('', '');
    }
  }

  // ── 행 추가 ───────────────────────────────────────
  function addRow(key, value) {
    const list = document.getElementById('headerList');
    const row = document.createElement('div');
    row.className = 'config-kv-row';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Authorization';
    keyInput.value = key;
    bindAutocomplete(keyInput);

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.placeholder = 'Bearer token123';
    valInput.value = value;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-row-btn';
    removeBtn.textContent = '✕';
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => row.remove());

    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(removeBtn);
    list.appendChild(row);

    keyInput.focus();
  }

  // ── 저장 ──────────────────────────────────────────
  async function saveConfig() {
    const rows = document.querySelectorAll('.config-kv-row');
    const headers = [];
    rows.forEach((row) => {
      const inputs = row.querySelectorAll('input');
      const key = inputs[0].value.trim();
      const value = inputs[1].value;
      if (key) headers.push({ key, value });
    });

    const statusEl = document.getElementById('saveStatus');
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.setAttribute('aria-busy', 'true');
    statusEl.textContent = '';
    statusEl.className = 'save-status';

    try {
      const res = await fetch('/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers }),
      });
      const data = await res.json();
      if (data.ok) {
        statusEl.textContent = '✓ 저장됨';
        statusEl.className = 'save-status success';
      } else {
        statusEl.textContent = '저장 실패: ' + (data.error || '');
        statusEl.className = 'save-status error';
      }
    } catch (err) {
      statusEl.textContent = '서버 오류: ' + err.message;
      statusEl.className = 'save-status error';
    } finally {
      saveBtn.removeAttribute('aria-busy');
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'save-status'; }, 3000);
    }
  }

  // ── Key 자동완성 ──────────────────────────────────
  function bindAutocomplete(input) {
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    // input을 wrap으로 교체하는 대신, input이 DOM에 붙은 후 처리
    // addRow에서 appendChild 후 호출되므로 input.parentNode는 row
    // → input을 wrap 안으로 이동
    input.addEventListener('focus', () => {
      // wrap이 아직 없으면 생성
      if (!input._acList) {
        const list = document.createElement('ul');
        list.className = 'autocomplete-list';
        list.style.display = 'none';
        input.parentNode.style.position = 'relative';
        input.parentNode.appendChild(list);
        input._acList = list;

        input.addEventListener('input', () => renderAc(input));
        document.addEventListener('click', (e) => {
          if (!input.contains(e.target) && !list.contains(e.target)) {
            list.style.display = 'none';
          }
        });
      }
      renderAc(input);
    });
  }

  function renderAc(input) {
    const list = input._acList;
    if (!list) return;
    const q = input.value.toLowerCase();
    const suggestions = q
      ? HEADER_SUGGESTIONS.filter((h) => h.toLowerCase().startsWith(q))
      : HEADER_SUGGESTIONS.slice(0, 6);
    if (!suggestions.length) { list.style.display = 'none'; return; }
    list.innerHTML = suggestions.map((s) => `<li>${s}</li>`).join('');
    list.style.display = '';
    list.querySelectorAll('li').forEach((li) => {
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = li.textContent;
        list.style.display = 'none';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
