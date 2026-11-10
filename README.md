# La Tasa

Consulta de tasas CUP ↔ USD / USDT / EUR / MLC.

Las tasas salen de grupos de Telegram (MTProto) y, opcionalmente, de WhatsApp mediante tu instancia OpenWA. Se combinan los mensajes recientes de ambas fuentes para calcular la mediana. Si no hay ninguna fuente configurada, usa valores provisionales.

## Arranque (local)

```bash
npm install
cp api/.env.example api/.env
npm run dev:api   # Nest :3124
npm run dev:web   # Next :3000
```

Abre http://localhost:3000 · API: `GET http://localhost:3124/rates`

## Front en Vercel + API en VPS

```
Usuario → Vercel (Next / web) → VPS Nest (:3124 /rates)
```

### 1) Backend en el VPS (Docker)

```bash
cd ~/La-Tasa
cp api/.env.example api/.env
nano api/.env   # TELEGRAM_*, OPENWA_*, CORS_ORIGIN=https://tu-app.vercel.app
```

Para usar OpenWA en otra instalación Docker, conecta ambos servicios a una red Docker externa
compartida llamada `openwa-shared`. OpenWA debe estar desplegado antes de levantar La Tasa.

Sesión Telegram: copia `TELEGRAM_SESSION` desde tu PC, o genera en el VPS:

```bash
npm install && npm run telegram:login --workspace=api
# pega TELEGRAM_SESSION en api/.env
```

Usa esa sesión en **una sola instancia de la API**. No ejecutes `telegram:login`
ni otra copia de la API con la misma sesión mientras el contenedor esté activo.

```bash
docker compose up -d --build
curl http://127.0.0.1:3124/rates
docker compose logs -f api
```

Expón con Nginx + HTTPS → `https://api.tudominio.com` → `127.0.0.1:3124`.

### 2) Frontend en Vercel

- Importa el repo
- **Root Directory:** `web`
- Framework: Next.js
- Env var:
  - `API_URL` = `https://api.tudominio.com`

Deploy. El server de Next llama al VPS en cada request (`cache: 'no-store'`).

Local:

```env
# web/.env.local
API_URL=http://localhost:3124
```

En Vercel (prod): `API_URL=https://api.tudominio.com`

## Docker (API)

```bash
docker compose up -d --build   # http://VPS:3124/rates
docker compose logs -f api
docker compose pull && docker compose up -d --build   # tras git pull
```

El worker (00:00 / 12:00 / 18:00 Havana) vive en el mismo contenedor.

Para OpenWA, `OPENWA_SESSION_ID` debe ser el UUID de una sesión que ya exista
en el panel de OpenWA; el ID no es el nombre de la sesión. Si La Tasa registra
`Session with id ... not found`, corrige ese valor en `api/.env`. Si la sesión
no aparece en OpenWA, créala/iníciala allí y completa el QR antes de configurar
La Tasa. Debe estar en estado `READY` para leer los grupos.

### Recuperar sesión Telegram invalidada

Si los logs muestran `Concurrent usage of the current session`, detén la API y
comprueba que no haya otra copia de La Tasa usando la misma sesión (incluyendo
otro proyecto Docker o una ejecución local):

```bash
docker compose stop api
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Deja una sola instancia usando esa sesión. Como Telegram puede haber invalidado
la sesión, genera una nueva solo después de detener las demás instancias:

```bash
npm run telegram:login --workspace=api
# reemplaza TELEGRAM_SESSION en api/.env por el valor nuevo
docker compose up -d --build --force-recreate api
docker compose logs --tail=100 api
```

## Telegram (MTProto)

1. Crea `api_id` / `api_hash` en https://my.telegram.org
2. Ponlos en `api/.env`
3. Login interactivo (una vez):

```bash
npm run telegram:login --workspace=api
```

4. Copia el `TELEGRAM_SESSION=...` que imprime al `.env`
5. Asegura que esa cuenta esté en el grupo (`TELEGRAM_SOURCE`, por defecto `usdthabanaventaycompra`)
6. Reinicia el API

Sin sesión → fallback hardcodeado. Con sesión → lee mensajes de los últimos `TELEGRAM_DAYS` (default 3), calcula **mediana** de compra/venta por moneda, cache 5 min.

Worker embebido: escanea a las **00:00, 12:00 y 18:00** (`America/Havana`) automáticamente al tener la API arriba.

Varios grupos en JSON (tu cuenta debe estar en todos):

```env
TELEGRAM_SOURCE=["RiC_Red_de_intercambio_CUBA","usdthabanaventaycompra","USD_Holguin","Cuba_Compra_Venta"]
TELEGRAM_DAYS=3
```

## WhatsApp (OpenWA)

La API consulta la sesión existente de OpenWA; no crea ni vuelve a vincular la sesión. Configura en `api/.env` la URL accesible desde el contenedor de La Tasa, la API key y el ID real de sesión de OpenWA:

```env
OPENWA_API_URL=http://openwa:2785/api
OPENWA_API_KEY=...
OPENWA_SESSION_ID=sess_...
OPENWA_SOURCE=["120363...@g.us"]
OPENWA_DAYS=3
```

`OPENWA_SOURCE` acepta JID de grupo (`@g.us`) o el nombre exacto del grupo (se resuelve desde OpenWA; si hay nombres repetidos, usa el JID). Asegúrate de que la sesión esté `ready` y que OpenWA pueda acceder al historial de mensajes. Se leen hasta 200 mensajes por grupo y se filtran por `OPENWA_DAYS`. Una lista vacía desactiva WhatsApp sin afectar Telegram. El API y OpenWA deben compartir la red externa `openwa-shared`; usa `http://openwa:2785/api` como URL dentro de Docker.

## Licencia y contribuciones

La Tasa se distribuye bajo la licencia [MIT](./LICENSE). Consulta
[CONTRIBUTING.md](./CONTRIBUTING.md) para proponer cambios. El mantenedor del
repositorio oficial decide qué contribuciones se aceptan y cuándo se publican
versiones; la licencia también permite a terceros crear y mantener sus propios
forks.
