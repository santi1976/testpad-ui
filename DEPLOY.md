# Guía de Despliegue - Testpad UI

Esta guía te ayudará a desplegar el proyecto en la nube para que cualquier persona pueda accederlo con solo una URL.

## ⚠️ IMPORTANTE: GitHub Pages NO funciona

**GitHub Pages solo sirve archivos estáticos** (HTML, CSS, JS estático). Tu proyecto necesita **Node.js** para ejecutar el servidor Express (`server.js`), por lo que GitHub Pages **NO es compatible**.

Necesitas un servicio que soporte Node.js con backend.

---

## Opción 1: Cyclic.sh (MEJOR - Gratis SIN Tarjeta, Sin Sleep) ⚡

**Cyclic** es la mejor opción gratuita: **NO requiere tarjeta de crédito** y **NO tiene modo sleep** (la app siempre está activa).

### Pasos:

1. **Crear cuenta en Cyclic**
   - Ve a https://cyclic.sh
   - Regístrate con tu cuenta de GitHub
   - **NO requiere tarjeta de crédito**

2. **Conectar repositorio**
   - Haz clic en "Deploy Now"
   - Conecta tu repositorio de GitHub `testpad-ui`
   - Cyclic detectará automáticamente que es Node.js

3. **Configurar variables de entorno**
   - En "Environment Variables", agrega:
     ```
     NODE_ENV=production
     USER_TESTPAD=system_user@bitfinex.com
     PASSWORD_TESTPAD=tu_password_aqui
     COMPANY_OID=tu_company_oid_aqui
     VITE_TESTPAD_API_TOKEN=tu_api_token_aqui
     ```
   - Cyclic asignará automáticamente el puerto

4. **Desplegar**
   - Cyclic desplegará automáticamente
   - Obtendrás una URL como: `https://testpad-ui.cyclic.app`

### Ventajas de Cyclic:
- ✅ **100% Gratis - NO requiere tarjeta de crédito**
- ✅ **NO tiene modo sleep** - La app siempre está activa
- ✅ Despliegue automático desde GitHub
- ✅ HTTPS automático
- ✅ Muy fácil de configurar

---

## Opción 2: Render (Gratis SIN Tarjeta) 🎨

Render es otra excelente opción gratuita que **NO requiere tarjeta de crédito**.

### Pasos:

1. **Crear cuenta en Render**
   - Ve a https://render.com
   - Regístrate con tu cuenta de GitHub (o email)
   - **NO requiere tarjeta de crédito**

3. **Configurar el servicio**
   - **Name:** `testpad-ui` (o el que prefieras)
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free

4. **Configurar variables de entorno**
   - En la sección "Environment Variables", agrega:
     ```
     NODE_ENV=production
     PORT=10000
     USER_TESTPAD=system_user@bitfinex.com
     PASSWORD_TESTPAD=tu_password_aqui
     COMPANY_OID=tu_company_oid_aqui
     VITE_TESTPAD_API_TOKEN=tu_api_token_aqui
     ```
   - **⚠️ NOTA:** Render usa el puerto definido en `PORT` o el que te asigne automáticamente

5. **Desplegar**
   - Haz clic en "Create Web Service"
   - Render construirá y desplegará automáticamente
   - Obtendrás una URL como: `https://testpad-ui.onrender.com`
   - **Nota:** En el plan gratuito, la app puede "dormir" después de 15 minutos de inactividad. Se despertará automáticamente con el primer request (puede tardar ~30 segundos)

### Ventajas de Render:
- ✅ **100% Gratis - NO requiere tarjeta de crédito**
- ✅ Despliegue automático desde GitHub
- ✅ HTTPS automático
- ✅ Fácil de configurar
- ⚠️ Auto-sleep en plan gratuito (se despierta con el primer request)

---

## Opción 3: Vercel (Requiere Adaptación) 🚀

Vercel es gratuito sin tarjeta, pero usa **serverless functions**. Tu código actual necesita adaptarse para funcionar en Vercel.

**⚠️ IMPORTANTE:** Vercel requiere convertir tu servidor Express en funciones serverless. Esto implica cambios significativos en el código. Solo recomendado si estás dispuesto a refactorizar.

---

## Opción 4: Railway 🚂

Railway es fácil de usar pero **requiere tarjeta de crédito** incluso para el plan gratuito.

**⚠️ IMPORTANTE:** Railway requiere tarjeta de crédito. Si prefieres no usar tarjeta, usa Cyclic o Render (Opción 1 o 2).

---

## Opción 5: Fly.io 🚀

Fly.io es moderno y rápido.

**⚠️ IMPORTANTE:** Fly.io **requiere tarjeta de crédito** incluso para el plan gratuito. Si prefieres no usar tarjeta, usa Cyclic o Render (Opción 1 o 2).

### Pasos:

1. **Instalar Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Iniciar sesión**
   ```bash
   fly auth login
   ```

3. **Inicializar el proyecto**
   ```bash
   fly launch
   ```
   - Sigue las instrucciones interactivas

4. **Configurar variables de entorno**
   ```bash
   fly secrets set USER_TESTPAD=system_user@bitfinex.com
   fly secrets set PASSWORD_TESTPAD=tu_password_aqui
   fly secrets set COMPANY_OID=tu_company_oid_aqui
   fly secrets set VITE_TESTPAD_API_TOKEN=tu_api_token_aqui
   fly secrets set NODE_ENV=production
   ```

5. **Desplegar**
   ```bash
   fly deploy
   ```

---

## Verificación Post-Despliegue

Después de desplegar, verifica que:

1. ✅ La aplicación carga correctamente
2. ✅ El login funciona
3. ✅ Las peticiones a la API funcionan
4. ✅ El envío de emails funciona

---

## Actualizaciones Futuras

Una vez configurado, cada vez que hagas `git push` a tu repositorio:
- **Railway/Render:** Se desplegará automáticamente
- **Fly.io:** Ejecuta `fly deploy` manualmente

---

## Troubleshooting

### Error: "Port not found"
- Verifica que la variable `PORT` esté configurada
- Railway/Render asignan el puerto automáticamente, pero algunos servicios requieren leerlo de `process.env.PORT`

### Error: "Build failed"
- Verifica que todas las dependencias estén en `package.json`
- Revisa los logs del build en la plataforma

### Error: "Environment variables missing"
- Verifica que todas las variables de entorno estén configuradas
- Asegúrate de que los nombres coincidan exactamente (case-sensitive)

---

## Recomendación Final

### ✅ MEJOR OPCIÓN (SIN tarjeta de crédito):

1. **Cyclic.sh** - ⭐ **RECOMENDADO**
   - Gratis sin tarjeta
   - **NO tiene modo sleep** (app siempre activa)
   - Muy fácil de usar
   - Despliegue automático desde GitHub

2. **Render** - Alternativa sólida
   - Gratis sin tarjeta
   - Tiene modo sleep (se despierta con el primer request)
   - Muy confiable y estable

### Si tienes tarjeta de crédito:
- **Railway** - Interfaz muy intuitiva
- **Fly.io** - Excelente rendimiento

### ❌ NO funciona:
- **GitHub Pages** - Solo para sitios estáticos, no soporta Node.js/Express

**Conclusión:** Para tu proyecto, **Cyclic.sh** es la mejor opción gratuita sin tarjeta porque no tiene modo sleep y es muy fácil de usar.

