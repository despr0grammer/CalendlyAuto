"""
Base de datos SQLite para gestionar prospectos y logs de mensajes.
"""
import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "prospectos.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def inicializar():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS prospectos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                telefono TEXT NOT NULL UNIQUE,
                empresa TEXT DEFAULT '',
                rubro TEXT DEFAULT '',
                notas TEXT DEFAULT '',
                estado TEXT DEFAULT 'pendiente',
                -- pendiente | en_secuencia | respondio | descartado | convertido
                etapa_actual INTEGER DEFAULT 0,
                -- 0=no iniciado, 1=inicial enviado, 2=seg1, 3=seg2, 4=seg3
                fecha_creacion TEXT DEFAULT (datetime('now')),
                fecha_ultimo_mensaje TEXT,
                fecha_respuesta TEXT,
                proximo_mensaje TEXT,
                total_mensajes_enviados INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS mensajes_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prospecto_id INTEGER NOT NULL,
                tipo TEXT NOT NULL,
                plantilla TEXT DEFAULT '',
                contenido TEXT,
                fecha TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (prospecto_id) REFERENCES prospectos(id)
            );
        """)


# ── Prospectos ──────────────────────────────────────────────────────────────

def agregar_prospecto(nombre, telefono, empresa="", rubro="", notas=""):
    try:
        with get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO prospectos (nombre, telefono, empresa, rubro, notas) VALUES (?, ?, ?, ?, ?)",
                (nombre, telefono.strip(), empresa, rubro, notas)
            )
            return cur.lastrowid
    except sqlite3.IntegrityError:
        return None  # Teléfono duplicado


def obtener_prospecto(id_):
    with get_conn() as conn:
        return conn.execute("SELECT * FROM prospectos WHERE id = ?", (id_,)).fetchone()


def obtener_prospecto_por_telefono(telefono):
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM prospectos WHERE telefono = ?", (telefono,)
        ).fetchone()


def listar_prospectos(estado=None):
    with get_conn() as conn:
        if estado:
            return conn.execute(
                "SELECT * FROM prospectos WHERE estado = ? ORDER BY fecha_creacion DESC", (estado,)
            ).fetchall()
        return conn.execute(
            "SELECT * FROM prospectos ORDER BY fecha_creacion DESC"
        ).fetchall()


def obtener_prospectos_para_envio():
    """Prospectos que tienen mensajes pendientes de envío en este momento."""
    ahora = datetime.utcnow().isoformat()
    with get_conn() as conn:
        return conn.execute("""
            SELECT * FROM prospectos
            WHERE estado IN ('pendiente', 'en_secuencia')
            AND (proximo_mensaje IS NULL OR proximo_mensaje <= ?)
            AND etapa_actual < 4
        """, (ahora,)).fetchall()


def actualizar_prospecto(id_, **campos):
    sets = ", ".join(f"{k} = ?" for k in campos)
    valores = list(campos.values()) + [id_]
    with get_conn() as conn:
        conn.execute(f"UPDATE prospectos SET {sets} WHERE id = ?", valores)


def marcar_respondio(telefono):
    p = obtener_prospecto_por_telefono(telefono)
    if not p:
        return None
    with get_conn() as conn:
        conn.execute(
            "UPDATE prospectos SET estado='respondio', fecha_respuesta=datetime('now') WHERE id=?",
            (p["id"],)
        )
    return p


# ── Logs ─────────────────────────────────────────────────────────────────────

def registrar_mensaje(prospecto_id, tipo, plantilla="", contenido=""):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO mensajes_log (prospecto_id, tipo, plantilla, contenido) VALUES (?, ?, ?, ?)",
            (prospecto_id, tipo, plantilla, contenido)
        )


def obtener_historial(prospecto_id):
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM mensajes_log WHERE prospecto_id = ? ORDER BY fecha ASC",
            (prospecto_id,)
        ).fetchall()


# ── Estadísticas ─────────────────────────────────────────────────────────────

def obtener_estadisticas():
    with get_conn() as conn:
        def count(where=""):
            q = f"SELECT COUNT(*) FROM prospectos {where}"
            return conn.execute(q).fetchone()[0]

        return {
            "total": count(),
            "pendientes": count("WHERE estado='pendiente'"),
            "en_secuencia": count("WHERE estado='en_secuencia'"),
            "respondieron": count("WHERE estado='respondio'"),
            "convertidos": count("WHERE estado='convertido'"),
            "descartados": count("WHERE estado='descartado'"),
        }


# Inicializar al importar
inicializar()
