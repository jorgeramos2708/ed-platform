// Spike S4 — Agente de IA con herramientas: plan/edición/diff/checkpoint/rewind + skills SKILL.md
// Pregunta (plan §6.1): ¿funcionan plan, edición, diff, checkpoint y rewind sobre un repo de prueba?
// ¿El motor carga packs de skills en formato SKILL.md? (criterio añadido en v1.2)
// Criterio de éxito: la IA modifica el repo y se puede revertir exactamente.
// El "LLM" es un guion determinista: este spike valida la MECÁNICA del harness,
// no la calidad del modelo. La comparación de motores reales es la decisión 18 (ADR-0002).
// Sin dependencias: usa node:child_process (git CLI) y os.tmpdir() para el repo de prueba.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const log = (...a) => console.log('[s4]', ...a);
const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const repo = join(tmpdir(), `edp-s4-repo-${Date.now()}`);
rmSync(repo, { recursive: true, force: true });
mkdirSync(repo, { recursive: true });
writeFileSync(join(repo, 'calculadora.js'), `function suma(a, b) { return a + b; }\nmodule.exports = { suma };\n`);
writeFileSync(join(repo, 'prueba.mjs'), `import { createRequire } from 'node:module';\nconst calc = createRequire(import.meta.url)('./calculadora.js');\nif (calc.suma(2, 3) !== 5) throw new Error('suma rota');\nif (typeof calc.resta === 'function' && calc.resta(5, 3) !== 2) throw new Error('resta rota');\nconsole.log('pruebas OK');\n`);
sh('git init -q -b main', repo);
sh('git config core.autocrlf false', repo); // hallazgo del spike: autocrlf rompe el rewind byte a byte
sh('git add -A && git commit -qm "inicial"', repo);
const hashInicial = sh('git rev-parse HEAD', repo).trim();
const contenidoInicial = readFileSync(join(repo, 'calculadora.js'), 'utf8');
log('repo de prueba:', repo, '| hash inicial:', hashInicial.slice(0, 8));

// --- Plan generado por el "LLM" (guion determinista) con bucle editar->prueba->corregir ---
const VERSION_ROTA = `function suma(a, b) { return a + b; }\nfunction resta(a, b) { return a - b - 1; } // bug intencionado del paso 1\nmodule.exports = { suma, resta };\n`;
const VERSION_OK = `function suma(a, b) { return a + b; }\nfunction resta(a, b) { return a - b; }\nmodule.exports = { suma, resta };\n`;
const PLAN = [
  { paso: 1, herramienta: 'editar', archivo: 'calculadora.js', detalle: 'agregar resta() con bug (TDD rojo)', contenido: VERSION_ROTA },
  { paso: 2, herramienta: 'prueba', detalle: 'node prueba.mjs — espera FALLO (rojo)', comando: 'node prueba.mjs', esperar: 'fallo' },
  { paso: 3, herramienta: 'editar', archivo: 'calculadora.js', detalle: 'corregir resta()', contenido: VERSION_OK },
  { paso: 4, herramienta: 'prueba', detalle: 'node prueba.mjs — espera ÉXITO (verde)', comando: 'node prueba.mjs', esperar: 'exito' },
];

// --- Ejecución del plan con checkpoint (commit) por paso ---
const diffPorPaso = [];
for (const paso of PLAN) {
  if (paso.herramienta === 'editar') {
    writeFileSync(join(repo, paso.archivo), paso.contenido);
  } else if (paso.herramienta === 'prueba') {
    let exito = true;
    try { sh(paso.comando, repo); } catch { exito = false; }
    const acierto = (paso.esperar === 'exito') === exito;
    if (!acierto) throw new Error(`paso ${paso.paso}: la prueba no se comportó como esperaba`);
    log(`paso ${paso.paso} (prueba): ${exito ? 'éxito' : 'fallo'} — como se esperaba`);
  }
  sh('git add -A', repo);
  sh(`git commit -q --allow-empty -m "checkpoint: paso ${paso.paso} (${paso.herramienta})"`, repo);
  const diff = sh('git diff HEAD~1 --unified=0', repo);
  diffPorPaso.push({ paso: paso.paso, lineasDiff: diff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length });
  log(`paso ${paso.paso} (${paso.herramienta}) — checkpoint hecho, diff de ${diffPorPaso.at(-1).lineasDiff} líneas`);
}

// --- Diff agregado como evidencia (lo que revisaría el usuario en la UI) ---
const diffTotal = sh('git diff ' + hashInicial + ' HEAD --unified=0', repo);
const agregoResta = diffTotal.includes('+function resta');
log('diff total inicial->HEAD contiene la función resta:', agregoResta ? 'SÍ' : 'NO');

// --- Rewind exacto: volver al commit inicial y verificar byte a byte ---
sh(`git reset --hard ${hashInicial}`, repo);
const contenidoTrasRewind = readFileSync(join(repo, 'calculadora.js'), 'utf8');
const rewindExacto = sha(contenidoTrasRewind) === sha(contenidoInicial) && sh('git rev-parse HEAD', repo).trim() === hashInicial;
log('rewind al estado inicial (hash de contenido + HEAD):', rewindExacto ? 'EXACTO' : 'DIFIERE');

// --- Carga de packs de skills (formato SKILL.md) con política de precedencia ---
const skillsDir = join(process.cwd(), 'skills');
function cargarSkills(dir) {
  // carpetas conocidas del spike (loader mínimo; el real usará readdir + glob)
  return ['saludo-tarjeta', 'invitacion-fiesta'].map(nombre => {
    const p = join(dir, nombre, 'SKILL.md');
    if (!existsSync(p)) return null;
    const texto = readFileSync(p, 'utf8');
    const fm = texto.split('---')[1] ?? '';
    const campo = (k) => (fm.match(new RegExp('^' + k + ':\\s*(.+)$', 'm')) || [])[1]?.trim();
    return { nombre: campo('name'), descripcion: campo('description'), prioridad: Number(campo('prioridad') ?? 1) };
  }).filter(Boolean);
}
function elegirSkill(skills, intencion) {
  const palabras = intencion.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const candidatas = skills.filter(s => palabras.some(w => s.descripcion.toLowerCase().includes(w)));
  candidatas.sort((a, b) => b.prioridad - a.prioridad);
  return { elegida: candidatas[0] ?? null, candidatas: candidatas.map(c => c.nombre) };
}
const skills = cargarSkills(skillsDir);
const r1 = elegirSkill(skills, 'quiero una tarjeta de saludo para ana');
log('skill elegida para "tarjeta de saludo":', r1.elegida?.nombre, '| candidatas:', r1.candidatas.join(','), '(precedencia por prioridad)');

// --- Veredicto ---
const habilidadesOk = skills.length === 2 && r1.elegida?.nombre === 'saludo-tarjeta' && r1.candidatas.length === 2;
const mecanicaOk = agregoResta && rewindExacto && diffPorPaso.length === 4;
log('S4-mecanica-agent (plan/editar/diff/checkpoint/rewind):', mecanicaOk ? 'PASA' : 'FALLA');
log('S4-carga-skills (SKILL.md + precedencia):', habilidadesOk ? 'PASA' : 'FALLA');
rmSync(repo, { recursive: true, force: true });
process.exit(mecanicaOk && habilidadesOk ? 0 : 1);
