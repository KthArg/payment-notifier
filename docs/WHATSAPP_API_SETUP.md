# Configuración de WhatsApp Cloud API (Meta)

Esta guía te ayudará a configurar WhatsApp Cloud API para enviar notificaciones de SINPE Móvil a tus usuarios.

## Prerequisitos

- Una cuenta de Facebook Business
- Un número de teléfono que NO esté registrado en WhatsApp (para testing)
- Acceso a Meta for Developers

---

## Paso 1: Crear Cuenta Meta Business

1. Ve a [Meta Business Suite](https://business.facebook.com/)
2. Si no tienes una cuenta business:
   - Click en "**Crear cuenta**"
   - Nombre del negocio: `SINPE Notifier` (o el que prefieras)
   - Tu nombre completo
   - Email de trabajo
   - Click "**Siguiente**"
3. Completa la verificación de email
4. Agrega detalles del negocio (dirección, etc.)

---

## Paso 2: Crear App en Meta for Developers

1. Ve a [Meta for Developers](https://developers.facebook.com/)
2. Click en "**Mis Apps**" (arriba derecha)
3. Click en "**Crear app**"
4. Tipo de app: **Empresa**
5. Información de la app:
   - **Nombre de la app**: `SINPE WhatsApp Notifier`
   - **Correo electrónico de contacto**: Tu email
   - **Cuenta de Meta Business**: Selecciona la que creaste en Paso 1
6. Click "**Crear app**"
7. Se te pedirá autenticación - ingresa tu contraseña de Facebook

---

## Paso 3: Agregar WhatsApp al Producto

1. En el dashboard de tu app, busca "**WhatsApp**" en la lista de productos
2. Click "**Configurar**" en la tarjeta de WhatsApp
3. Selecciona tu cuenta de Meta Business
4. Click "**Continuar**"

---

## Paso 4: Configurar Número de Teléfono de Prueba

Meta te proporciona un número de prueba GRATUITO para desarrollo:

1. En el panel izquierdo, ve a **WhatsApp** → **Introducción**
2. Verás una sección "**Envía y recibe mensajes**"
3. Meta te asigna un número de prueba automáticamente (ej: +1 555...)
4. En "**Número de teléfono de prueba**", verás el Phone Number ID

**IMPORTANTE:**
- Este número es SOLO para pruebas
- Puedes enviar mensajes a máximo 5 números verificados
- Para producción necesitarás un número real (Paso 8)

### Agregar Número de Prueba (tu WhatsApp personal)

1. En la misma sección, busca "**Para:**"
2. Click "**Agregar número de teléfono**"
3. Ingresa tu número de WhatsApp personal: `+506 8765 4321`
4. Click "**Enviar código**"
5. Recibirás un código de 6 dígitos en WhatsApp
6. Ingrésalo y click "**Verificar**"

Ahora puedes recibir mensajes de prueba en tu WhatsApp.

---

## Paso 5: Obtener Credenciales

### 5.1 Obtener Phone Number ID

1. En **WhatsApp** → **Introducción**
2. Busca la sección "**Número de teléfono de prueba**"
3. Copia el **Phone Number ID** (debajo del número)
   - Formato: `123456789012345`

### 5.2 Obtener Token de Acceso Temporal

1. En la misma sección, busca "**Token de acceso**"
2. Click en "**Copiar**"
   - Este token es TEMPORAL (expira en 24 horas)
   - Solo para testing inicial

### 5.3 Generar Token de Acceso Permanente

1. Ve a **Configuración** → **Básico** (panel izquierdo)
2. Busca "**Secreto de la app**" → Click "**Mostrar**"
3. Ingresa tu contraseña de Facebook
4. **Copia el App Secret** - Lo necesitarás

Ahora genera el token permanente:

1. Ve a **Herramientas** → **Tokens de acceso** (en el menú superior)
2. O accede directo: https://developers.facebook.com/tools/accesstoken
3. Busca tu app "SINPE WhatsApp Notifier"
4. Click "**Generar token**"
5. Selecciona:
   - **Tipo**: Token de sistema de usuarios
   - **Permisos**:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
   - **Duración**: 60 días (o Never expire si está disponible)
6. Click "**Generar**"
7. **COPIA ESTE TOKEN** - Es tu `WHATSAPP_ACCESS_TOKEN`

**Formato:** `EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (muy largo, ~200 caracteres)

---

## Paso 6: Crear Templates de Mensaje

WhatsApp requiere que TODOS los mensajes usen templates pre-aprobados.

### 6.1 Acceder a Message Templates

1. En el panel izquierdo: **WhatsApp** → **Plantillas de mensajes**
2. Click "**Crear plantilla**"

### 6.2 Template: Notificación de Pago Recibido

**Nombre:** `sinpe_recibido`

**Categoría:** UTILITY (para notificaciones transaccionales)

**Idioma:** Spanish

**Contenido:**
```
Hola {{1}}, has recibido un pago SINPE Móvil.

💰 Monto: ₡{{2}}
👤 De: {{3}}
🏦 Banco: {{4}}
📅 Fecha: {{5}}
🔖 Referencia: {{6}}

✅ El pago ha sido procesado exitosamente.
```

**Variables:**
1. `{{1}}` - Nombre del receptor
2. `{{2}}` - Monto formateado (ej: "50,000.00")
3. `{{3}}` - Nombre del emisor
4. `{{4}}` - Banco (BAC, BCR, BN, Scotiabank)
5. `{{5}}` - Fecha (ej: "04/03/2024 14:32")
6. `{{6}}` - Referencia bancaria

**Botones (opcional):**
- Ninguno (o "Ver detalles" con URL a tu panel)

Click "**Enviar**" → El template entrará en revisión

### 6.3 Template: Notificación de Error

**Nombre:** `sinpe_error`

**Categoría:** UTILITY

**Idioma:** Spanish

**Contenido:**
```
❌ No pudimos procesar una notificación SINPE.

📧 Email recibido de: {{1}}
📅 Fecha: {{2}}

Por favor revisa tu correo para más detalles.
```

Click "**Enviar**"

### 6.4 Aprobar Templates

- Los templates entran en revisión (usualmente <15 minutos)
- Recibirás notificación cuando sean aprobados
- Estado: PENDING → APPROVED

**NOTA:** En modo desarrollo con número de prueba, puedes usar templates sin aprobación.

---

## Paso 7: Configurar Webhook (para Delivery Status)

### 7.1 Configurar URL del Webhook

1. En **WhatsApp** → **Configuración**
2. Busca sección "**Webhook**"
3. Click "**Editar**"

**Callback URL:**
```
https://tu-app.railway.app/api/webhooks/whatsapp
```
(Esto lo configuraremos cuando despliegues a Railway)

**Verify Token:** Crea uno personalizado (ej: `sinpe_webhook_2024_secure`)
- Guárdalo, lo necesitas para `.env` como `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

4. Click "**Verificar y guardar**"

### 7.2 Suscribirse a Eventos

1. En la misma sección de Webhook
2. Busca "**Campos de webhook**"
3. Click "**Administrar**"
4. Selecciona:
   - ✅ `messages` - Para mensajes entrantes
   - ✅ `message_status` - Para delivery/read status
5. Click "**Guardar**"

---

## Paso 8: Actualizar .env

Abre tu archivo `.env` y actualiza estas líneas:

```bash
# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_WEBHOOK_VERIFY_TOKEN=sinpe_webhook_2024_secure
WHATSAPP_API_VERSION=v21.0
```

**IMPORTANTE:**
- El `ACCESS_TOKEN` debe ser el permanente (Paso 5.3), no el temporal
- El `PHONE_NUMBER_ID` es diferente al número de teléfono

---

## Paso 9: Verificar Configuración

### 9.1 Test Manual con cURL

Prueba enviar un mensaje con cURL:

```bash
curl -X POST "https://graph.facebook.com/v21.0/TU_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "+50687654321",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": { "code": "en_US" }
    }
  }'
```

Deberías recibir el mensaje "Hello World" en tu WhatsApp.

### 9.2 Test con el Servicio

Cuando implementemos el WhatsApp Service, ejecuta:

```bash
npm run dev
```

Y en los logs deberías ver:
```
✅ WhatsApp API connection successful
```

---

## Paso 10: Número de Producción (Opcional)

Para producción, necesitas un número real de WhatsApp Business:

### 10.1 Opciones

**Opción A: Usar número existente**
- Debes tener acceso al número
- No puede estar registrado en WhatsApp personal
- Formato: +506 8765 4321

**Opción B: Comprar número nuevo**
- Proveedores: Twilio, Vonage, 360dialog
- Costo: ~$10-50/mes
- Ya viene verificado para WhatsApp

### 10.2 Proceso de Verificación

1. En **WhatsApp** → **Números de teléfono**
2. Click "**Agregar número de teléfono**"
3. Selecciona país: **Costa Rica (+506)**
4. Ingresa el número sin +506: `87654321`
5. Método de verificación:
   - **SMS**: Recibirás código por SMS
   - **Llamada**: Llamada automática con código
6. Ingresa el código de 6 dígitos
7. Click "**Verificar**"

### 10.3 Verificación de Negocio (Meta Business Verification)

Para enviar a números ilimitados, necesitas verificar tu negocio:

1. Ve a [Meta Business Settings](https://business.facebook.com/settings)
2. Click "**Verificación de seguridad**"
3. Sube documentos:
   - Cédula jurídica (si es empresa)
   - Comprobante de domicilio
   - Licencia comercial
4. Espera aprobación (1-5 días hábiles)

**NOTA:** Sin verificación, límite de 1000 conversaciones/mes (suficiente para <100 tx/día)

---

## Paso 11: Límites y Quotas

### Tier Gratuito (Sin verificar)

- **Conversaciones:** 1000/mes gratis
- **Destinatarios únicos:** 250 en 24 horas
- **Mensajes por segundo:** 80
- **Templates:** Sin límite

### Tier Verificado

- **Conversaciones:** 1000 gratis, luego $0.005-0.03 cada una
- **Destinatarios únicos:** Sin límite
- **Mensajes por segundo:** 200+
- **Display Name personalizado**

**Para 100 transacciones/día = ~3000 conversaciones/mes = $10-30/mes**

---

## Solución de Problemas

### Error: "Invalid token"
- El token temporal expiró (solo dura 24h)
- Genera token permanente (Paso 5.3)

### Error: "Phone number not registered"
- El número destino no está verificado
- Agrégalo como número de prueba (Paso 4)
- O usa número de producción verificado

### Error: "Template not found"
- El template no está aprobado
- Verifica en **Plantillas de mensajes** que status sea APPROVED
- En desarrollo, espera ~15 min para aprobación

### Error: "Rate limit exceeded"
- Esperaste muy poco entre mensajes
- Implementa rate limiting con Bottleneck (lo haremos en el servicio)

### No recibo webhooks
- URL del webhook no es accesible públicamente
- Verifica que el verify token coincida
- Revisa logs de Railway cuando despliegues

### Template rechazado
- No uses emojis excesivos
- Evita palabras como "gratis", "premio"
- Las variables deben estar en formato `{{1}}`, `{{2}}`, etc.
- Categoría debe ser correcta (UTILITY para transacciones)

---

## Seguridad

⚠️ **IMPORTANTE:**

- **NUNCA** compartas tu `ACCESS_TOKEN` o `APP_SECRET`
- No subas el archivo `.env` a Git (ya está en `.gitignore`)
- El access token da control total de tu WhatsApp Business
- Rota tokens cada 60 días mínimo
- Usa HTTPS para webhook URL
- Valida firma HMAC en webhooks (lo implementaremos)

**Revocar acceso:**
- Ve a [Business Settings](https://business.facebook.com/settings) → Tokens de sistema
- Busca el token y click "Revocar"

---

## Costos Estimados

### Desarrollo (Número de Prueba)
- Número de prueba: **$0**
- 1000 conversaciones/mes: **$0**
- **Total: $0/mes**

### Producción (100 tx/día)
- 3000 conversaciones/mes: **~$15-90** (depende región)
- Número de teléfono: **$0** (si usas uno existente) o **$10-50/mes** (nuevo)
- **Total: $15-140/mes**

**Optimización:**
- Usa el tier gratuito mientras puedas
- Agrupa notificaciones si es posible
- Solo envía mensajes críticos

---

## Próximos Pasos

Una vez configurado WhatsApp API, la aplicación podrá:
1. ✅ Enviar notificaciones de pagos SINPE recibidos
2. ✅ Usar templates personalizados en español
3. ✅ Recibir delivery status (enviado/entregado/leído)
4. ✅ Manejar reintentos automáticos
5. ✅ Rate limiting para no exceder límites

**Siguiente paso:** Implementar WhatsApp Service y webhook handler

---

## Referencias

- [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Message Templates Guide](https://developers.facebook.com/docs/whatsapp/message-templates)
- [Webhooks Setup](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [API Rate Limits](https://developers.facebook.com/docs/whatsapp/cloud-api/overview#throughput)
- [Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
