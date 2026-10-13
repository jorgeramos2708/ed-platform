// Spike S3 — Trabajos persistentes con pg-boss v12 (PostgreSQL)
// Pregunta (plan §6.1): ¿la cola sobrevive a reinicios y permite cancelar?
// Criterio de éxito: un trabajo en curso se recupera o falla de forma coherente tras reiniciar.
// Fases: setup | crash | resume   (crash simula caída del worker con un job activo;
// resume arranca un proceso nuevo, espera la re-entrega tras expirar el lock y
// además prueba la cancelación de un job pendiente.)
// Nota v12: modelo queue-first — send() devuelve null si la cola no existe (hallazgo del spike).
import Boss from 'pg-boss';
import { writeFileSync, readFileSync } from 'node:fs';

const CS = process.env.PG_CS || 'postgres://spike:spike@localhost:55432/spike';
const fase = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start() {
  const boss = new Boss({
    connectionString: CS,
    maintenanceIntervalSeconds: 2, // expirar/redispatch rápido para el spike
  });
  boss.on('error', (e) => console.log('[s3] BOSS-ERROR:', e.message));
  await boss.start();
  for (const q of ['tarea-larga', 'tarea-corta']) {
    try { await boss.createQueue(q); } catch { /* ya existe */ }
  }
  return boss;
}

if (fase === 'setup') {
  await start();
  console.log('[s3] esquema y colas creados OK');
  process.exit(0);
}

if (fase === 'crash') {
  const boss = await start();
  const jobId = await boss.send('tarea-larga', { paso: 'crash' }, {
    expireInSeconds: 2, // el lock expira en 2 s -> re-entregable tras un crash
    retryLimit: 5,
    retryDelay: 1,
  });
  if (!jobId) throw new Error('send() devolvió null (cola inexistente)');
  writeFileSync(new URL('./job-id.txt', import.meta.url), String(jobId));
  console.log('[s3] job encolado:', jobId);
  await boss.work('tarea-larga', { batchSize: 1, pollingIntervalSeconds: 1, includeMetadata: true }, async (jobs) => {
    for (const j of jobs) {
      console.log('[s3] worker: job INICIADO (retryCount =', j.retryCount, ')');
      await sleep(1500); // trabajo en curso...
      console.log('[s3] worker: SIMULANDO CRASH con job activo (process.exit(1))');
      process.exit(1);   // caída del proceso: el job queda huérfano en 'active'
    }
  });
  await sleep(15000); // no debe llegar aquí
  process.exit(0);
}

if (fase === 'resume') {
  const jobId = readFileSync(new URL('./job-id.txt', import.meta.url), 'utf8').trim();
  const boss = await start();
  let completado = null;
  await boss.work('tarea-larga', { batchSize: 1, pollingIntervalSeconds: 1, includeMetadata: true }, async (jobs) => {
    for (const j of jobs) {
      console.log('[s3] worker NUEVO PROCESO: job re-entregado (retryCount =', j.retryCount, ')');
      await sleep(300); // completar
      completado = j;
    }
  });
  for (let i = 0; i < 30 && !completado; i++) await sleep(1000);
  const job = await boss.getJobById('tarea-larga', jobId);
  console.log('[s3] estado final:', job.state, '| retryCount:', job.retryCount);
  const recupera = job.state === 'completed' && job.retryCount >= 1;
  console.log('[s3] S3-recuperacion-tras-reinicio:', recupera ? 'PASA' : 'FALLA');

  // Cancelación de un job pendiente (startAfter en el futuro -> nunca se ejecuta)
  const cId = await boss.send('tarea-corta', { paso: 'cancel' }, { startAfter: 3600 });
  await boss.cancel('tarea-corta', cId, { reason: 'spike: cancelacion manual' });
  const cj = await boss.getJobById('tarea-corta', cId);
  console.log('[s3] estado tras cancel:', cj.state);
  const cancela = cj.state === 'cancelled';
  console.log('[s3] S3-cancelacion:', cancela ? 'PASA' : 'FALLA');
  process.exit(recupera && cancela ? 0 : 1);
}

console.error('fase desconocida:', fase, '— usa setup | crash | resume');
process.exit(2);
