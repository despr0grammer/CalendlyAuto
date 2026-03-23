"""
Servidor web Flask para el Asistente de Ventas WhatsApp.
"""
import json
import os
import threading
import csv
import io
from datetime import datetime, timedelta
from flask import Flask, render_template, request, redirect, url_for, jsonify, flash, send_file

import database as db
from mensajes import get_config, guardar_config, generar_mensaje, ETAPA_A_PLANTILLA

app = Flask(__name__)
app.secret_key = "whasales-secret-2024"
app.config["TEMPLATES_AUTO_RELOAD"] = True

DATA_DIR  = os.path.join(os.path.dirname(__file__), "data")
QR_PATH   = os.path.join(DATA_DIR, "qr.png")
LOG_PATH  = os.path.join(DATA_DIR, "log_bot.json")
ESTADO_PATH = os.path.join(DATA_DIR, "estado_bot.json")

MAX_LOG = 100


def leer_estado_bot() -> dict:
    try:
        with open(ESTADO_PATH) as f:
            return json.load(f)
    except Exception:
        return {"corriendo": False, "conectado": False, "qr": False}


def leer_log_bot() -> list:
    try:
        with open(LOG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def agregar_log(msg: str):
    """Log desde la web (acciones del usuario)."""
    logs = leer_log_bot()
    ts = datetime.now().strftime("%H:%M:%S")
    logs.insert(0, f"[{ts}] {msg}")
    if len(logs) > MAX_LOG:
        logs.pop()
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(logs, f, ensure_ascii=False)
    except Exception:
        pass


# ── Helpers ────────────────────────────────────────────────────────────────────

def utc_a_local(iso_str):
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str) - timedelta(hours=3)
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return iso_str


def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    for campo in ("fecha_creacion", "fecha_ultimo_mensaje", "fecha_respuesta", "proximo_mensaje"):
        if d.get(campo):
            d[campo + "_fmt"] = utc_a_local(d[campo])
        else:
            d[campo + "_fmt"] = "—"
    return d


ESTADO_BADGE = {
    "pendiente":    ("badge-warning",  "Pendiente"),
    "en_secuencia": ("badge-info",     "En secuencia"),
    "respondio":    ("badge-success",  "Respondió 🔥"),
    "convertido":   ("badge-primary",  "Convertido ⭐"),
    "descartado":   ("badge-secondary","Descartado"),
}


# ── Rutas ──────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    stats = db.obtener_estadisticas()
    respondieron = [row_to_dict(p) for p in db.listar_prospectos("respondio")]
    estado = leer_estado_bot()
    log = leer_log_bot()[:30]
    qr_disponible = estado.get("qr", False) and os.path.exists(QR_PATH)
    return render_template("index.html",
                           stats=stats,
                           respondieron=respondieron,
                           bot_corriendo=estado.get("corriendo", False),
                           bot_conectado=estado.get("conectado", False),
                           qr_disponible=qr_disponible,
                           log=log)


@app.route("/prospectos")
def prospectos():
    estado = request.args.get("estado")
    lista = [row_to_dict(p) for p in db.listar_prospectos(estado or None)]
    stats = db.obtener_estadisticas()
    return render_template("prospectos.html",
                           prospectos=lista,
                           estado_filtro=estado or "",
                           stats=stats,
                           ESTADO_BADGE=ESTADO_BADGE)


@app.route("/prospectos/nuevo", methods=["GET", "POST"])
def nuevo_prospecto():
    if request.method == "POST":
        nombre = request.form.get("nombre", "").strip()
        telefono = request.form.get("telefono", "").strip()
        empresa = request.form.get("empresa", "").strip()
        rubro = request.form.get("rubro", "").strip()
        notas = request.form.get("notas", "").strip()

        if not nombre or not telefono:
            flash("Nombre y teléfono son obligatorios.", "error")
            return redirect(url_for("nuevo_prospecto"))

        id_ = db.agregar_prospecto(nombre, telefono, empresa, rubro, notas)
        if id_:
            agregar_log(f"Prospecto agregado: {nombre} ({telefono})")
            flash(f"✅ Prospecto '{nombre}' agregado correctamente.", "success")
        else:
            flash(f"⚠️ El teléfono {telefono} ya existe en la base de datos.", "warning")
        return redirect(url_for("prospectos"))

    return render_template("nuevo_prospecto.html")


@app.route("/prospectos/<int:id_>/estado", methods=["POST"])
def cambiar_estado(id_):
    nuevo = request.form.get("estado")
    p = db.obtener_prospecto(id_)
    if p and nuevo:
        db.actualizar_prospecto(id_, estado=nuevo)
        agregar_log(f"Estado cambiado: {p['nombre']} → {nuevo}")
        flash(f"Estado actualizado a '{nuevo}'.", "success")
    return redirect(request.referrer or url_for("prospectos"))


@app.route("/prospectos/<int:id_>")
def detalle_prospecto(id_):
    p = row_to_dict(db.obtener_prospecto(id_))
    if not p:
        flash("Prospecto no encontrado.", "error")
        return redirect(url_for("prospectos"))
    historial = [dict(h) for h in db.obtener_historial(id_)]
    for h in historial:
        h["fecha_fmt"] = utc_a_local(h.get("fecha", ""))
    return render_template("detalle.html", p=p, historial=historial,
                           ESTADO_BADGE=ESTADO_BADGE)


@app.route("/importar", methods=["GET", "POST"])
def importar():
    if request.method == "POST":
        archivo = request.files.get("archivo")
        if not archivo or not archivo.filename.endswith(".csv"):
            flash("Por favor subí un archivo CSV.", "error")
            return redirect(url_for("importar"))

        contenido = archivo.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(contenido))
        importados = duplicados = errores = 0

        for row in reader:
            row_l = {k.lower().strip(): v.strip() for k, v in row.items()}
            telefono = row_l.get("telefono") or row_l.get("phone") or row_l.get("tel", "")
            if not telefono:
                errores += 1
                continue
            id_ = db.agregar_prospecto(
                nombre=row_l.get("nombre") or row_l.get("name") or "Sin nombre",
                telefono=telefono,
                empresa=row_l.get("empresa") or row_l.get("company", ""),
                rubro=row_l.get("rubro") or row_l.get("industry", ""),
                notas=row_l.get("notas") or row_l.get("notes", ""),
            )
            if id_:
                importados += 1
            else:
                duplicados += 1

        agregar_log(f"CSV importado: {importados} nuevos, {duplicados} duplicados, {errores} errores")
        flash(f"✅ {importados} importados | ⚠️ {duplicados} duplicados | ❌ {errores} errores", "info")
        return redirect(url_for("prospectos"))

    return render_template("importar.html")


@app.route("/configuracion", methods=["GET", "POST"])
def configuracion():
    config = get_config()

    if request.method == "POST":
        e = config["empresa"]
        e["nombre"] = request.form.get("nombre", e["nombre"])
        e["producto"] = request.form.get("producto", e["producto"])
        e["nombreVendedor"] = request.form.get("vendedor", e["nombreVendedor"])
        e["sitioWeb"] = request.form.get("web", e["sitioWeb"])
        e["telefono"] = request.form.get("telefono_empresa", e["telefono"])
        e["beneficios"] = [
            request.form.get("ben1", ""),
            request.form.get("ben2", ""),
            request.form.get("ben3", ""),
        ]

        sec = config["secuencia"]
        sec["horasAntesSeguimiento1"] = int(request.form.get("horas1", 48))
        sec["horasAntesSeguimiento2"] = int(request.form.get("horas2", 72))
        sec["horasAntesSeguimiento3"] = int(request.form.get("horas3", 120))

        h = config["horarioEnvio"]
        h["horaInicio"] = int(request.form.get("hora_inicio", 9))
        h["horaFin"] = int(request.form.get("hora_fin", 19))

        guardar_config(config)
        agregar_log("Configuración actualizada")
        flash("✅ Configuración guardada correctamente.", "success")
        return redirect(url_for("configuracion"))

    bens = config["empresa"].get("beneficios", ["", "", ""])
    while len(bens) < 3:
        bens.append("")
    return render_template("configuracion.html", config=config, bens=bens)


@app.route("/mensajes-preview")
def preview_mensajes():
    config = get_config()
    prospecto_ejemplo = {
        "nombre": request.args.get("nombre", "Juan García"),
        "empresa": request.args.get("empresa", "Empresa Ejemplo"),
        "rubro": request.args.get("rubro", "gastronomía"),
    }
    previews = {}
    for etapa, plantilla in ETAPA_A_PLANTILLA.items():
        previews[etapa] = {
            "plantilla": plantilla,
            "texto": generar_mensaje(plantilla, prospecto_ejemplo),
        }
    return render_template("preview.html", previews=previews,
                           prospecto=prospecto_ejemplo)


# ── QR Code ────────────────────────────────────────────────────────────────────

@app.route("/qr.png")
def qr_imagen():
    if os.path.exists(QR_PATH):
        return send_file(QR_PATH, mimetype="image/png")
    return "", 404


@app.route("/debug-chat.png")
def debug_chat():
    path = os.path.join(DATA_DIR, "debug_chat.png")
    if os.path.exists(path):
        return send_file(path, mimetype="image/png")
    return "", 404


# ── Probar con mi número ────────────────────────────────────────────────────────

@app.route("/probar", methods=["POST"])
def probar():
    nombre = request.form.get("nombre", "").strip() or "Yo (prueba)"
    telefono = request.form.get("telefono", "").strip()

    if not telefono:
        flash("Ingresá tu número de teléfono.", "error")
        return redirect(url_for("index"))

    # Normalizar: asegurarse que tenga + adelante
    if not telefono.startswith("+"):
        telefono = "+" + telefono

    # Buscar si ya existe
    existente = db.obtener_prospecto_por_telefono(telefono)
    if existente:
        # Resetear para que se reenvíe el inicial
        db.actualizar_prospecto(existente["id"],
                                estado="pendiente",
                                etapa_actual=0,
                                proximo_mensaje=None,
                                total_mensajes_enviados=0)
        agregar_log(f"Prueba: reiniciando secuencia para {nombre} ({telefono})")
        flash(f"✅ Se va a reenviar el mensaje inicial a {telefono}. El bot lo enviará en el próximo ciclo.", "success")
    else:
        id_ = db.agregar_prospecto(nombre, telefono, notas="[PRUEBA]")
        if id_:
            agregar_log(f"Prueba: prospecto agregado {nombre} ({telefono})")
            flash(f"✅ Número agregado. El bot enviará el mensaje inicial a {telefono} en el próximo ciclo (máx. 5 min).", "success")
        else:
            flash("No se pudo agregar el número.", "error")

    return redirect(url_for("index"))


# ── API para el bot ────────────────────────────────────────────────────────────

@app.route("/api/bot/estado")
def api_bot_estado():
    estado = leer_estado_bot()
    log = leer_log_bot()
    qr_disponible = estado.get("qr", False) and os.path.exists(QR_PATH)
    return jsonify({
        "corriendo": estado.get("corriendo", False),
        "conectado": estado.get("conectado", False),
        "qr": qr_disponible,
        "log": log[:25],
    })


@app.route("/api/stats")
def api_stats():
    return jsonify(db.obtener_estadisticas())


@app.route("/api/alertas")
def api_alertas():
    respondieron = [row_to_dict(p) for p in db.listar_prospectos("respondio")]
    return jsonify(respondieron)


@app.route("/api/verificar-respuestas", methods=["POST"])
def api_verificar_respuestas():
    flag = os.path.join(DATA_DIR, "forzar_lectura.flag")
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(flag, "w") as f:
        f.write("1")
    return jsonify({"ok": True})


@app.route("/api/forzar-envio", methods=["POST"])
def api_forzar_envio():
    flag = os.path.join(DATA_DIR, "forzar_envio.flag")
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(flag, "w") as f:
        f.write("1")
    agregar_log("⚡ Envío manual forzado desde la web")
    return jsonify({"ok": True})


@app.route("/api/log/agregar", methods=["POST"])
def api_log_agregar():
    msg = request.json.get("msg", "")
    if msg:
        agregar_log(msg)
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("\n  Asistente de Ventas WhatsApp")
    print("  ============================")
    print("  Abri tu navegador en: http://localhost:5000\n")
    app.run(debug=False, host="0.0.0.0", port=5000)
