# Configuración de Gmail API

Esta guía te ayudará a configurar Gmail API para que la aplicación pueda leer emails de confirmación de SINPE Móvil.

## Prerequisitos

- Una cuenta de Gmail donde recibes las notificaciones de SINPE
- Acceso a Google Cloud Console

---

## Paso 1: Crear Proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Click en el selector de proyectos (arriba a la izquierda)
3. Click en "**Nuevo Proyecto**"
4. Nombre del proyecto: `SINPE Notifier` (o el que prefieras)
5. Click "**Crear**"

---

## Paso 2: Habilitar Gmail API

1. En el proyecto recién creado, ve al menú ☰ → **APIs y Servicios** → **Biblioteca**
2. Busca "**Gmail API**"
3. Click en "Gmail API"
4. Click "**Habilitar**"

---

## Paso 3: Crear Credenciales OAuth 2.0

1. Ve a ☰ → **APIs y Servicios** → **Credenciales**
2. Click "**+ CREAR CREDENCIALES**" → **ID de cliente de OAuth**
3. Si te pide configurar pantalla de consentimiento:
   - Click "**Configurar pantalla de consentimiento**"
   - Tipo de usuario: **Externo**
   - Click "**Crear**"
   - **Nombre de la aplicación**: `SINPE Notifier`
   - **Correo de asistencia al usuario**: Tu email
   - **Información de contacto del desarrollador**: Tu email
   - Click "**Guardar y continuar**"
   - En "Permisos", click "**Guardar y continuar**" (no agregar nada)
   - En "Usuarios de prueba", click "**+ ADD USERS**" y agrega TU email de Gmail
   - Click "**Guardar y continuar**"
   - Revisa y click "**Volver al panel**"

4. Ahora sí, crear credenciales:
   - De vuelta en **Credenciales**, click "**+ CREAR CREDENCIALES**" → **ID de cliente de OAuth**
   - Tipo de aplicación: **Aplicación de escritorio**
   - Nombre: `SINPE Desktop Client`
   - Click "**Crear**"

5. **¡IMPORTANTE!** Aparecerá una ventana con:
   - **Tu ID de cliente**: Cópialo
   - **Tu secreto de cliente**: Cópialo
   - También puedes descargar el JSON

6. Guarda estos valores en un lugar seguro temporalmente

---

## Paso 4: Generar Refresh Token

### Opción A: Usando el script automático (Recomendado)

1. Crea un archivo temporal `get-gmail-token.js` en la raíz del proyecto:

```javascript
const { google } = require('googleapis');
const readline = require('readline');

// REEMPLAZA ESTOS VALORES con los que copiaste en el Paso 3
const CLIENT_ID = 'TU-CLIENT-ID-AQUI.apps.googleusercontent.com';
const CLIENT_SECRET = 'TU-CLIENT-SECRET-AQUI';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify'];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('\n📧 Autoriza esta app visitando esta URL:\n');
console.log(authUrl);
console.log('\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Ingresa el código que obtuviste: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n✅ ¡Éxito! Guarda estos valores en tu .env:\n');
    console.log(`GMAIL_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  } catch (error) {
    console.error('❌ Error obteniendo el token:', error.message);
  }
});
```

2. Ejecuta el script:
```bash
node get-gmail-token.js
```

3. Se abrirá una URL. **Cópiala y ábrela en tu navegador**

4. Inicia sesión con tu cuenta de Gmail

5. Acepta los permisos (aparecerá advertencia porque la app no está verificada - es normal)
   - Click en "**Avanzado**"
   - Click en "**Ir a SINPE Notifier (no seguro)**"
   - Click "**Permitir**"

6. Se mostrará un **código de autorización**. Cópialo

7. Pégalo en la terminal donde está corriendo el script

8. El script imprimirá las 3 variables que necesitas:
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`

---

## Paso 5: Actualizar .env

1. Abre tu archivo `.env`

2. Actualiza estas líneas con los valores que obtuviste:

```bash
GMAIL_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=tu-client-secret
GMAIL_REFRESH_TOKEN=tu-refresh-token-muy-largo
```

3. Guarda el archivo

---

## Paso 6: Verificar Configuración

1. Reinicia el servidor de desarrollo:
```bash
npm run dev
```

2. Si todo está correcto, deberías ver en los logs:
```
✅ Gmail API connection successful
```

3. Si hay error, revisa que:
   - Los 3 valores en `.env` estén correctos (sin espacios extra)
   - El refresh token sea el completo (es muy largo, ~150 caracteres)
   - Gmail API esté habilitada en Google Cloud Console

---

## Paso 7: Configurar Filtros en Gmail (Opcional pero Recomendado)

Para mejor organización, puedes crear un label/filtro en Gmail:

1. Ve a Gmail → Configuración ⚙️ → **Ver todos los ajustes**
2. Tab "**Filtros y direcciones bloqueadas**"
3. "**Crear un filtro nuevo**"
4. En "De" escribe: `*@bac.cr OR *@bancobcr.com OR *@bncr.fi.cr OR *@scotiabankcr.com`
5. En "Tiene las palabras": `SINPE`
6. Click "**Crear filtro**"
7. Marca:
   - ✅ Aplicar etiqueta: Crear nueva llamada "**SINPE**"
   - ✅ También aplicar filtro a conversaciones coincidentes
8. Click "**Crear filtro**"

Ahora todos los emails de SINPE tendrán la etiqueta "SINPE" automáticamente.

---

## Solución de Problemas

### Error: "Invalid grant"
- El refresh token expiró o es inválido
- Vuelve a generar el refresh token (Paso 4)

### Error: "Access denied"
- Verifica que agregaste tu email como "Usuario de prueba" en la pantalla de consentimiento
- Asegúrate de haber aceptado todos los permisos

### Error: "Gmail API has not been used"
- Gmail API no está habilitada en tu proyecto
- Ve a Google Cloud Console y habilítala (Paso 2)

### No se detectan emails
- Verifica que tengas emails con la palabra "SINPE" en el subject
- Los emails deben estar marcados como "No leídos"
- Prueba cambiando `SINPE_QUERY` en `email-monitor.service.ts`

---

## Seguridad

⚠️ **IMPORTANTE:**
- Nunca compartas tu `CLIENT_SECRET` o `REFRESH_TOKEN`
- No subas el archivo `.env` a Git (ya está en `.gitignore`)
- El refresh token da acceso a tu Gmail
- Puedes revocar el acceso en cualquier momento desde: https://myaccount.google.com/permissions

---

## Próximos Pasos

Una vez configurado Gmail API, la aplicación podrá:
1. ✅ Leer emails de confirmación de SINPE
2. ✅ Parsear datos de transacciones
3. ✅ Marcar emails como leídos
4. ✅ Agregar labels para organización

**Siguiente fase:** Configurar WhatsApp API (FASE 3)
