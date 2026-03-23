# 🤖 Asistente de Ventas WhatsApp

Sistema de prospección automatizado. Envía secuencias de mensajes de venta por WhatsApp y te avisa cuando un prospecto responde para que tomes el control.

## Flujo de mensajes

```
Prospecto agregado
       │
       ▼ (~5 min)
[📨 Mensaje Inicial]   → presentación de tu empresa
       │
       ▼ (48 hs)
[🔁 Seguimiento 1]     → "¿tuviste chance de leerlo?"
       │
       ▼ (72 hs)
[🔁 Seguimiento 2]     → insistencia con beneficios
       │
       ▼ (120 hs)
[🔁 Seguimiento 3]     → despedida y cierre
       │
       ▼
  Descartado (sin respuesta)

  Si responde en cualquier momento:
       ▼
  🔥 NOTIFICACIÓN → Automatización PAUSADA → ¡Tomás vos el control!
```

---

## Instalación

```bash
cd whatsapp-assistant
pip install playwright
python -m playwright install chromium
```

---

## Paso 1: Configurar tu empresa

```bash
python cli.py config
```

Completá: nombre de empresa, producto, beneficios, tu nombre, sitio web, tiempos de seguimiento.

## Paso 2: Agregar prospectos

```bash
python cli.py add
```

O importar desde un CSV:

```bash
python cli.py import mi_lista.csv
```

**Formato del CSV:**
```
nombre,telefono,empresa,rubro
Juan García,+5491123456789,Restaurante El Sol,gastronomía
María López,+5491187654321,Farmacia Central,salud
```

## Paso 3: Iniciar el bot

```bash
python bot.py
```

1. Se abre Chrome con WhatsApp Web
2. Escaneás el QR con tu celular (solo la primera vez)
3. El bot queda corriendo y envía mensajes automáticamente

## Paso 4: Cuando alguien responde

El bot muestra en la terminal:

```
🔥 ¡RESPUESTA RECIBIDA!
   Prospecto: Juan García (+5491123456789)
   Empresa:   Restaurante El Sol
   Rubro:     gastronomía
   Mensaje:   "Hola! Sí me interesa"
   ⚡ Automatización PAUSADA — ¡Es tu turno de responder en WhatsApp!
```

Abrís WhatsApp en tu celular y tomás la conversación vos.

---

## Otros comandos útiles

```bash
python cli.py              # Menú interactivo completo
python cli.py list         # Ver todos los prospectos con su estado
python cli.py stats        # Estadísticas: enviados, respondieron, convertidos
python cli.py preview      # Previsualizar cómo quedan los mensajes
python cli.py update       # Cambiar estado de un prospecto (ej: marcar como convertido)
```

---

## Personalizar mensajes

Editá el diccionario `PLANTILLAS` en `mensajes.py`.

**Variables disponibles:**
| Variable | Descripción |
|---|---|
| `{nombre}` | Nombre del prospecto |
| `{empresa_prospecto}` | Empresa del prospecto |
| `{rubro}` | Rubro del prospecto |
| `{producto}` | Tu producto/software |
| `{empresa}` | Tu empresa |
| `{vendedor}` | Tu nombre |
| `{web}` | Tu sitio web |
| `{beneficio1}`, `{beneficio2}` | Tus beneficios |

---

## Estructura

```
whatsapp-assistant/
├── bot.py            ← Bot principal (corre en background)
├── cli.py            ← Gestión de prospectos
├── database.py       ← Base de datos SQLite
├── mensajes.py       ← Plantillas y lógica de secuencia
├── whatsapp_driver.py← Control de WhatsApp Web con Playwright
└── data/
    ├── config.json   ← Config de tu empresa (se crea con `python cli.py config`)
    └── prospectos.db ← Base de datos (se crea automáticamente)
```

---

## Notas

- El bot usa WhatsApp Web (sin costo). Tu celular debe tener internet.
- Los mensajes se envían solo en horario laboral (9-19hs, lun-vie).
- La sesión se guarda en `data/session/` para no re-escanear cada vez.
- Los tiempos de seguimiento se respetan aunque el bot se reinicie.
