import { chromium } from 'playwright-core';

const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.goto('http://localhost:3101/');
await p.getByTestId('panel-acceso').waitFor({ timeout: 10000 });
await p.getByRole('tab', { name: 'Crear cuenta' }).click();
await p.locator('#email').fill(`lista-${Date.now()}@ed.test`);
await p.locator('#nombre').fill('Lista');
await p.locator('#password').fill('ClaveSegura-1');
await p.getByRole('button', { name: 'Crear cuenta' }).click();
await p.getByTestId('panel-proyectos').waitFor({ timeout: 10000 });
await p.locator('#nombre-proyecto').fill('Mi Proyecto Real');
await p.getByRole('button', { name: 'Crear' }).click();
await p.getByText('Mi Proyecto Real').waitFor({ timeout: 5000 });
await p.screenshot({ path: 'apps/web/e2e/capturas/lista-proyectos.png' });
await b.close();
console.log('captura lista ok');
