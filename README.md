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

### 1) Backend en el VPS

Sigue la sección de abajo. En `api/.env` del VPS:

```env
CORS_ORIGIN=https://tu-proyecto.vercel.app,https://tudominio.com
PORT=3001
```

Expón el API con HTTPS (Nginx + certbot), ej. `https://api.tudominio.com`.

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

## Deploy API en VPS (systemd)

En el servidor (Node 20+):

```bash
git clone <tu-repo> ~/la-tasa && cd ~/la-tasa
npm install
cp api/.env.example api/.env
# Edita api/.env: TELEGRAM_*, CORS_ORIGIN=https://tu-dominio.com, PORT=3001

# Login Telegram UNA vez en el VPS (genera TELEGRAM_SESSION)
cd api && npm run telegram:login && cd ..

npm run build --workspace=api
```

Unit `/etc/systemd/system/la-tasa-api.service`:

```ini
[Unit]
Description=La Tasa API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/la-tasa/api
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now la-tasa-api
sudo systemctl status la-tasa-api
```

Nginx (proxy a `:3001`):

```nginx
location /rates {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
}
```

El worker de escaneos (00:00 / 12:00 / 18:00 Havana) corre dentro del mismo proceso: no hace falta otro servicio.

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
