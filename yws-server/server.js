/* eslint-disable */
// Minimal y-websocket server with Redis persistence
// Works on AWS (ECS/EC2) and GCP (Cloud Run). Use Dockerfile in this directory.

require('dotenv').config();

const http = require('http');
const WebSocket = require('ws');

// y-websocket server utilities (robust import across versions)
let setupWSConnection, setPersistence;
const tryRequire = (p) => {
  try { return require(p); } catch (_) { return null; }
};
const candidates = [
  'y-websocket/bin/utils.cjs',
  'y-websocket/bin/utils.js',
  'y-websocket/dist/utils.cjs',
  'y-websocket/dist/utils.js',
  'y-websocket/utils',
];
for (const mod of candidates) {
  const m = tryRequire(mod);
  if (m && m.setupWSConnection) {
    setupWSConnection = m.setupWSConnection;
    setPersistence = m.setPersistence || (() => {});
    console.log(`[yws] loaded utils from ${mod}`);
    break;
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
    const redisOpts = process.env.REDIS_URL
      ? { url: process.env.REDIS_URL }
      : { host: redisHost, port: redisPort };
    const redisPersistence = new RedisPersistence(redisOpts);
    setPersistence(redisPersistence);
    redisReady = true;
    console.log('[yws] Redis persistence enabled', redisOpts);
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


