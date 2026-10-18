// Prueba aislada: shell PTY con ssh2 puro contra el sshd manual (puerto 2299) — como el spike S2
import { Client } from 'ssh2';
import { readFileSync } from 'node:fs';

const rutaClave = process.argv[2];
const conn = new Client();
conn
  .on('ready', () => {
    console.log('SSH ready');
    conn.shell({ term: 'xterm-256color' }, (err, stream) => {
      if (err) {
        console.log('shell err:', err.message);
        process.exit(1);
      }
      let salida = '';
      stream.on('data', (d) => {
        salida += d.toString('utf8');
        console.log('OUT:', JSON.stringify(d.toString('utf8').slice(0, 80)));
        if (salida.includes('marcador-ok')) {
          console.log('MARCADOR RECIBIDO — la PTY funciona');
          process.exit(0);
        }
      });
      stream.stderr.on('data', (d) => console.log('ERR:', d.toString()));
      setTimeout(() => stream.write('echo marcador-ok\r\n'), 1000);
      setTimeout(() => stream.write('\r\n'), 2500);
    });
  })
  .on('error', (e) => {
    console.log('connect err:', e.message);
    process.exit(1);
  })
  .connect({
    host: '127.0.0.1',
    port: 2299,
    username: 'spike',
    privateKey: readFileSync(rutaClave),
    readyTimeout: 15000,
  });
setTimeout(() => {
  console.log('TIMEOUT GLOBAL');
  process.exit(1);
}, 30000);
