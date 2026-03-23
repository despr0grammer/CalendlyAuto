"""
Driver de WhatsApp Web usando Playwright.
Maneja la sesión, el escaneo del QR y el envío/lectura de mensajes.
"""
import time
import re
import os
import sys
import io
import json
from datetime import datetime

if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

DATA_DIR    = os.path.join(os.path.dirname(__file__), "data")
SESSION_DIR = os.path.join(DATA_DIR, "session")
QR_PATH     = os.path.join(DATA_DIR, "qr.png")
ESTADO_PATH = os.path.join(DATA_DIR, "estado_bot.json")

# Selector CSS de WhatsApp Web (pueden cambiar con actualizaciones)
SEL_QR           = 'div[data-ref]'
SEL_SEARCH_BOX   = 'div[contenteditable="true"][data-tab="3"]'
SEL_MSG_INPUT    = 'div[contenteditable="true"][data-tab="10"]'
SEL_SEND_BTN     = 'button[data-tab="11"]'
SEL_UNREAD_CHATS = 'span[aria-label*="mensaje no leído"], span[aria-label*="unread message"]'
SEL_CHAT_TITLE   = 'span[data-testid="conversation-info-header-chat-title"]'
SEL_LAST_MSG_IN  = 'div.message-in .copyable-text span.selectable-text'


def _escribir_estado(estado: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    estado["ultimo_update"] = datetime.now().isoformat()
    with open(ESTADO_PATH, "w") as f:
        json.dump(estado, f)


def leer_estado() -> dict:
    try:
        with open(ESTADO_PATH) as f:
            return json.load(f)
    except Exception:
        return {"corriendo": False, "conectado": False, "qr": False}


class WhatsAppDriver:
    def __init__(self):
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None
        self.conectado = False

    def iniciar(self):
        """Inicia el navegador y carga WhatsApp Web."""
        print("Iniciando navegador...")
        os.makedirs(SESSION_DIR, exist_ok=True)
        _escribir_estado({"corriendo": True, "conectado": False, "qr": False})

        self._playwright = sync_playwright().start()
        # launch_persistent_context guarda la sesión en disco (no pide QR cada vez)
        self._context = self._playwright.chromium.launch_persistent_context(
            user_data_dir=SESSION_DIR,
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
            ],
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        self._page = self._context.new_page()
        self._page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")

        self._esperar_conexion()

    def _capturar_qr(self):
        """Toma screenshot del canvas del QR y lo guarda en data/qr.png."""
        try:
            # El QR se renderiza en un <canvas>
            canvas = self._page.locator("canvas").first
            canvas.screenshot(path=QR_PATH, timeout=3000)
            return True
        except Exception:
            try:
                # Fallback: recortar zona derecha donde suele estar el QR
                self._page.screenshot(path=QR_PATH,
                                      clip={"x": 800, "y": 80, "width": 420, "height": 420})
                return True
            except Exception:
                return False

    def _esperar_conexion(self, timeout_seg=600):
        """Espera a que WhatsApp Web cargue (puede requerir escanear QR)."""
        print("Esperando conexion a WhatsApp Web...")
        print("Abri http://localhost:5000 en tu navegador y escaneá el QR.\n")

        deadline = time.time() + timeout_seg
        qr_capturado = False

        while time.time() < deadline:
            if self._esta_en_pantalla_principal():
                self.conectado = True
                # Limpiar QR ya que no se necesita más
                if os.path.exists(QR_PATH):
                    os.remove(QR_PATH)
                _escribir_estado({"corriendo": True, "conectado": True, "qr": False})
                print("WhatsApp Web conectado!\n")
                return

            # Intentar capturar el QR si aparece (canvas del QR)
            try:
                self._page.wait_for_selector("canvas", timeout=1000)
                if self._capturar_qr():
                    if not qr_capturado:
                        print("QR generado. Abri http://localhost:5000 para escanearlo.")
                        qr_capturado = True
                    _escribir_estado({"corriendo": True, "conectado": False, "qr": True})
            except Exception:
                pass

            time.sleep(2)

        raise TimeoutError("No se pudo conectar a WhatsApp Web en el tiempo limite.")

    def _esta_en_pantalla_principal(self):
        try:
            # La barra lateral de chats es indicador de que estamos dentro
            self._page.wait_for_selector('#side', timeout=1000)
            return True
        except Exception:
            return False

    def enviar_mensaje(self, telefono: str, texto: str) -> bool:
        """
        Envía un mensaje a un número de teléfono.
        telefono: formato internacional sin '+' ni espacios, ej: '5491123456789'
        """
        try:
            # URL directa para abrir chat
            numero = re.sub(r'\D', '', telefono)
            url = f"https://web.whatsapp.com/send?phone={numero}&text="
            self._page.goto(url, wait_until="domcontentloaded")
            time.sleep(4)

            # Cerrar popup "número inválido" si aparece
            try:
                btn_ok = self._page.locator('div[data-animate-modal-body="true"] button').first
                if btn_ok.is_visible(timeout=2000):
                    btn_ok.click()
                    print(f"  ⚠️  Número {telefono} no está en WhatsApp")
                    return False
            except Exception:
                pass

            # Intentar múltiples selectores (WhatsApp cambia data-tab con el tiempo)
            SELECTORES = [
                'div[contenteditable="true"][data-tab="10"]',
                'div[contenteditable="true"][data-tab="1"]',
                'footer div[contenteditable="true"]',
                'div[role="textbox"]',
            ]
            input_box = None
            for sel in SELECTORES:
                try:
                    self._page.wait_for_selector(sel, timeout=5000)
                    input_box = self._page.locator(sel).first
                    break
                except Exception:
                    continue

            if input_box is None:
                # Guardar screenshot para diagnóstico
                self._page.screenshot(path=os.path.join(DATA_DIR, "error_envio.png"))
                print(f"  ⚠️  No se encontró campo de mensaje para {telefono}")
                return False

            input_box.click()
            time.sleep(0.5)

            # Escribir línea por línea (evita clipboard headless y maneja saltos)
            lineas = texto.split('\n')
            for i, linea in enumerate(lineas):
                self._page.keyboard.type(linea, delay=10)
                if i < len(lineas) - 1:
                    self._page.keyboard.press("Shift+Enter")
                    time.sleep(0.1)

            time.sleep(0.5)
            self._page.keyboard.press("Enter")
            time.sleep(2)

            return True

        except Exception as e:
            print(f"  ❌ Error enviando a {telefono}: {e}")
            return False

    def verificar_respuesta_prospecto(self, telefono: str) -> str | None:
        """
        Abre el chat del prospecto y devuelve el último mensaje entrante si existe.
        Retorna None si no hay mensajes entrantes.
        """
        try:
            numero = re.sub(r'\D', '', telefono)
            url = f"https://web.whatsapp.com/send?phone={numero}"
            self._page.goto(url, wait_until="domcontentloaded")
            time.sleep(6)  # más tiempo para que cargue el historial completo

            # Esperar que el chat cargue
            chat_cargado = False
            for sel in ['div[contenteditable="true"][data-tab="10"]',
                        'footer div[contenteditable="true"]',
                        'div[role="textbox"]',
                        '#main']:
                try:
                    self._page.wait_for_selector(sel, timeout=8000)
                    chat_cargado = True
                    break
                except Exception:
                    continue

            if not chat_cargado:
                return None

            # Esperar a que los mensajes terminen de renderizar
            time.sleep(3)

            # Hacer scroll al final para asegurar que los mensajes más nuevos están visibles
            try:
                self._page.evaluate("""
                    () => {
                        const msgs = document.querySelector('#main');
                        if (msgs) msgs.scrollTop = msgs.scrollHeight;
                    }
                """)
                time.sleep(1)
            except Exception:
                pass

            # Guardar screenshot de diagnóstico (sobrescribe cada vez)
            try:
                self._page.screenshot(
                    path=os.path.join(DATA_DIR, "debug_chat.png"),
                    full_page=False
                )
            except Exception:
                pass

            return self._obtener_ultimo_mensaje_entrante()
        except Exception as e:
            print(f"  ⚠️  verificar_respuesta_prospecto error: {e}")
            return None

    def leer_mensajes_no_leidos(self) -> list[dict]:
        """
        Retorna lista de {telefono, nombre, mensaje} de chats con mensajes no leídos.
        Útil para detectar respuestas de prospectos.
        """
        mensajes = []
        try:
            self._page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")
            time.sleep(3)

            # Buscar chats con mensajes no leídos
            chats_no_leidos = self._page.locator('div[aria-label="Lista de chats"] div[data-testid="cell-frame-container"]').all()

            for chat in chats_no_leidos[:20]:  # Procesar hasta 20 chats
                try:
                    # Verificar si tiene badge de no leído
                    badge = chat.locator('span[data-testid="icon-unread-count"]')
                    if not badge.is_visible():
                        continue

                    chat.click()
                    time.sleep(1.5)

                    # Obtener número de teléfono del URL actual
                    url = self._page.url
                    match = re.search(r'phone=(\d+)', url)
                    if not match:
                        # Intentar desde el encabezado
                        continue

                    telefono = match.group(1)
                    nombre = self._obtener_nombre_chat()
                    ultimo_msg = self._obtener_ultimo_mensaje_entrante()

                    if ultimo_msg:
                        mensajes.append({
                            "telefono": telefono,
                            "nombre": nombre,
                            "mensaje": ultimo_msg,
                        })

                except Exception:
                    continue

        except Exception as e:
            print(f"⚠️  Error leyendo mensajes: {e}")

        return mensajes

    def _obtener_nombre_chat(self):
        try:
            elem = self._page.locator(SEL_CHAT_TITLE).first
            return elem.inner_text(timeout=2000)
        except Exception:
            return ""

    def _obtener_ultimo_mensaje_entrante(self):
        try:
            resultado = self._page.evaluate("""
                () => {
                    function limpiarTexto(el) {
                        const clone = el.cloneNode(true);
                        const basura = clone.querySelectorAll(
                            '[data-testid="msg-time"], [data-testid="msg-dblcheck"], ' +
                            '[data-testid="status-icon"], [data-testid="audio-duration"], ' +
                            'span[class*="tail"], span[aria-label]'
                        );
                        basura.forEach(e => e.remove());
                        const lines = clone.innerText.split('\\n')
                            .map(l => l.trim())
                            .filter(l => l.length > 2 && !/^\\d{1,2}:\\d{2}$/.test(l));
                        return lines.join(' ').trim() || null;
                    }

                    // 1. data-testid="msg-text" dentro de .message-in (selector más estable)
                    const porTestId = document.querySelectorAll('.message-in [data-testid="msg-text"]');
                    if (porTestId.length > 0) {
                        const txt = porTestId[porTestId.length - 1].innerText;
                        if (txt && txt.trim().length > 0) return txt.trim();
                    }

                    // 2. Clases que contengan "message-in" (por si WhatsApp agrega sufijos)
                    const msgIns2 = document.querySelectorAll('[class*="message-in"]');
                    if (msgIns2.length > 0) {
                        const last = msgIns2[msgIns2.length - 1];
                        const txt = limpiarTexto(last);
                        if (txt) return txt;
                    }

                    // 3. data-pre-plain-text: atributo nativo de WA con el remitente
                    //    Los mensajes entrantes tienen este atributo; los salientes no siempre
                    const conAttr = Array.from(document.querySelectorAll('[data-pre-plain-text]'));
                    if (conAttr.length > 0) {
                        // Buscar mensajes donde el contenedor padre NO sea message-out
                        const entrantes = conAttr.filter(el => {
                            const anc = el.closest('[class*="message-out"]');
                            return anc === null;
                        });
                        if (entrantes.length > 0) {
                            const last = entrantes[entrantes.length - 1];
                            const txt = limpiarTexto(last);
                            if (txt) return txt;
                        }
                    }

                    // 4. Último recurso: cualquier div de mensaje que no sea saliente
                    const allMsgs = document.querySelectorAll('[data-id]');
                    const entrantes4 = Array.from(allMsgs).filter(el =>
                        !el.closest('[class*="message-out"]') &&
                        el.closest('[class*="message-in"]')
                    );
                    if (entrantes4.length > 0) {
                        const txt = limpiarTexto(entrantes4[entrantes4.length - 1]);
                        if (txt) return txt;
                    }

                    return null;
                }
            """)
            return resultado if resultado and resultado.strip() else None
        except Exception as e:
            print(f"  ⚠️  _obtener_ultimo_mensaje_entrante error: {e}")
            return None

    def cerrar(self):
        if self._context:
            self._context.close()
        if self._playwright:
            self._playwright.stop()
        self.conectado = False
        if os.path.exists(QR_PATH):
            os.remove(QR_PATH)
        _escribir_estado({"corriendo": False, "conectado": False, "qr": False})
