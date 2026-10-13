// Spike S2 — Fase B: servidor web que puentea WebSocket <-> SSH PTY (el backend real de la terminal)
import http from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';

const dir = dirname(fileURLToPath(import.meta.url));
const ev = (...a) => {
  console.log('[s2b]', ...a);
  appendFileSync(join(dir, 's2-estado.jsonl'), JSON.stringify({ t: Date.now(), ev: a.join(' ') }) + '\n');
};

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(readFileSync(join(dir, 'index.html')));
  } else if (req.url === '/xterm.js') {
    res.setHeader('content-type', 'text/javascript');
    res.end(readFileSync(join(dir, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.js')));
  } else if (req.url === '/xterm.css') {
    res.setHeader('content-type', 'text/css');
    res.end(readFileSync(join(dir, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css')));
  } else {
    res.writeHead(404).end();
  }
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ev('ws-abierta');
  const conn = new Client();
  conn.on('ready', () => {
    conn.shell({ term: 'xterm-256color', cols: 100, rows: 30 }, (err, stream) => {
      if (err) { ev('ssh-error', err.message); ws.close(); return; }
      ev('ssh-pty-abierta');
      stream.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
      ws.on('message', (m) => stream.write(m.toString()));
      ws.on('close', () => { ev('ssh-cerrado'); try { stream.end(); } catch {} conn.end(); });
      ws.send('\r\n[S2] sesión lista\r\n');
    });
  });
  conn.on('error', (e) => { ev('ssh-error', e.message); try { ws.close(); } catch {} });
  conn.connect({
    host: '127.0.0.1', port: 2222, username: 'spike',
    privateKey: readFileSync(join(dir, 'spike-key')), readyTimeout: 8000,
  });
});

server.listen(8321, () => { ev('LISTO'); console.log('LISTO'); });
