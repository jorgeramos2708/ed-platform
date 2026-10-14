// e2e de UI con navegador real (Edge del sistema): registro → proyectos → crear → visible
// Corre contra el stack desplegado (web 3101 + api 3100). Uso: node e2e/ui.mjs
import { chromium } from 'playwright-core';

const email = `ui-${Date.now()}@ed.test`;
const log = (...a) => console.log('[ui]', ...a);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await (await browser.newContext()).newPage();
  await page.goto('http://localhost:3101/');
  await page.getByTestId('panel-acceso').waitFor({ timeout: 10000 });

  // Crear cuenta
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.locator('#email').fill(email);
  await page.locator('#nombre').fill('Usuario UI');
  await page.locator('#password').fill('ClaveSegura-1');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // Panel de proyectos visible
  await page.getByTestId('panel-proyectos').waitFor({ timeout: 10000 });
  log('login tras registro: PASA');

  // Crear proyecto
  await page.locator('#nombre-proyecto').fill('Proyecto Desde La UI');
  await page.getByRole('button', { name: 'Crear' }).click();
  await page.getByText('Proyecto Desde La UI').waitFor({ timeout: 5000 });
  log('crear proyecto desde la UI: PASA');

  // Persistencia en el listado (recarga)
  await page.reload();
  await page.getByTestId('panel-proyectos').waitFor({ timeout: 10000 });
  await page.getByText('Proyecto Desde La UI').waitFor({ timeout: 5000 });
  log('proyecto persiste tras recargar: PASA');

  await browser.close();
  log('UI-E2E: PASA');
  process.exit(0);
} catch (e) {
  log('FALLO:', e.message);
  await browser.close();
  process.exit(1);
}
