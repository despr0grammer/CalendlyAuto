"""
CLI interactivo para gestionar prospectos y configurar la empresa.

Uso:
  python cli.py              → menú principal
  python cli.py add          → agregar prospecto
  python cli.py list         → listar prospectos
  python cli.py stats        → estadísticas
  python cli.py config       → configurar empresa
  python cli.py import csv   → importar desde CSV
  python cli.py preview      → previsualizar mensajes
"""
import sys
import os
import csv
import json
from datetime import datetime

import database as db
from mensajes import get_config, guardar_config, generar_mensaje, ETAPA_A_PLANTILLA

# ── Colores ───────────────────────────────────────────────────
G = "\033[92m"   # verde
Y = "\033[93m"   # amarillo
R = "\033[91m"   # rojo
C = "\033[96m"   # cyan
B = "\033[1m"    # bold
D = "\033[90m"   # gris
X = "\033[0m"    # reset
BG = "\033[42m\033[30m"  # fondo verde

ESTADO_COLOR = {
    "pendiente":    Y,
    "en_secuencia": C,
    "respondio":    G + B,
    "convertido":   G,
    "descartado":   D,
}


def separador(titulo=""):
    ancho = 50
    if titulo:
        print(f"\n{C}{'─'*3} {titulo} {'─'*(ancho-len(titulo)-5)}{X}")
    else:
        print(f"{D}{'─'*ancho}{X}")


def input_req(prompt):
    while True:
        val = input(prompt).strip()
        if val:
            return val
        print(f"  {R}Campo obligatorio.{X}")


def input_opt(prompt, default=""):
    val = input(prompt).strip()
    return val or default


# ── Agregar prospecto ─────────────────────────────────────────

def cmd_add():
    separador("Agregar prospecto")
    nombre = input_req("  Nombre del contacto:        ")
    telefono = input_req("  Teléfono (+5491123456789): ")
    empresa = input_opt("  Empresa (opcional):         ")
    rubro = input_opt("  Rubro (ej: restaurante):    ")
    notas = input_opt("  Notas adicionales:          ")

    id_ = db.agregar_prospecto(nombre, telefono, empresa, rubro, notas)
    if id_:
        print(f"\n  {G}✅ Prospecto '{nombre}' agregado (ID {id_}).{X}")
        print(f"  {D}El mensaje inicial se enviará en los próximos 5 min cuando el bot esté activo.{X}\n")
    else:
        print(f"\n  {Y}⚠️  El teléfono ya existe en la base de datos.{X}\n")


# ── Listar prospectos ─────────────────────────────────────────

def cmd_list():
    separador("Listar prospectos")
    print("  Filtrar por estado:")
    print("  [1] Todos")
    print("  [2] Pendientes")
    print("  [3] En secuencia")
    print(f"  {G + B}[4] Respondieron ← ¡Atender!{X}")
    print("  [5] Convertidos")
    print("  [6] Descartados")

    opcion = input("\n  Opción [1]: ").strip() or "1"
    mapa = {"1": None, "2": "pendiente", "3": "en_secuencia",
            "4": "respondio", "5": "convertido", "6": "descartado"}
    estado = mapa.get(opcion)

    prospectos = db.listar_prospectos(estado)
    if not prospectos:
        print(f"\n  {D}No hay prospectos en este estado.{X}\n")
        return

    print()
    for p in prospectos:
        color = ESTADO_COLOR.get(p["estado"], X)
        proximo = ""
        if p["proximo_mensaje"]:
            try:
                dt = datetime.fromisoformat(p["proximo_mensaje"])
                # Convertir UTC a local (Argentina UTC-3)
                from datetime import timedelta
                dt_local = dt + timedelta(hours=-3)
                proximo = dt_local.strftime("%d/%m %H:%M")
            except Exception:
                proximo = p["proximo_mensaje"]

        print(f"  {color}[{p['id']}] {p['nombre']} ({p['telefono']}){X}")
        print(f"       Empresa: {p['empresa'] or '-'} | Rubro: {p['rubro'] or '-'}")
        print(f"       Estado: {color}{p['estado']}{X} | Etapa: {p['etapa_actual']} | Mensajes: {p['total_mensajes_enviados']}")
        if proximo:
            print(f"       Próximo envío: {proximo}")
        if p["notas"]:
            print(f"       Notas: {D}{p['notas']}{X}")
        print()


# ── Estadísticas ─────────────────────────────────────────────

def cmd_stats():
    separador("Estadísticas")
    stats = db.obtener_estadisticas()
    total = stats["total"] or 1

    def pct(n):
        return f"{(n/total*100):.1f}%"

    print(f"  Total prospectos:  {B}{stats['total']}{X}")
    print(f"  {Y}Pendientes:        {stats['pendientes']} ({pct(stats['pendientes'])}){X}")
    print(f"  {C}En secuencia:      {stats['en_secuencia']} ({pct(stats['en_secuencia'])}){X}")
    print(f"  {G}Respondieron:      {stats['respondieron']} ({pct(stats['respondieron'])}){X}")
    print(f"  {G + B}Convertidos:       {stats['convertidos']} ({pct(stats['convertidos'])}){X}")
    print(f"  {D}Descartados:       {stats['descartados']} ({pct(stats['descartados'])}){X}")
    print()


# ── Configurar empresa ────────────────────────────────────────

def cmd_config():
    separador("Configurar empresa")
    config = get_config()
    e = config["empresa"]
    sec = config["secuencia"]

    print(f"  {D}(Presioná Enter para mantener el valor actual){X}\n")

    def ask(prompt, default):
        val = input(f"  {prompt} [{default}]: ").strip()
        return val or default

    e["nombre"] = ask("Nombre de tu empresa", e["nombre"])
    e["producto"] = ask("Nombre del producto/software", e["producto"])
    e["nombreVendedor"] = ask("Tu nombre (vendedor)", e["nombreVendedor"])
    e["sitioWeb"] = ask("Sitio web", e["sitioWeb"])
    e["telefono"] = ask("Teléfono de contacto", e["telefono"])

    bens = e.get("beneficios", ["", "", ""])
    bens_padded = bens + [""] * max(0, 3 - len(bens))
    e["beneficios"] = [
        ask("Beneficio 1", bens_padded[0]),
        ask("Beneficio 2", bens_padded[1]),
        ask("Beneficio 3", bens_padded[2]),
    ]

    print(f"\n  {D}Tiempos de seguimiento (en horas):{X}")
    sec["horasAntesSeguimiento1"] = int(ask("Horas entre inicial y seguimiento 1", sec.get("horasAntesSeguimiento1", 48)))
    sec["horasAntesSeguimiento2"] = int(ask("Horas entre seguimiento 1 y 2", sec.get("horasAntesSeguimiento2", 72)))
    sec["horasAntesSeguimiento3"] = int(ask("Horas entre seguimiento 2 y 3", sec.get("horasAntesSeguimiento3", 120)))

    config["empresa"] = e
    config["secuencia"] = sec
    guardar_config(config)
    print(f"\n  {G}✅ Configuración guardada.{X}\n")


# ── Importar CSV ─────────────────────────────────────────────

def cmd_import(archivo=None):
    separador("Importar CSV")
    if not archivo:
        archivo = input("  Ruta del archivo CSV: ").strip()

    ruta = os.path.abspath(archivo)
    if not os.path.exists(ruta):
        print(f"\n  {R}❌ Archivo no encontrado: {ruta}{X}\n")
        return

    importados = 0
    duplicados = 0
    errores = 0

    with open(ruta, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        # Normalizar headers
        fieldnames = [h.lower().strip() for h in (reader.fieldnames or [])]

        def col(row, *nombres):
            for n in nombres:
                for fn in row.keys():
                    if fn.lower().strip() == n:
                        return row[fn].strip()
            return ""

        for i, raw_row in enumerate(reader, 2):
            row = {k.lower().strip(): v for k, v in raw_row.items()}
            telefono = row.get("telefono") or row.get("phone") or row.get("tel", "")
            if not telefono:
                errores += 1
                continue

            nombre = row.get("nombre") or row.get("name") or f"Contacto {i}"
            id_ = db.agregar_prospecto(
                nombre=nombre,
                telefono=telefono,
                empresa=row.get("empresa") or row.get("company", ""),
                rubro=row.get("rubro") or row.get("industry", ""),
                notas=row.get("notas") or row.get("notes", ""),
            )
            if id_:
                importados += 1
            else:
                duplicados += 1

    print(f"\n  {G}✅ {importados} importados{X} | {Y}{duplicados} duplicados{X} | {R}{errores} errores{X}\n")


# ── Previsualizar mensajes ─────────────────────────────────────

def cmd_preview():
    separador("Previsualizar mensajes")
    config = get_config()
    e = config["empresa"]

    # Prospecto de ejemplo
    prospecto_ejemplo = {
        "nombre": "Juan García",
        "empresa": "Restaurante El Sol",
        "rubro": "gastronomía",
    }

    nombre_ejemplo = input(f"  Nombre de ejemplo [{prospecto_ejemplo['nombre']}]: ").strip()
    empresa_ejemplo = input(f"  Empresa de ejemplo [{prospecto_ejemplo['empresa']}]: ").strip()
    rubro_ejemplo = input(f"  Rubro de ejemplo [{prospecto_ejemplo['rubro']}]: ").strip()

    if nombre_ejemplo:
        prospecto_ejemplo["nombre"] = nombre_ejemplo
    if empresa_ejemplo:
        prospecto_ejemplo["empresa"] = empresa_ejemplo
    if rubro_ejemplo:
        prospecto_ejemplo["rubro"] = rubro_ejemplo

    print()
    for etapa, plantilla in ETAPA_A_PLANTILLA.items():
        etiqueta = "📨 Mensaje Inicial" if etapa == 0 else f"🔁 Seguimiento {etapa}"
        print(f"  {C}{B}{'─'*10} {etiqueta} {'─'*10}{X}")
        texto = generar_mensaje(plantilla, prospecto_ejemplo)
        # Indentar
        for linea in texto.split("\n"):
            print(f"  {linea}")
        print()


# ── Actualizar estado ─────────────────────────────────────────

def cmd_update():
    separador("Actualizar estado de prospecto")
    id_str = input("  ID del prospecto: ").strip()
    try:
        id_ = int(id_str)
    except ValueError:
        print(f"  {R}ID inválido.{X}\n")
        return

    p = db.obtener_prospecto(id_)
    if not p:
        print(f"  {R}Prospecto no encontrado.{X}\n")
        return

    print(f"  {C}{p['nombre']} — estado actual: {p['estado']}{X}")
    print("  Nuevo estado:")
    estados = ["pendiente", "en_secuencia", "respondio", "convertido", "descartado"]
    for i, est in enumerate(estados, 1):
        print(f"    [{i}] {est}")

    opcion = input("  Opción: ").strip()
    try:
        nuevo = estados[int(opcion) - 1]
    except (ValueError, IndexError):
        print(f"  {R}Opción inválida.{X}\n")
        return

    db.actualizar_prospecto(id_, estado=nuevo)
    print(f"  {G}✅ Estado actualizado a '{nuevo}'.{X}\n")


# ── Menú principal ─────────────────────────────────────────────

def menu_principal():
    while True:
        separador()
        print(f"\n  {C}{B}🤖 Asistente de Ventas WhatsApp{X}\n")
        print("  [1] Agregar prospecto")
        print("  [2] Listar prospectos")
        print("  [3] Estadísticas")
        print("  [4] Configurar empresa y mensajes")
        print("  [5] Importar CSV")
        print("  [6] Previsualizar mensajes")
        print("  [7] Cambiar estado de un prospecto")
        print("  [0] Salir")

        op = input("\n  Opción: ").strip()

        if op == "1":
            cmd_add()
        elif op == "2":
            cmd_list()
        elif op == "3":
            cmd_stats()
        elif op == "4":
            cmd_config()
        elif op == "5":
            cmd_import()
        elif op == "6":
            cmd_preview()
        elif op == "7":
            cmd_update()
        elif op == "0":
            print(f"\n  {D}👋 Hasta luego!{X}\n")
            break
        else:
            print(f"  {R}Opción inválida.{X}")


# ── Entry point ───────────────────────────────────────────────

if __name__ == "__main__":
    args = sys.argv[1:]

    if not args:
        menu_principal()
    elif args[0] == "add":
        cmd_add()
    elif args[0] == "list":
        cmd_list()
    elif args[0] == "stats":
        cmd_stats()
    elif args[0] == "config":
        cmd_config()
    elif args[0] == "import":
        cmd_import(args[1] if len(args) > 1 else None)
    elif args[0] == "preview":
        cmd_preview()
    elif args[0] == "update":
        cmd_update()
    else:
        print(__doc__)
