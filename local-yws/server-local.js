const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils.js');

const server = http.createServer();
const wss = new WebSocket.Server({ server });
wss.on('connection', (conn, req) => setupWSConnection(conn, req, { pingTimeout: 30000 }));

const HOST = '127.0.0.1';
const PORT = 1234;
server.listen(PORT, HOST, () => console.log(`y-websocket listening on ws://${HOST}:${PORT}`));
