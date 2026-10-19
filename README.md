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
