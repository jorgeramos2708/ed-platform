// Spike S6 — Almacén de secretos: cifrado por capas (envelope encryption)
// Pregunta (plan §6.1): ¿cifrado por capas con clave maestra fuera de la BD es viable?
// Criterio de éxito: un volcado de la base de datos no revela ningún secreto.
// Diseño:
//   1. Clave maestra (32 B) en archivo FUERA de la BD (TEMP), nunca en el repo.
//   2. Por cada secreto: DEK aleatoria -> secreto cifrado con DEK (AES-256-GCM).
//   3. DEK cifrada con la clave maestra (AES-256-GCM) -> guardada junto al secreto.
//   4. Round-trip: unwrapping de DEK + descifrado == original.
//   5. pg_dump de la tabla -> grep de fragmentos en claro -> 0 coincidencias esperadas.
import { Client } from 'pg';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CS = process.env.PG_CS || 'postgres://spike:spike@localhost:55432/spike';
const KEY_PATH = process.env.MASTER_KEY_PATH || join(process.env.TEMP || '/tmp', 'edp-s6-master.key');
const AES = 'aes-256-gcm';

const log = (...a) => console.log('[s6]', ...a);
const enc = (key, plain) => {
  const iv = randomBytes(12);
  const c = createCipheriv(AES, key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { ct, iv, tag: c.getAuthTag() };
};
const dec = (key, { ct, iv, tag }) => {
  const d = createDecipheriv(AES, key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]); // Buffer: los valores binarios (DEK) no son UTF-8
};

// 1. Clave maestra fuera de la BD (archivo local, fuera del repo)
if (!existsSync(KEY_PATH)) writeFileSync(KEY_PATH, randomBytes(32).toString('hex'), { mode: 0o600 });
const master = Buffer.from(readFileSync(KEY_PATH, 'utf8'), 'hex');
log('clave maestra cargada desde', KEY_PATH, '(fuera de la BD y del repo)');

const secretos = {
  API_KEY_PROVEEDOR: 'sk-live-1234567890abcdef',
  SSH_PASS_SERVIDOR: 'SuPerSecreto-2026',
  GITHUB_TOKEN: 'ghp_XXxxXXxxXXxxXXxxXX1234',
};

const client = new Client({ connectionString: CS });
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS secretos (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  enc_dek bytea NOT NULL,
  dek_iv bytea NOT NULL,
  dek_tag bytea NOT NULL,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  tag bytea NOT NULL
)`);
await client.query('TRUNCATE secretos RESTART IDENTITY');

// 2-3. Insertar cifrando por capas
for (const [nombre, valor] of Object.entries(secretos)) {
  const dek = randomBytes(32);      // clave de datos única por secreto
  const w = enc(master, dek);       // DEK envuelta con la maestra
  const s = enc(dek, valor);        // secreto cifrado con la DEK
  await client.query(
    'INSERT INTO secretos (nombre, enc_dek, dek_iv, dek_tag, ciphertext, iv, tag) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [nombre, w.ct, w.iv, w.tag, s.ct, s.iv, s.tag]
  );
}
log('secretos insertados (solo ciphertext + DEK envuelta):', Object.keys(secretos).length);

// 4. Round-trip: la clave maestra basta para recuperar todos los valores
const rows = (await client.query('SELECT * FROM secretos ORDER BY id')).rows;
for (const r of rows) {
  const dek = dec(master, { ct: r.enc_dek, iv: r.dek_iv, tag: r.dek_tag });
  const valor = dec(dek, { ct: r.ciphertext, iv: r.iv, tag: r.tag }).toString('utf8');
  if (valor !== secretos[r.nombre]) throw new Error('round-trip falló en ' + r.nombre);
  log('round-trip OK:', r.nombre);
}
console.log('[s6] S6-cifrado-descifrado: PASA');
await client.end();
