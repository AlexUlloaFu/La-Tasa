# La Tasa

Consulta de tasas CUP ↔ USD / USDT / EUR / MLC.

Las tasas salen de un **cliente MTProto** (cuenta normal de Telegram via [teleproto](https://docs.teleproto.dev/), fork de GramJS). Si no hay sesión configurada, usa valores provisionales.

## Arranque (local)

```bash
npm install
cp api/.env.example api/.env
npm run dev:api   # Nest :3001
npm run dev:web   # Next :3000
```

Abre http://localhost:3000 · API: `GET http://localhost:3001/rates`

## Front en Vercel + API en VPS

```
Usuario → Vercel (Next / web) → VPS Nest (:3001 /rates)
```

### 1) Backend en el VPS (Docker)

```bash
cd ~/La-Tasa
cp api/.env.example api/.env
nano api/.env   # TELEGRAM_*, CORS_ORIGIN=https://tu-app.vercel.app
```

Sesión Telegram: copia `TELEGRAM_SESSION` desde tu PC, o genera en el VPS:
```bash
npm install && npm run telegram:login --workspace=api
# pega TELEGRAM_SESSION en api/.env
```

```bash
docker compose up -d --build
curl http://127.0.0.1:3001/rates
docker compose logs -f api
```

Expón con Nginx + HTTPS → `https://api.tudominio.com` → `127.0.0.1:3001`.

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
API_URL=http://localhost:3001
```

## Docker (API)

```bash
docker compose up -d --build   # http://VPS:3001/rates
docker compose logs -f api
docker compose pull && docker compose up -d --build   # tras git pull
```

El worker (00:00 / 12:00 / 18:00 Havana) vive en el mismo contenedor.

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
