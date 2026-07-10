// CRM Static File Server + DingTalk Proxy (crash-resilient)
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 8088;
const STATIC_DIR = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, code, data) {
  try {
    const body = JSON.stringify(data);
    setCORS(res);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  } catch (e) {
    console.error('[Server] sendJSON failed:', e.message);
    try { res.end(); } catch (_) {}
  }
}

function serveStatic(req, res) {
  try {
    let filePath = path.join(STATIC_DIR, req.url === '/' ? 'crm_system.html' : req.url.split('?')[0]);
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      try {
        setCORS(res);
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        res.end(data);
      } catch (e) {
        console.error('[Server] serveStatic response error:', e.message);
        try { res.end(); } catch (_) {}
      }
    });
  } catch (e) {
    console.error('[Server] serveStatic error:', e.message);
    try { sendJSON(res, 500, { error: e.message }); } catch (_) {}
  }
}

function proxyDingTalk(req, res) {
  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    try {
      const raw = Buffer.concat(body).toString('utf-8');
      const data = JSON.parse(raw);
      const { webhook, secret: rawSecret, message } = data;
      // 去除密钥首尾空格/换行（防止复制粘贴时带入不可见字符导致签名不匹配）
      const secret = (rawSecret || '').trim();

      if (!webhook) {
        sendJSON(res, 400, { errcode: -1, errmsg: '缺少 webhook 参数' });
        return;
      }

      let apiUrl = webhook;
      if (secret) {
        const timestamp = Date.now();
        // 钉钉签名算法: timestamp + "\n" + secret → HMAC-SHA256(secret为key) → Base64 → URLEncode
        const stringToSign = timestamp + '\n' + secret;
        const sign = crypto.createHmac('sha256', secret).update(stringToSign, 'utf-8').digest('base64');
        apiUrl = webhook + '&timestamp=' + timestamp + '&sign=' + encodeURIComponent(sign);
        console.log('[DingTalk] 签名: ts=' + timestamp + ' sign=' + sign.substring(0, 20) + '...');
      }

      console.log('[DingTalk] ->', apiUrl.substring(0, 80) + '...');

      const parsed = new URL(apiUrl);
      const postData = JSON.stringify(message);

      const options = {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 15000,
      };

      const apiReq = https.request(options, (apiRes) => {
        let chunks = [];
        apiRes.on('data', c => chunks.push(c));
        apiRes.on('end', () => {
          try {
            const rawBody = Buffer.concat(chunks);
            let bodyStr = rawBody.toString('utf-8');
            try { JSON.parse(bodyStr); } catch (_) {
              bodyStr = rawBody.toString('gbk');
            }
            const result = JSON.parse(bodyStr);
            console.log('[DingTalk] <- errcode=' + result.errcode);
            sendJSON(res, 200, result);
          } catch (e) {
            console.error('[DingTalk] Parse error:', e.message);
            sendJSON(res, 502, { errcode: -1, errmsg: '响应解析失败' });
          }
        });
      });

      apiReq.on('error', (e) => {
        console.error('[DingTalk] Network error:', e.message);
        sendJSON(res, 502, { errcode: -1, errmsg: e.message });
      });

      apiReq.on('timeout', () => {
        apiReq.destroy();
        sendJSON(res, 504, { errcode: -1, errmsg: '请求钉钉超时' });
      });

      apiReq.write(postData);
      apiReq.end();

    } catch (e) {
      console.error('[DingTalk] Exception:', e.message);
      sendJSON(res, 500, { errcode: -1, errmsg: e.message });
    }
  });

  req.on('error', (e) => {
    console.error('[DingTalk] Request error:', e.message);
    try { res.end(); } catch (_) {}
  });
}

function handleRequest(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      setCORS(res);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/api/dingtalk') {
      proxyDingTalk(req, res);
    } else {
      serveStatic(req, res);
    }
  } catch (e) {
    console.error('[Server] Uncaught handler error:', e.message, e.stack);
    try { sendJSON(res, 500, { error: e.message }); } catch (_) {}
  }
}

const server = http.createServer(handleRequest);

server.on('error', (e) => {
  console.error('[Server] FATAL:', e.message);
  if (e.code === 'EADDRINUSE') {
    console.error('Port 8088 is already in use. Please close the other process.');
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('CRM Server running at http://localhost:' + PORT);
  console.log('  Static files: ' + STATIC_DIR);
  console.log('  DingTalk proxy: /api/dingtalk');
  console.log('  Node.js: ' + process.version);
  console.log('='.repeat(50));
  console.log('Keep this window open. Press Ctrl+C to stop.');
});
