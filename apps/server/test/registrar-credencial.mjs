// Registra la credencial SSH en el vault de la plataforma (JSON escaping nativo)
// Uso: node registrar-credencial.mjs <rutaClavePrivada> [nombre]
import { readFileSync } from 'node:fs';

const clavePrivada = readFileSync(process.argv[2], 'utf8');
const nombre = process.argv[3] ?? `ssh-fixture-${Date.now()}`;
const login = await fetch('http://127.0.0.1:3100/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@ed.test', password: 'ClaveSegura-1' }),
});
const { token } = await login.json();
const r = await fetch('http://127.0.0.1:3100/api/secretos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ nombre, valor: clavePrivada }),
});
const respuesta = await r.json();
console.log(respuesta.id ?? JSON.stringify(respuesta));
process.exit(respuesta.id ? 0 : 1);
