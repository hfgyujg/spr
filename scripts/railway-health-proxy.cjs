const http = require('node:http');
const { spawn } = require('node:child_process');

const publicPort = Number(process.env.PORT || 8080);
const appPort = 3001;
const app = spawn(process.execPath, ['dist/server.cjs'], {
  env: { ...process.env, PORT: String(appPort) },
  stdio: 'inherit'
});

app.on('exit', (code, signal) => {
  if (code !== 0 && signal == null) {
    console.error(`[Railway proxy] application exited with code ${code}`);
  }
});

const server = http.createServer((req, res) => {
  // Railway deploy healthchecks are HTTP-only. Keep the application's
  // production HTTPS redirect intact while providing a local liveness probe.
  if (req.url === '/health' || req.url === '/health/live') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    });
    res.end(JSON.stringify({ status: 'ok', service: 'SPR', proxy: 'railway-health' }));
    return;
  }

  const headers = { ...req.headers };
  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = 'http';
  }
  headers.host = `127.0.0.1:${appPort}`;

  const upstream = http.request({
    hostname: '127.0.0.1',
    port: appPort,
    method: req.method,
    path: req.url,
    headers
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    console.error('[Railway proxy] upstream error:', error.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upstream unavailable' }));
  });

  req.pipe(upstream);
});

const shutdown = () => {
  server.close(() => {
    if (!app.killed) app.kill('SIGTERM');
  });
  setTimeout(() => {
    if (!app.killed) app.kill('SIGKILL');
    process.exit(0);
  }, 5000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(publicPort, '0.0.0.0', () => {
  console.log(`[Railway proxy] listening on 0.0.0.0:${publicPort}; app on 127.0.0.1:${appPort}`);
});
