# La Tasa

**La Tasa** nace como una alternativa abierta para consultar la tasa de cambio del **mercado informal** en Cuba.

La única referencia son publicaciones reales de personas que compran y venden divisas: hoy se leen **grupos de Telegram** y se está trabajando en integrar **WhatsApp**. La idea es acercar **transparencia** y **consistencia** entre los distintos valores que se le dan a las monedas más usadas en el país (USD, EUR, USDT, Zelle, MLC y otras), en lugar de depender de una sola fuente opaca o de un número fijado a mano.

No inventamos el precio: agregamos lo que la gente publica, filtramos ruido (por ejemplo cotizaciones solo por transferencia cuando buscamos efectivo) y calculamos una **mediana** de compra y venta.

> Proyecto open source · licencia [MIT](./LICENSE)

---

## Por qué existe

En el día a día conviven muchas tasas distintas según el grupo, la ciudad o el canal. Eso genera confusión. La Tasa intenta:

- Partir de **fuentes públicas** (chats donde ya se cotiza)
- Mostrar un resumen **reproducible** (misma ventana de mensajes → misma lógica)
- Dejar el método y el código a la vista para que cualquiera pueda auditarlo, mejorarlo o montar su propia instancia

Telegram es la fuente principal. WhatsApp (vía OpenWA) está en camino / integración progresiva.

---

## Cómo contribuir

Cualquier ayuda suma. En particular **aceptamos aportes de fuentes**:

### Grupos de Telegram o WhatsApp

Si conoces (o administras) un grupo donde se publiquen **con frecuencia** precios de compra/venta en efectivo de divisas usadas en Cuba, puedes proponerlo:

1. Abre un [issue](../../issues) con el título `Fuente: …`
2. Incluye:
   - Enlace o username del grupo (Telegram) / cómo identificarlo (WhatsApp)
   - Qué monedas suelen cotizar (USD, EUR, USDT, Zelle, MLC, …)
   - Si cotizan **efectivo**, transferencia o ambas
   - Ciudad / alcance si aplica
   - Frecuencia aproximada de mensajes útiles
3. Confirma que el grupo es accesible de forma legítima (sin scrapear contenido privado sin permiso)

Las fuentes se revisan antes de añadirlas: preferimos grupos activos, con cotizaciones claras y, idealmente, de efectivo.

### Código, bugs y mejoras

- Abre un issue describiendo el problema o la idea
- Envía un PR enfocado (un cambio = un propósito)
- Corre `npm run check` (y el build del API si tocaste backend) antes de mandar el PR
- **Nunca** subas credenciales, sesiones de Telegram/WhatsApp, `.env` reales ni datos personales

Detalle en [CONTRIBUTING.md](./CONTRIBUTING.md). El mantenedor decide qué entra al repo oficial; la licencia MIT también permite forks independientes.

---

## Arranque local

```bash
npm install
cp api/.env.example api/.env
npm run dev:api   # Nest :3124
npm run dev:web   # Next :3000
```

- Web: http://localhost:3000
- API: `GET http://localhost:3124/rates`

---

## Arquitectura típica

```
Usuario → Vercel (Next / web) → API en VPS (Nest :3124 /rates)
```

Las tasas se leen de Telegram (MTProto) y, si está configurado, de WhatsApp (OpenWA). Sin fuentes → valores provisionales.

### Backend en el VPS (Docker)

```bash
cd ~/La-Tasa
git pull
cp api/.env.example api/.env   # solo la primera vez
nano api/.env                  # TELEGRAM_*, OPENWA_*, CORS_ORIGIN, GROQ_API_KEY opcional
docker compose up -d --build
curl http://127.0.0.1:3124/rates
```

Actualizar después de un `git pull`:

```bash
docker compose up -d --build
```

Sesión Telegram (una sola instancia activa por sesión):

```bash
npm install && npm run telegram:login --workspace=api
# pega TELEGRAM_SESSION en api/.env
```

Worker embebido: escanea a las **00:00, 12:00 y 18:00** (`America/Havana`).

### Frontend en Vercel

- Root Directory: `web`
- Env: `API_URL` = URL pública del API (`https://api.tudominio.com`)

Local (`web/.env.local`):

```env
API_URL=http://localhost:3124
```

---

## Telegram (MTProto)

1. Crea `api_id` / `api_hash` en https://my.telegram.org
2. Ponlos en `api/.env` y corre `npm run telegram:login --workspace=api`
3. La cuenta debe estar en los grupos de `TELEGRAM_SOURCE`
4. Varios grupos:

```env
TELEGRAM_SOURCE=["RiC_Red_de_intercambio_CUBA","usdthabanaventaycompra","USD_Holguin","Cuba_Compra_Venta"]
TELEGRAM_DAYS=3
```

Opcional: `GROQ_API_KEY` (Groq free) para ayudar a interpretar mensajes difíciles (emoji, multilínea). El regex sigue siendo la base.

### Sesión invalidada / “Concurrent usage”

Una sesión = una sola API. Si hay conflicto:

```bash
docker compose stop api
npm run telegram:login --workspace=api
# actualiza TELEGRAM_SESSION
docker compose up -d --build --force-recreate api
```

---

## WhatsApp (OpenWA)

La API usa una sesión **ya existente** en OpenWA (no crea el QR). Red Docker externa `openwa-shared` entre La Tasa y OpenWA.

```env
OPENWA_API_URL=http://openwa:2785/api
OPENWA_API_KEY=...
OPENWA_SESSION_ID=sess_...
OPENWA_SOURCE=["120363...@g.us"]
OPENWA_DAYS=3
```

Lista vacía = WhatsApp desactivado. La sesión debe estar `READY`.

---

## Licencia

[MIT](./LICENSE) — úsala, audítala, mejórala y, si puedes, **comparte fuentes** para que la mediana refleje mejor el mercado real.
