"""
Bot principal. Corre en un loop:
  - Cada 5 min verifica prospectos pendientes de envío
  - Cada 2 min verifica respuestas entrantes
  - Notifica en consola cuando alguien responde
"""
import time
import signal
import sys
import os
import io
from datetime import datetime

# Forzar UTF-8 en Windows para evitar errores con emojis
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import database as db
import mensajes as msg
from whatsapp_driver import WhatsAppDriver, _escribir_estado, leer_estado

# ── Colores ANSI ──────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"
BG_GREEN = "\033[42m\033[30m"

driver = WhatsAppDriver()
corriendo = True


DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
LOG_PATH = os.path.join(DATA_DIR, "log_bot.json")
_log_buffer = []

def log(color, icono, texto):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {color}{icono} {texto}{RESET}")
    # Guardar en archivo para que la web lo lea
    _log_buffer.insert(0, f"[{ts}] {icono} {texto}")
    if len(_log_buffer) > 80:
        _log_buffer.pop()
    try:
        import json
        with open(LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(_log_buffer, f, ensure_ascii=False)
    except Exception:
        pass


def procesar_envios_pendientes():
    prospectos = db.obtener_prospectos_para_envio()
    if not prospectos:
        return

    log(YELLOW, "📤", f"Procesando {len(prospectos)} prospecto(s)...")

    for p in prospectos:
        etapa = p["etapa_actual"]
        plantilla_nombre = msg.ETAPA_A_PLANTILLA.get(etapa)

        if not plantilla_nombre:
            db.actualizar_prospecto(p["id"], estado="descartado")
            log("\033[90m", "↩", f"{p['nombre']}: Secuencia completada → descartado")
            continue

        texto = msg.generar_mensaje(plantilla_nombre, p)
        telefono = p["telefono"].replace("+", "").replace(" ", "").replace("-", "")

        ok = driver.enviar_mensaje(telefono, texto)

        if ok:
            nueva_etapa = etapa + 1
            proximo = msg.calcular_proximo_envio(nueva_etapa)

            db.actualizar_prospecto(
                p["id"],
                estado="en_secuencia",
                etapa_actual=nueva_etapa,
                fecha_ultimo_mensaje=datetime.utcnow().isoformat(),
                proximo_mensaje=proximo.isoformat() if proximo else None,
                total_mensajes_enviados=p["total_mensajes_enviados"] + 1,
            )
            db.registrar_mensaje(p["id"], "enviado", plantilla_nombre, texto)

            etiqueta = "📨 Inicial" if etapa == 0 else f"🔁 Seguimiento {etapa}"
            cuando = proximo.strftime("%d/%m %H:%M") if proximo else "— fin de secuencia"
            log(GREEN, "✓", f"{p['nombre']} ({p['telefono']}) → {etiqueta}. Próximo: {cuando}")
        else:
            log(RED, "✗", f"No se pudo enviar a {p['nombre']} ({p['telefono']})")

        # Delay entre mensajes (anti-spam)
        time.sleep(12)


def verificar_respuestas():
    """Revisa si algún prospecto en_secuencia respondió y pausa su automatización."""
    prospectos_activos = db.listar_prospectos("en_secuencia")
    if not prospectos_activos:
        return

    log(CYAN, "🔍", f"Verificando respuestas de {len(prospectos_activos)} prospecto(s)...")

    for prospecto in prospectos_activos:
        try:
            ultimo_msg = driver.verificar_respuesta_prospecto(prospecto["telefono"])
        except Exception as e:
            log(RED, "⚠️", f"Error verificando {prospecto['nombre']}: {e}")
            continue

        log("\033[90m", "↩", f"{prospecto['nombre']}: mensaje entrante = {repr(ultimo_msg)}")

        if not ultimo_msg:
            continue

        db.marcar_respondio(prospecto["telefono"])
        db.registrar_mensaje(prospecto["id"], "recibido", "", ultimo_msg)

        log(BG_GREEN + BOLD, "🔥", f"¡RESPUESTA de {prospecto['nombre']}! Msg: {ultimo_msg[:60]}")
        print(f"{YELLOW}   ⚡ Automatización PAUSADA — ¡Es tu turno!{RESET}\n")


def mostrar_banner():
    print(f"\n{CYAN}{BOLD}{'='*50}")
    print("   🤖 Asistente de Ventas WhatsApp")
    print(f"{'='*50}{RESET}")
    stats = db.obtener_estadisticas()
    print(f"{CYAN}📊 Estado actual:{RESET}")
    print(f"   Total:         {BOLD}{stats['total']}{RESET}")
    print(f"   {YELLOW}Pendientes:    {stats['pendientes']}{RESET}")
    print(f"   {CYAN}En secuencia:  {stats['en_secuencia']}{RESET}")
    print(f"   {GREEN}Respondieron:  {stats['respondieron']}{RESET}")
    print(f"   {GREEN}{BOLD}Convertidos:   {stats['convertidos']}{RESET}")
    print(f"   \033[90mDescartados:   {stats['descartados']}{RESET}")
    print()


def salir(sig, frame):
    global corriendo
    print(f"\n{YELLOW}👋 Cerrando bot...{RESET}")
    corriendo = False
    driver.cerrar()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, salir)
    signal.signal(signal.SIGTERM, salir)

    mostrar_banner()

    # Iniciar WhatsApp Web
    try:
        driver.iniciar()
    except Exception as e:
        print(f"{RED}❌ Error iniciando WhatsApp: {e}{RESET}")
        sys.exit(1)

    log(CYAN, "⏰", "Bot activo. Verificando envíos cada 5 min | respuestas cada 2 min.")
    log(CYAN, "💡", "Presioná Ctrl+C para detener.")
    print()

    ultimo_envio = 0
    ultima_lectura = 0
    INTERVALO_ENVIO = 5 * 60   # 5 minutos
    INTERVALO_LECTURA = 2 * 60  # 2 minutos
    FLAG_FORZAR   = os.path.join(DATA_DIR, "forzar_envio.flag")
    FLAG_LECTURA  = os.path.join(DATA_DIR, "forzar_lectura.flag")

    while corriendo:
        ahora = time.time()

        # Forzar envío manual desde la web
        if os.path.exists(FLAG_FORZAR):
            os.remove(FLAG_FORZAR)
            log(CYAN, "⚡", "Envío manual forzado desde la web")
            procesar_envios_pendientes()
            ultimo_envio = ahora
        elif ahora - ultimo_envio >= INTERVALO_ENVIO:
            procesar_envios_pendientes()
            ultimo_envio = ahora

        if os.path.exists(FLAG_LECTURA):
            os.remove(FLAG_LECTURA)
            log(CYAN, "🔍", "Verificación de respuestas forzada desde la web")
            verificar_respuestas()
            ultima_lectura = ahora
        elif ahora - ultima_lectura >= INTERVALO_LECTURA:
            verificar_respuestas()
            ultima_lectura = ahora

        time.sleep(10)


if __name__ == "__main__":
    main()
