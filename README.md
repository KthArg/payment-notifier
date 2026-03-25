# SINPE Móvil WhatsApp Notifier

Aplicación que monitorea emails de confirmación de pagos SINPE Móvil (Costa Rica) y envía notificaciones automáticas vía WhatsApp.

## Cómo funciona

1. La app monitorea una cuenta de Gmail cada 30 segundos
2. Detecta y parsea emails de confirmación de SINPE de múltiples bancos
3. Encola la transacción en BullMQ
4. El worker procesa la transacción, la guarda en PostgreSQL y envía una notificación de WhatsApp al receptor

## Stack

- **Runtime:** Node.js 20+ con TypeScript
- **Base de datos:** PostgreSQL (Supabase)
- **Cola:** BullMQ + Redis (Upstash)
- **WhatsApp:** Meta Cloud API
- **Email:** Gmail API
- **Hosting:** Railway

## Bancos soportados

- BAC Credomatic
- Banco de Costa Rica (BCR)
- Banco Nacional (BN)
- Scotiabank Costa Rica

## Requisitos

- Node.js 20+
- Cuenta en Supabase (PostgreSQL)
- Cuenta en Upstash (Redis)
- Cuenta Meta Business con WhatsApp Cloud API habilitado
- Cuenta de Gmail con Gmail API habilitada

## Configuración

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

Crea un archivo `.env` con las siguientes variables:

```bash
# Node
NODE_ENV=development
PORT=3000

# PostgreSQL (Supabase)
DATABASE_URL=postgresql://...
MIGRATION_DATABASE_URL=postgresql://...

# Redis (Upstash)
REDIS_URL=rediss://...

# Encriptación (genera con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=

# Gmail API
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=

# WhatsApp Meta API
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_API_VERSION=v21.0

# JWT
JWT_SECRET=
JWT_EXPIRY=24h
ADMIN_PASSWORD_HASH=

# CORS
ALLOWED_ORIGINS=http://localhost:3000
```

Para configurar Gmail API, ver `docs/GMAIL_API_SETUP.md`.
Para configurar WhatsApp API, ver `docs/WHATSAPP_API_SETUP.md`.

### 3. Base de datos

Ejecuta el archivo `migrations/all_migrations.sql` en el SQL Editor de Supabase para crear las tablas.

### 4. Desarrollo

```bash
npm run dev
```

El servidor inicia en `http://localhost:3000`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor con hot reload |
| `npm run build` | Compila TypeScript |
| `npm start` | Ejecuta versión compilada |
| `npm run migrate` | Verifica estado de migraciones |

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor |
| POST | `/api/auth/login` | Login de administrador |
| GET | `/api/users` | Listar usuarios |
| POST | `/api/users` | Crear usuario |
| GET | `/api/transactions/pending` | Transacciones pendientes |
| GET | `/api/transactions/stats` | Estadísticas |
| GET | `/api/notifications/retryable` | Notificaciones con reintento pendiente |
| GET | `/api/queue/stats` | Estado de la cola |
| GET | `/admin/queues` | Dashboard de BullMQ |
| GET/POST | `/api/webhooks/whatsapp` | Webhook de Meta |

Todos los endpoints excepto `/health`, `/api/auth/login` y los webhooks requieren token JWT en el header `Authorization: Bearer <token>`.

## Seguridad

- Encriptación AES-256-GCM para datos sensibles en base de datos (teléfonos, nombres)
- SHA-256 para búsquedas indexadas y deduplicación de transacciones
- HMAC-SHA256 para validación de webhooks de WhatsApp
- JWT para autenticación de la API REST
- Helmet + CORS configurado

## Licencia

ISC
