/* eslint-disable */
// Minimal y-websocket server with Redis persistence
// Works on AWS (ECS/EC2) and GCP (Cloud Run). Use Dockerfile in this directory.

require('dotenv').config();

const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

// y-websocket server utilities (robust import across versions)
let setupWSConnection, setPersistence;

// Prefer absolute path resolution inside the installed package to bypass exports restrictions
const pkgJsonPath = (() => { try { return require.resolve('y-websocket/package.json'); } catch { return null; } })();
if (pkgJsonPath) {
  const baseDir = path.dirname(pkgJsonPath);
  const relCandidates = [
    'bin/utils.cjs',
    'bin/utils.js',
    'dist/utils.cjs',
    'dist/utils.js',
    'utils.cjs',
    'utils.js',
  ];
  for (const rel of relCandidates) {
    const abs = path.join(baseDir, rel);
    try {
      if (fs.existsSync(abs)) {
        const m = require(abs);
        if (m && m.setupWSConnection) {
          setupWSConnection = m.setupWSConnection;
          setPersistence = m.setPersistence || (() => {});
          console.log(`[yws] loaded utils from ${abs}`);
          break;
        }
      }
    } catch (_) {}
  }
}

// Fallback to legacy deep-imports (may be blocked by exports)
if (!setupWSConnection) {
  const tryRequire = (p) => { try { return require(p); } catch { return null; } };
  const legacyCandidates = [
    'y-websocket/dist/utils.cjs',
    'y-websocket/bin/utils.cjs',
    'y-websocket/bin/utils.js',
  ];
  for (const mod of legacyCandidates) {
    const m = tryRequire(mod);
    if (m && m.setupWSConnection) {
      setupWSConnection = m.setupWSConnection;
      setPersistence = m.setPersistence || (() => {});
      console.log(`[yws] loaded utils from ${mod}`);
      break;
    }
  }
}
if (!setupWSConnection) {
  console.error('[yws] Failed to load y-websocket utils. Check y-websocket version.');
  process.exit(1);
}

// Redis persistence (for late-joiner fast restore + multi-instance sharing)
// Enable ONLY when REDIS_URL or REDIS_HOST is explicitly provided.
let redisReady = false;
const hasRedisEnv = !!(process.env.REDIS_URL || process.env.REDIS_HOST);
if (hasRedisEnv) {
  try {
    // Lazy require so npm install works without y-redis
    const { RedisPersistence } = require('y-redis');
    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisUser = process.env.REDIS_USERNAME || process.env.REDIS_USER;
    const redisPass = process.env.REDIS_PASSWORD || process.env.REDIS_PASS;
    const redisTls = String(process.env.REDIS_TLS || '').toLowerCase();
    const useTls = redisTls === '1' || redisTls === 'true' || redisTls === 'yes';
    const redisOpts = process.env.REDIS_URL
      ? process.env.REDIS_URL // pass URL string directly for ioredis
      : (() => {
          const o = { host: redisHost, port: redisPort };
          if (redisUser) o.username = redisUser;
          if (redisPass) o.password = redisPass;
          if (useTls) o.tls = {};
          return o;
        })();
    const redisPersistence = new RedisPersistence({ redisOpts });
    setPersistence(redisPersistence);
    redisReady = true;
    const logOpts = typeof redisOpts === 'string' ? { url: redisOpts } : { host: redisOpts.host, port: redisOpts.port, username: redisOpts.username, tls: !!redisOpts.tls };
    console.log('[yws] Redis persistence enabled', logOpts);
  } catch (e) {
    console.warn('[yws] Redis persistence requested but not enabled:', e?.message || e);
  }
} else {
  console.log('[yws] Redis not configured. Running in-memory only.');
}

const PORT = parseInt(process.env.PORT || '1234', 10);

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`y-websocket server (redis=${redisReady ? 'on' : 'off'})`);
});

const wss = new WebSocket.Server({ server });
wss.on('connection', (conn, req) => {
  // pingTimeout keeps connections alive and cleans up stale peers
  setupWSConnection(conn, req, { pingTimeout: 30_000 });
});

server.listen(PORT, () => {
  console.log(`[yws] listening on :${PORT}`);
});


