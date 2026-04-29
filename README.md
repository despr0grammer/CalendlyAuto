# CalendlyAuto

Panel Next.js para gestionar prospectos y secuencias de mensajes por **WhatsApp** (Baileys), con integración opcional de **Calendly** para consultar disponibilidad y enviar resúmenes por chat.

Repositorio: [github.com/despr0grammer/Abastellawhatsapp](https://github.com/despr0grammer/Abastellawhatsapp)

## Requisitos

- [Node.js](https://nodejs.org/) 20.x (recomendado)
- [npm](https://www.npmjs.com/) (incluido con Node)

## Instalación (desarrollo local)

1. **Clonar el repositorio**

   ```bash
   git clone https://github.com/despr0grammer/Calendlyauto.git
   cd Calendlyauto
   ```

2. **Instalar dependencias**

   ```bash
   npm install
   ```

3. **Variables de entorno**

   Copia el ejemplo y edita los valores:

   ```bash
   copy .env.example .env
   ```

   En macOS/Linux:

   ```bash
   cp .env.example .env
   ```

4. **Base de datos (Prisma + SQLite por defecto)**

   ```bash
   npx prisma migrate dev
   ```

   Esto aplica las migraciones y genera el cliente de Prisma.

5. **Arrancar la aplicación**

   ```bash
   npm run dev
   ```

   Abre [http://localhost:3000](http://localhost:3000).

## Variables de entorno

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `DATABASE_URL` | Sí | SQLite: `file:./data/bot.db` (ruta relativa a la carpeta `prisma/`). Si cambias a otro motor (p. ej. PostgreSQL), actualiza `datasource` en `schema.prisma` según la [documentación de Prisma](https://www.prisma.io/docs/orm/reference/prisma-schema-reference#datasource). |
| `WHATSAPP_SESSION_DIR` | Recomendada | Carpeta donde Baileys guarda la sesión de WhatsApp. En desarrollo suele ser `./data/session` (desde la raíz del proyecto); en servidor, usa un **volumen persistente** para no perder la sesión al redesplegar. |
| `TZ_OFFSET_HOURS` | Opcional | Desfase horario respecto a UTC para la lógica de envíos (por defecto en ejemplo: `-3`, Chile). |
| `NODE_ENV` | Opcional | `development` o `production`. |
| `CALENDLY_ACCESS_TOKEN` | Opcional | Token personal de la API de Calendly. Sin él, la app funciona pero **no** podrá llamar a la API de Calendly (disponibilidad automática, etc.). |

Referencia del formato en [`.env.example`](./.env.example).

## Calendly (configuración paso a paso)

La app usa la API REST de Calendly cuando `CALENDLY_ACCESS_TOKEN` está definido. En el panel **Configuración** debes indicar la **URL pública de reserva** de tu evento (por ejemplo `https://calendly.com/tu-usuario/tipo-evento`). Opcionalmente puedes fijar `calendlyEventTypeUri` en la misma configuración si tienes varios tipos de evento y quieres forzar uno concreto.

### 1. Cuenta y enlace de reserva

1. Crea o entra en tu cuenta: [calendly.com](https://calendly.com/).
2. Configura un tipo de evento y copia su **enlace de programación** (scheduling link); ese valor es el que pegas como `calendlyUrl` en la configuración de la app.

### 2. Token de acceso personal (PAT)

1. Inicia sesión en [calendly.com/login](https://calendly.com/login).
2. Abre la página de integraciones: [calendly.com/integrations](https://calendly.com/integrations).
3. Entra en **API & Webhooks**: [calendly.com/integrations/api_webhooks](https://calendly.com/integrations/api_webhooks).
4. En **Personal Access Tokens**, elige **Get a token now** o **Generate new token**, pon un nombre al token y pulsa **Create token**, luego **Copy token**.
5. Guía oficial paso a paso: [How to authenticate with personal access tokens](https://developer.calendly.com/how-to-authenticate-with-personal-access-tokens) · Resumen de la API: [Calendly API overview](https://help.calendly.com/hc/en-us/articles/26595353029271-Calendly-API-overview) · Portal dev: [Getting started](https://developer.calendly.com/getting-started).
6. Copia el token **una sola vez** y pégalo en tu `.env`:

   ```env
   CALENDLY_ACCESS_TOKEN="tu_token_aquí"
   ```

   No subas `.env` al repositorio ni compartas el token.

### 3. Comportamiento en la app

- Con token válido y URL configurada, el backend puede resolver el tipo de evento y consultar horarios disponibles (según límites de la API de Calendly).
- Algunas funciones avanzadas o webhooks pueden requerir plan de pago; revisa la [documentación oficial de planes y API](https://help.calendly.com/hc/en-us/articles/26595353029271-Calendly-API-overview).

## Scripts npm

| Comando | Uso |
|---------|-----|
| `npm run dev` | Servidor de desarrollo Next.js. |
| `npm run build` | `prisma generate` + compilación de producción. |
| `npm run start` | `prisma migrate deploy` + `next start` (producción). |
| `npm run lint` | ESLint. |
| `npm run db:studio` | [Prisma Studio](https://www.prisma.io/studio) para inspeccionar datos. |

## Producción (notas breves)

- Asegura `DATABASE_URL` y migraciones alineadas con el `provider` de `schema.prisma`; `npm run start` ejecuta `prisma migrate deploy` antes de `next start`.
- Monta `WHATSAPP_SESSION_DIR` en almacenamiento persistente para no perder la sesión de WhatsApp.
- Ajusta `TZ_OFFSET_HOURS` al huso horario de tus envíos automáticos.

## Licencia y stack

Proyecto privado. Stack principal: [Next.js 14](https://nextjs.org/docs), [Prisma](https://www.prisma.io/docs), [Baileys](https://github.com/WhiskeySockets/Baileys).
