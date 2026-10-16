// e2e del flujo M2 COMPLETO en la UI (con mock-ai desplegado como proveedor dev):
// registro → proyecto → workspace → instrucción → plan (mock) → aprobar → diff → aceptar
// Uso: node e2e/m2.mjs  (requiere el stack desplegado: edp-web 3101, edp-api 3100)
import { chromium } from 'playwright-core';

const email = `m2-${Date.now()}@ed.test`;
const log = (...a) => console.log('[m2]', ...a);
const browser = await chromium.launch({ channel: 'msedge', headless: true });

try {
  const page = await (await browser.newContext()).newPage();
  page.on('response', (r) => { if (r.url().includes('/api/')) log('HTTP', r.status(), r.url()); });
  page.on('console', (m) => { if (m.type() === 'error') log('CONSOLA:', m.text()); });
  await page.goto('http://localhost:3101/');
  await page.getByTestId('panel-acceso').waitFor({ timeout: 10000 });

  // 1. Crear cuenta + entrar
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.locator('#email').fill(email);
  await page.locator('#nombre').fill('Usuario M2');
  await page.locator('#password').fill('ClaveSegura-1');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.getByTestId('panel-proyectos').waitFor({ timeout: 10000 });
  log('acceso: PASA');

  // 2. Crear proyecto y entrar a su workspace
  await page.locator('#nombre-proyecto').fill('Proyecto M2');
  await page.getByRole('button', { name: 'Crear' }).click();
  await page.getByText('Proyecto M2').first().waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /abrir workspace/i }).first().click();
  await page.getByTestId('panel-workspace').waitFor({ timeout: 15000 });
  log('workspace creado y abierto: PASA');

  // 3. Instrucción para la IA → plan del mock-ai mostrado ANTES de ejecutar
  await page.locator('#instruccion-ia').fill('genera el archivo salida-ia.txt con un saludo');
  await page.getByRole('button', { name: 'Pedir plan' }).click();
  await page.getByTestId('panel-plan').waitFor({ timeout: 15000 });
  log('plan mostrado antes de ejecutar: PASA');

  // 4. Aprobar y ejecutar → diff con los cambios
  await page.getByRole('button', { name: /aprobar y ejecutar/i }).click();
  await page.getByTestId('panel-diff').waitFor({ timeout: 20000 });
  await page.getByText(/generado por mock-ai/).first().waitFor({ timeout: 5000 });
  log('ejecutado y diff visible: PASA');

  // 5. Aceptar (checkpoint final ya commiteado en el server) - tras recargar volvemos a la lista
  await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
  await page.reload();
  await page.getByTestId('panel-proyectos').waitFor({ timeout: 10000 });
  await page.getByText('Proyecto M2').first().waitFor({ timeout: 5000 });
  log('aceptado - plataforma persistida tras recargar: PASA');

  await browser.close();
  log('M2-UI-E2E: PASA');
  process.exit(0);
} catch (e) {
  log('FALLO:', e.message);
  await browser.close();
  process.exit(1);
}
