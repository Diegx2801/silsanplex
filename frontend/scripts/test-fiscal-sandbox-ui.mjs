import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
// UI con fixtures ficticios: no es una prueba de integración PostgreSQL.
// No carga .env, no inicia Supabase y no instala navegadores o dependencias.
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'silsanplex-fiscal-ui-'));
fs.writeFileSync(path.join(temporary, 'entry.tsx'), `import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter,Routes,Route} from 'react-router';
import {AuthContext} from '@/features/auth/AuthContext';
import {ProtectedRoute,PermissionRoute} from '@/features/auth/ProtectedRoute';
import {AppLayout} from '@/components/layout/AppLayout';
import {ComprobanteSandboxPage} from '@/app/paginas/ComprobanteSandboxPage';
import '@/index.css';
const user={id:'44444444-4444-4444-8444-444444444444',email:'fixture@example.invalid'};
const auth={user,session:{user},access:{organizationId:'11111111-1111-4111-8111-111111111111',organizationName:'Organización ficticia',roles:['PRUEBA'],permissions:['BILLING_VIEW']},isAdmin:false,isLoading:false,sessionError:null,accessError:null,hasPermission:(p:string)=>p==='BILLING_VIEW',signOut:async()=>{},reintentarAcceso:()=>{}};
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><AuthContext.Provider value={auth as any}><MemoryRouter initialEntries={['/facturacion-sandbox']}><Routes><Route element={<ProtectedRoute><AppLayout/></ProtectedRoute>}><Route path='/facturacion-sandbox' element={<PermissionRoute permission='BILLING_VIEW'><ComprobanteSandboxPage/></PermissionRoute>}/></Route></Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>);
`);
const require = createRequire(path.join(frontend, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const { chromium, expect } = require('@playwright/test');
const { crearComprobanteSandbox } = await import(pathToFileURL(path.join(frontend, 'src/modulos/facturacion/__fixtures__/comprobanteSandbox.ts')).href);
const server = await createServer({ plugins: [{ name: 'isolated-fiscal-fixture', configureServer(s) { s.middlewares.use('/__fiscal_ui_fixture', async (req, res, next) => { try {
                const html = await s.transformIndexHtml('/__fiscal_ui_fixture', '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/' + path.join(temporary, 'entry.tsx').replaceAll('\\', '/') + '"></script></body></html>');
                res.setHeader('Content-Type', 'text/html');
                res.end(html);
            }
            catch (e) {
                next(e);
            } }); } }], root: frontend, envDir: false, define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:1'), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_fixture_sin_acceso') }, resolve: { dedupe: ['react', 'react-dom', 'react-router', '@tanstack/react-query'] }, server: { host: '127.0.0.1', port: 5185, strictPort: true, fs: { allow: [frontend, temporary] } } });
let browser;
const results = [];
const blocked = [];
const requests = [];
const errors = [];
try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    for (const [name, viewport, frozen] of [['desktop-1280', { width: 1280, height: 720 }, false], ['desktop-1440', { width: 1440, height: 1080 }, true], ['mobile-390', { width: 390, height: 844 }, true]]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', async (route) => { const req = route.request(); const url = new URL(req.url()); if (url.hostname === '127.0.0.1' && url.port === '5185') {
            await route.continue();
            return;
        } if (url.hostname === '127.0.0.1' && url.port === '1' && url.pathname === '/rest/v1/rpc/get_electronic_document') {
            const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,OPTIONS' };
            if (req.method() === 'OPTIONS') {
                await route.fulfill({ status: 204, headers });
                return;
            }
            const payload = req.postDataJSON();
            requests.push({ name, method: req.method(), organization: payload.organization_id, document: payload.document_id });
            const dto = crearComprobanteSandbox(frozen);
            dto.documentId = payload.document_id;
            await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(dto) });
            return;
        } blocked.push(req.url()); await route.abort(); });
        await page.goto('http://127.0.0.1:5185/__fiscal_ui_fixture');
        const input = page.getByRole('textbox', { name: 'UUID del comprobante' });
        await expect(input).toBeVisible();
        let found = false;
        for (let i = 0; i < 25; i++) {
            await page.keyboard.press('Tab');
            if (await input.evaluate(el => document.activeElement === el)) {
                found = true;
                break;
            }
        }
        if (!found)
            throw Error('No se alcanza el campo por Tab');
        await input.fill('invalido');
        await input.press('Enter');
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(input).toBeFocused();
        await input.fill('22222222-2222-4222-8222-222222222222');
        await input.press('Enter');
        await expect(page.getByRole('heading', { name: 'Detalle fiscal sandbox' })).toBeVisible();
        await expect(page.getByRole('note')).toContainText('Prueba local, sin envío y sin validez tributaria');
        await expect(page.getByText(frozen ? 'Congelado · confirmación interna' : 'Preparado · sin número')).toBeVisible();
        await page.keyboard.press('Tab');
        await expect(page.getByRole('button', { name: 'Consultar', exact: true })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.getByRole('button', { name: 'Limpiar consulta' })).toBeFocused();
        await page.keyboard.press('Tab');
        const region = page.getByRole('region', { name: 'Productos del comprobante' });
        await expect(region).toBeFocused();
        const sizing = await page.evaluate(() => ({ pageOverflow: document.documentElement.scrollWidth > innerWidth }));
        if (sizing.pageOverflow)
            throw Error('Desbordamiento horizontal de página');
        const antes = await region.evaluate(el => el.scrollLeft);
        await region.press('ArrowRight');
        if (viewport.width < 768)
            await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(antes);
        await region.press('Home');
        await page.getByRole('heading', { level: 1, name: 'Consulta fiscal sandbox' }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(temporary, name + '.png'), fullPage: true });
        await page.getByRole('button', { name: 'Limpiar consulta' }).click();
        await expect(input).toBeFocused();
        await expect(page.getByRole('article')).toHaveCount(0);
        results.push({ name, keyboard: true, overflow: false, state: frozen ? 'frozen' : 'prepared' });
        await context.close();
    }
    if (blocked.length)
        throw Error('Peticiones bloqueadas inesperadas: ' + JSON.stringify(blocked));
    if (errors.length)
        throw Error('Errores de navegador: ' + JSON.stringify(errors));
    if (requests.length !== 3)
        throw Error('Recuento de RPC distinto de 3');
    const report = { results, rpcRequests: requests, blocked, errors, artifactDirectory: temporary };
    fs.writeFileSync(path.join(temporary, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}
finally {
    if (browser)
        await browser.close();
    await server.close();
}
