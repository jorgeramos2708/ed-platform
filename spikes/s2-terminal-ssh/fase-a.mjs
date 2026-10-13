// Spike S2 — Fase A: backend SSH con PTY en tiempo real (lo que hará el server de la terminal web)
// Pregunta (plan §6.1): ¿xterm.js con un backend SSH da una experiencia estable?
// Criterio: sesión interactiva con salida EN TIEMPO REAL (no bufferizada al final),
// cierre limpio y reconexión controlada.
// Esta fase valida el backend con ssh2 contra sshd en Docker; la fase B añade xterm.js + navegador.
import { Client } from 'ssh2';
import { readFileSync } from 'node:fs';

const cfg = {
  host: '127.0.0.1',
  port: 2222,
  username: 'spike',
  privateKey: readFileSync(new URL('./spike-key', import.meta.url)),
  readyTimeout: 10000,
};
const log = (...a) => console.log('[s2a]', ...a);
const t0 = Date.now();
const t = () => Date.now() - t0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log('[s2a] WATCHDOG: 30 s sin terminar — abortando'); process.exit(3); }, 30000);

function conectar() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('error', reject);
    conn.on('ready', () => resolve(conn));
    conn.connect(cfg);
  });
}

function abrirShell(conn) {
  return new Promise((resolve, reject) => {
    conn.shell({ term: 'xterm-256color', cols: 100, rows: 30 }, (err, stream) =>
      err ? reject(err) : resolve(stream));
  });
}

// 1) Sesión con PTY y medición de tiempo real: dos ecos separados por sleep 1
const conn = await conectar();
log('conectado en', t(), 'ms');
const stream = await abrirShell(conn);

const marcas = { inicio: null, fin: null };
let buffer = '';
stream.on('data', (chunk) => {
  buffer += chunk.toString();
  if (marcas.inicio === null && buffer.includes('INICIO-MARCADOR')) {
    marcas.inicio = t();
    log('primer marcador recibido en', marcas.inicio, 'ms (en tiempo real si < 1000)');
  }
  if (marcas.fin === null && buffer.includes('FIN-MARCADOR')) {
    marcas.fin = t();
    log('segundo marcador recibido en', marcas.fin, 'ms (esperado ~+1000 ms del primero)');
  }
});
await sleep(300); // prompt listo
buffer = '';
// Marcadores construidos por el shell: el ECO del PTY muestra el texto sin expandir
// (INICIO-$(echo MARCADOR)), así que solo la SALIDA REAL contiene los literales.
stream.write('echo INICIO-$(echo MARCADOR); sleep 1; echo FIN-$(echo MARCADOR); exit\n');

await new Promise((resolve) => {
  const espera = setInterval(() => {
    if (marcas.fin !== null) { clearInterval(espera); setTimeout(resolve, 200); }
  }, 50);
  setTimeout(() => { clearInterval(espera); resolve(); }, 8000);
});

const tiempoReal = marcas.inicio !== null && marcas.inicio < 1000;
const separacion = marcas.fin !== null && marcas.inicio !== null && (marcas.fin - marcas.inicio) >= 900;
log('S2a-tiempo-real:', tiempoReal ? 'PASA' : 'FALLA', '| S2a-streaming-no-bufferizado:', separacion ? 'PASA' : 'FALLA');

// 2) Cierre limpio
const cierre = await new Promise((resolve) => {
  const to = setTimeout(() => resolve('timeout'), 3000);
  conn.once('close', () => { clearTimeout(to); resolve('limpio'); });
  conn.end();
});
log('cierre de conexión:', cierre, '->', cierre === 'limpio' ? 'PASA' : 'FALLA');

// 3) Reconexión controlada: nueva conexión + exec directo
const conn2 = await conectar();
log('reconexión OK en', t(), 'ms');
const estadoRecon = await new Promise((resolve, reject) => {
  conn2.exec('echo RECONEXION-OK && hostname', (err, s) => {
    if (err) return reject(err);
    let out = '';
    s.on('data', (c) => { out += c.toString(); });
    s.on('close', (code) => resolve({ code, out }));
  });
});
log('exec tras reconexión:', JSON.stringify(estadoRecon.out.trim()));
conn2.end();
const reconOk = estadoRecon.out.includes('RECONEXION-OK') && estadoRecon.code === 0;
log('S2a-reconexion:', reconOk ? 'PASA' : 'FALLA');

const ok = tiempoReal && separacion && cierre === 'limpio' && reconOk;
log('S2-FASE-A:', ok ? 'PASA' : 'FALLA');
process.exit(ok ? 0 : 1);
