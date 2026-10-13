// Spike S5 — Continuidad de IA: failover de proveedor a mitad de tarea
// Pregunta (plan §6.1): ¿se puede cambiar de proveedor a mitad de una tarea sin perder estado?
// Criterio de éxito: al simular error de cuota, la tarea continúa desde el último checkpoint
// con el resumen de estado (la simulación del error de cuota está prescrita por el plan).
// Escenarios:
//   failover  — un proceso: A hace pasos 1-2, se agota la cuota en el 3 -> B continúa con resumen
//   precrash  — A hace pasos 1-2 (checkpoints) y el proceso MUERE antes del paso 3
//   resume    — proceso nuevo: reanuda desde checkpoint, A falla por cuota -> B termina
//               (el log de ejecución persistido prueba que ningún paso se ejecuta dos veces)
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const escenario = process.argv[2];
const sleepless = undefined;
const log = (...a) => console.log('[s5]', ...a);

class QuotaError extends Error {
  constructor(proveedor) { super('cuota agotada'); this.name = 'QuotaError'; this.proveedor = proveedor; }
}

const PASOS = [
  { n: 1, accion: 'saludo', texto: 'hola del paso 1' },
  { n: 2, accion: 'cuerpo', texto: 'trabajo del paso 2' },
  { n: 3, accion: 'despedida', texto: 'fin del paso 3' },
];

// Proveedores simulados: A se queda sin cuota justo antes del paso 3 (determinista)
function proveedor(nombre) {
  return {
    nombre,
    async ejecutar(paso, ws) {
      if (nombre === 'proveedor-A' && paso.n >= 3) throw new QuotaError(nombre);
      appendFileSync(join(ws, 'salida.txt'), paso.texto + '\n');
      appendFileSync(join(ws, 'log-ejecucion.jsonl'), JSON.stringify({ paso: paso.n, proveedor: nombre }) + '\n');
      return `paso ${paso.n} hecho por ${nombre}`;
    },
  };
}
const PROVEEDORES = [proveedor('proveedor-A'), proveedor('proveedor-B')];

function checkpointPath(ws) { return join(ws, 'checkpoint.json'); }
function leerCheckpoint(ws) {
  return existsSync(checkpointPath(ws))
    ? JSON.parse(readFileSync(checkpointPath(ws), 'utf8'))
    : { pasoCompletado: 0, proveedor: 'proveedor-A', resumen: 'tarea nueva' };
}
function guardarCheckpoint(ws, cp) { writeFileSync(checkpointPath(ws), JSON.stringify(cp, null, 2)); }

async function ejecutarDesde(ws) {
  const cp = leerCheckpoint(ws);
  log('checkpoint inicial:', JSON.stringify(cp));
  let idx = Math.max(0, PROVEEDORES.findIndex(p => p.nombre === cp.proveedor));
  for (const paso of PASOS) {
    if (paso.n <= cp.pasoCompletado) { log(`paso ${paso.n}: ya completado (no re-ejecutar)`); continue; }
    let hecho = false;
    while (!hecho) {
      const p = PROVEEDORES[idx];
      try {
        log(await p.ejecutar(paso, ws));
        hecho = true;
      } catch (e) {
        if (e.name !== 'QuotaError') throw e;
        log(`${e.proveedor}: ${e.message} al iniciar el paso ${paso.n} -> failover al siguiente proveedor`);
        idx = Math.min(idx + 1, PROVEEDORES.length - 1);
        guardarCheckpoint(ws, {
          tareaId: 's5', pasoCompletado: paso.n - 1, proveedor: PROVEEDORES[idx].nombre,
          resumen: `pasos 1-${paso.n - 1} completados en salida.txt; pendiente el paso ${paso.n} (${paso.accion}); no repetir los previos`,
        });
        log('resumen de estado escrito para el proveedor entrante');
      }
    }
    guardarCheckpoint(ws, { tareaId: 's5', pasoCompletado: paso.n, proveedor: PROVEEDORES[idx].nombre, resumen: `hasta el paso ${paso.n}` });
  }
}

function verificar(ws, esperadoProveedores) {
  const salida = readFileSync(join(ws, 'salida.txt'), 'utf8').trim().split('\n');
  const logEj = readFileSync(join(ws, 'log-ejecucion.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const completa = salida.join('|') === PASOS.map(p => p.texto).join('|');
  const sinDuplicados = logEj.length === 3 && new Set(logEj.map(x => x.paso)).size === 3;
  const proveedoresOk = esperadoProveedores.every(([paso, prov]) =>
    logEj.filter(x => x.paso === paso && x.proveedor === prov).length === 1);
  log('salida completa y en orden:', completa ? 'PASA' : 'FALLA');
  log('sin trabajo duplicado (3 ejecuciones / 3 pasos):', sinDuplicados ? 'PASA' : 'FALLA');
  log('asignacion de proveedores correcta:', proveedoresOk ? 'PASA' : 'FALLA', JSON.stringify(logEj));
  const cp = JSON.parse(readFileSync(checkpointPath(ws), 'utf8'));
  log('checkpoint final:', JSON.stringify(cp));
  const ok = completa && sinDuplicados && proveedoresOk;
  log('S5-continuidad-failover:', ok ? 'PASA' : 'FALLA');
  return ok;
}

const WS = join(process.cwd(), escenario === 'failover' ? 'workspace-failover' : 'workspace-restart');

if (escenario === 'failover') {
  rmSync(WS, { recursive: true, force: true }); mkdirSync(WS, { recursive: true });
  const ok = await (async () => { await ejecutarDesde(WS); return verificar(WS, [[1, 'proveedor-A'], [2, 'proveedor-A'], [3, 'proveedor-B']]); })();
  process.exit(ok ? 0 : 1);
}

if (escenario === 'precrash') {
  rmSync(WS, { recursive: true, force: true }); mkdirSync(WS, { recursive: true });
  const cp = leerCheckpoint(WS);
  for (const paso of PASOS) {
    if (paso.n >= 3) { log('SIMULANDO CRASH del proceso antes del paso 3 (exit 1)'); process.exit(1); }
    log(await PROVEEDORES[0].ejecutar(paso, WS));
    guardarCheckpoint(WS, { tareaId: 's5', pasoCompletado: paso.n, proveedor: 'proveedor-A', resumen: `hasta el paso ${paso.n}` });
  }
  process.exit(0);
}

if (escenario === 'resume') {
  const ok = await (async () => { await ejecutarDesde(WS); return verificar(WS, [[1, 'proveedor-A'], [2, 'proveedor-A'], [3, 'proveedor-B']]); })();
  process.exit(ok ? 0 : 1);
}

console.error('fase desconocida:', escenario, '— usa failover | precrash | resume');
process.exit(2);
