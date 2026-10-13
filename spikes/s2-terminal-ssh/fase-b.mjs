// Spike S2 — Fase B: navegador real (Edge/Chromium) + xterm.js contra el puente WS->SSH
// Verifica: sesión interactiva en tiempo real, cierre limpio reflejado en el backend y reconexión.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = process.cwd();
const estado = join(cwd, 's2-estado.jsonl');
rmSync(estado, { force: true });
const log = (...a) => console.log('[s2b]', ...a);

const server = spawn(process.execPath, [join(cwd, 'server.mjs')], { stdio: 'inherit' });
setTimeout(() => { console.log('[s2b] WATCHDOG: 45 s — abortando'); process.exit(3); }, 45000);

try {
  let listo = false;
  for (let i = 0; i < 40 && !listo; i++) {
    await delay(250);
    listo = existsSync(estado) && readFileSync(estado, 'utf8').includes('LISTO');
  }
  if (!listo) throw new Error('server no arrancó');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const textoTerminal = (p) => p.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');

  // 1) Sesión interactiva en tiempo real
  const page = await (await browser.newContext()).newPage();
  await page.goto('http://localhost:8321/');
  await page.waitForFunction(() => document.title === 'TERMINAL-LISTO', null, { timeout: 10000 });
  await page.locator('.xterm-helper-textarea').focus(); // keyboard.type necesita el foco del helper de xterm
  await delay(700); // prompt
  await page.keyboard.type('echo HOLA-S2$(echo X)\r');
  let visible = false;
  try {
    await page.waitForFunction(
      () => (document.querySelector('.xterm-rows')?.innerText || '').includes('HOLA-S2X'),
      null, { timeout: 5000 }
    );
    visible = true;
  } catch {
    log('DEBUG innerText:', JSON.stringify(await page.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '(vacío)')));
    log('DEBUG __eco:', JSON.stringify(await page.evaluate(() => window.__eco || '(vacío)')));
  }
  if (!visible) throw new Error('la salida no se renderizó en xterm');
  log('interactiva en tiempo real (tecleado -> eco -> salida renderizada en xterm):', 'PASA');

  // 2) Cierre limpio: cerrar la página debe cerrar la sesión SSH en el backend
  await page.close();
  let cerrado = false;
  for (let i = 0; i < 20 && !cerrado; i++) {
    await delay(250);
    cerrado = readFileSync(estado, 'utf8').includes('ssh-cerrado');
  }
  log('cierre limpio reflejado en el backend (ssh-cerrado):', cerrado ? 'PASA' : 'FALLA');

  // 3) Reconexión controlada: nueva página = nueva sesión operativa
  const page2 = await (await browser.newContext()).newPage();
  await page2.goto('http://localhost:8321/');
  await page2.waitForFunction(() => document.title === 'TERMINAL-LISTO', null, { timeout: 10000 });
  await page2.locator('.xterm-helper-textarea').focus();
  await delay(700);
  await page2.keyboard.type('echo RECON-$(echo OK)\r');
  await page2.waitForFunction(
    () => (document.querySelector('.xterm-rows')?.innerText || '').includes('RECON-OK'),
    null, { timeout: 5000 }
  );
  log('reconexión controlada con nueva sesión:', 'PASA');
  log('texto visible al final:', JSON.stringify((await textoTerminal(page2)).split('\n').slice(-4).join(' | ')));

  await browser.close();
  log('S2-FASE-B:', cerrado ? 'PASA' : 'FALLA');
  process.exit(cerrado ? 0 : 1);
} catch (e) {
  log('FALLO:', e.message);
  process.exit(1);
} finally {
  server.kill();
}
