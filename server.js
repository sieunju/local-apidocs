/**
 * Local API Docs — Test Server
 *
 * 역할:
 *  1. index.html, editor.html 등 정적 파일 서빙
 *  2. /proxy  — 브라우저 CORS 제한 없이 외부 API 호출
 *  3. /health — 서버 상태 확인
 *
 * 실행: node server.js
 * 포트: local.env 의 PORT (기본 3000)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ── local.env 파싱 ────────────────────────────────
function loadEnv(filePath) {
  const config = {};
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      config[key] = val;
    }
  } catch (_) {}
  return config;
}

const env = loadEnv(path.join(__dirname, 'local.env'));
const PORT = parseInt(env.PORT || '3000', 10);

// ── MIME 타입 ──────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// ── 정적 파일 서빙 ────────────────────────────────
function serveStatic(reqPath, res) {
  // URL decode + 경로 정규화 (상위 경로 이탈 방지)
  let safePath;
  try {
    safePath = decodeURIComponent(reqPath);
  } catch (_) {
    safePath = reqPath;
  }

  // 루트 경로 → index.html
  if (safePath === '/') safePath = '/index.html';

  const resolved = path.resolve(__dirname, '.' + safePath);
  const base = path.resolve(__dirname);

  // 경로 탈출 방지
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + safePath);
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ── Proxy 요청 처리 ───────────────────────────────
function handleProxy(req, res) {
  let rawBody = '';
  req.on('data', (chunk) => { rawBody += chunk; });
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (_) {
      res.writeHead(400, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      return;
    }

    const { method, url: targetUrl, headers = {}, body } = payload;

    if (!targetUrl) {
      res.writeHead(400, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ error: 'url is required' }));
      return;
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (_) {
      res.writeHead(400, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ error: 'Invalid target URL' }));
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);

    const bodyBuf = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8') : null;

    const reqHeaders = Object.assign({}, headers);
    if (bodyBuf) {
      reqHeaders['Content-Length'] = bodyBuf.length;
    }
    // Host 헤더 자동 설정
    reqHeaders['Host'] = parsed.host;

    const options = {
      hostname: parsed.hostname,
      port,
      path: parsed.pathname + parsed.search,
      method: (method || 'GET').toUpperCase(),
      headers: reqHeaders,
      timeout: 30000,
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      let data = '';
      proxyRes.setEncoding('utf8');
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        let parsed_body;
        try {
          parsed_body = JSON.parse(data);
        } catch (_) {
          parsed_body = data;
        }
        res.writeHead(200, corsHeaders({ 'Content-Type': 'application/json' }));
        res.end(JSON.stringify({ status: proxyRes.statusCode, headers: proxyRes.headers, body: parsed_body }));
      });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ status: 'error', error: err.message }));
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.writeHead(504, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ status: 'error', error: 'Request timeout' }));
    });

    if (bodyBuf) proxyReq.write(bodyBuf);
    proxyReq.end();
  });
}

// ── API 파일 저장 ─────────────────────────────────
function handleSaveApi(req, res) {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(raw); } catch (_) {
      res.writeHead(400, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { fileName, data } = payload;
    if (!fileName || !data) {
      res.writeHead(400, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ error: 'fileName and data required' }));
      return;
    }

    // 경로 이탈 방지
    const safeName = path.basename(fileName);
    if (!safeName.endsWith('.json')) {
      res.writeHead(400, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ error: 'fileName must end with .json' }));
      return;
    }

    const filePath = path.join(__dirname, 'apis', safeName);
    const content = JSON.stringify(data, null, 2);

    fs.writeFile(filePath, content, 'utf8', (err) => {
      if (err) {
        res.writeHead(500, corsHeaders({ 'Content-Type': 'application/json' }));
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      res.writeHead(200, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ ok: true, file: safeName }));
    });
  });
}

// ── index.json 업데이트 ───────────────────────────
function handleUpdateIndex(req, res) {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(raw); } catch (_) {
      res.writeHead(400, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const newFile = path.basename(payload.file || '');
    const indexPath = path.join(__dirname, 'apis', 'index.json');

    let existing = [];
    try {
      existing = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch (_) {}

    if (!existing.includes(newFile)) {
      existing.push(newFile);
    }

    fs.writeFile(indexPath, JSON.stringify(existing, null, 2), 'utf8', (err) => {
      if (err) {
        res.writeHead(500, corsHeaders({ 'Content-Type': 'application/json' }));
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      res.writeHead(200, corsHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ ok: true, index: existing }));
    });
  });
}

// ── CORS 헤더 ─────────────────────────────────────
function corsHeaders(extra = {}) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }, extra);
}

// ── 메인 서버 ──────────────────────────────────────
const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = reqUrl.pathname;

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Health check
  if (pathname === '/health') {
    res.writeHead(200, corsHeaders({ 'Content-Type': 'application/json' }));
    res.end(JSON.stringify({ status: 'ok', port: PORT }));
    return;
  }

  // Proxy
  if (pathname === '/proxy' && req.method === 'POST') {
    handleProxy(req, res);
    return;
  }

  // API 파일 저장
  if (pathname === '/save-api' && req.method === 'POST') {
    handleSaveApi(req, res);
    return;
  }

  // index.json 업데이트
  if (pathname === '/update-index' && req.method === 'POST') {
    handleUpdateIndex(req, res);
    return;
  }

  // 정적 파일 서빙
  serveStatic(pathname, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  Local API Docs Server`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`   정적 파일 서빙 및 API 프록시 활성화`);
  console.log(`   종료: Ctrl+C\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use.`);
    console.error(`   local.env 에서 PORT 값을 변경하거나 기존 프로세스를 종료하세요.\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
