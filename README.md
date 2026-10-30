# STREAMFLIX: Vercel + Apps Script + Google Sheets

- Vercel: solo sirve las páginas y reenvía las llamadas.
- Apps Script (`Code.gs`): toda la lógica; guarda en tu Google Sheet.

1. Google Sheet > Extensiones > Apps Script: pega `Code.gs`, cambia `SECRET`.
2. Implementar > Nueva implementación > Aplicación web (Ejecutar como: Yo, Acceso: Cualquier persona). Copia la URL /exec.
3. Vercel > Settings > Environment Variables (Production):
   - APPS_SCRIPT_URL = URL /exec
   - APPS_SCRIPT_SECRET = el mismo SECRET
4. Redeploy. Abre `/?page=admin` (contraseña inicial `admin123`).

## Modo app (PWA)
- `api/index.js` inyecta `viewport`, color de tema y meta de app en todas las vistas.
- `/manifest.webmanifest` (api/manifest.js) y `/sw.js` (api/sw.js) hacen la app instalable.
- Iconos en `public/icons/`. En el celular: menú del navegador > "Instalar app" / "Agregar a pantalla de inicio".

## Cloudflare Workers (alternativa a Vercel)
Mismo código y mismas rutas: `worker.js` adapta Cloudflare a los handlers de `api/`. Vercel sigue funcionando igual.
1. `npx wrangler login` y luego `npx wrangler deploy` (usa `wrangler.toml`; `public/` se sirve como estáticos).
2. Variables, sin escribirlas en el repositorio: `npx wrangler secret put APPS_SCRIPT_URL` y `npx wrangler secret put APPS_SCRIPT_SECRET` (o en el panel: Workers > Settings > Variables and Secrets).
3. Probar en local: crea `.dev.vars` con `APPS_SCRIPT_URL=...` y `APPS_SCRIPT_SECRET=...` y ejecuta `npx wrangler dev`.
- Plan gratuito de Workers: 10 ms de CPU por petición y 100.000 peticiones/día; cada solicitud de video/segmento (`/s/...`) cuenta como una petición. Si ves errores de CPU o de límite, usa el plan Workers Paid.
- Si solo quieres poner Cloudflare como DNS/proxy delante de Vercel, no hace falta este despliegue.
