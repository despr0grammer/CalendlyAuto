"""
Plantillas de mensajes y lógica de secuencia.
"""
import json
import os
from datetime import datetime, timedelta

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "data", "config.json")

CONFIG_DEFAULT = {
    "empresa": {
        "nombre": "TuEmpresa Software",
        "producto": "Sistema de Gestión Empresarial",
        "descripcion": "Software que automatiza la gestión de tu negocio",
        "beneficios": [
            "Reducción del 60% en tiempo administrativo",
            "Control total de ventas, stock e inventario",
            "Reportes en tiempo real",
            "Soporte 24/7"
        ],
        "sitioWeb": "https://tuempresa.com",
        "telefono": "+54 11 1234-5678",
        "nombreVendedor": "Ariel"
    },
    "secuencia": {
        "horasAntesSeguimiento1": 48,
        "horasAntesSeguimiento2": 72,
        "horasAntesSeguimiento3": 120
    },
    "horarioEnvio": {
        "horaInicio": 9,
        "horaFin": 19,
        "diasHabiles": [0, 1, 2, 3, 4]  # 0=lunes ... 4=viernes
    }
}


def get_config():
    if not os.path.exists(CONFIG_PATH):
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        guardar_config(CONFIG_DEFAULT)
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def guardar_config(config):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


PLANTILLAS = {
    "inicial": """\
Hola {nombre}! 👋

Soy {vendedor} de *{empresa}*.

Te contacto porque trabajamos con negocios en {rubro} ayudándolos a crecer con nuestro *{producto}*.

✅ {beneficio1}
✅ {beneficio2}

¿Tenés 5 minutos para contarte cómo lo hacemos? Me gustaría mostrarte cómo puede beneficiar a {empresa_prospecto}.

¡Saludos! 😊""",

    "seguimiento1": """\
Hola {nombre}! ¿Cómo estás?

Te escribía para ver si tuviste oportunidad de leer mi mensaje anterior sobre *{producto}* de {empresa}.

Entiendo que el día a día en {rubro} es muy movido 😅

¿Te parece si coordinamos una llamada rápida de 15 minutos esta semana? Sin compromiso, solo para ver si puede ser útil para {empresa_prospecto}.

¡Saludos! 🙌""",

    "seguimiento2": """\
{nombre}, buen día!

Sé que los mensajes se acumulan, pero quería intentarlo una vez más antes de dejarte tranquilo 😊

Muchos negocios en {rubro} nos dicen que *{producto}* fue un antes y un después:

👉 *{beneficio1}*
👉 *{beneficio2}*

Si en algún momento te interesa explorar la idea, acá estaré.

Cualquier consulta, ¡escribime! 🤝""",

    "seguimiento3": """\
Hola {nombre}!

Entiendo que quizás no es el momento indicado, y lo respeto totalmente.

Solo quería decirte que si en el futuro necesitás optimizar la gestión de {empresa_prospecto}, nuestro *{producto}* sigue disponible.

Podés ver más en: {web}

¡Mucho éxito y hasta pronto! 😊
- {vendedor} de {empresa}""",
}

ETAPA_A_PLANTILLA = {
    0: "inicial",
    1: "seguimiento1",
    2: "seguimiento2",
    3: "seguimiento3",
}


def generar_mensaje(plantilla_nombre: str, prospecto) -> str:
    config = get_config()
    e = config["empresa"]
    beneficios = e.get("beneficios", ["", "", "", ""])

    vars_ = {
        "nombre": prospecto["nombre"],
        "empresa_prospecto": prospecto["empresa"] or "tu empresa",
        "rubro": prospecto["rubro"] or "tu sector",
        "producto": e["producto"],
        "empresa": e["nombre"],
        "vendedor": e["nombreVendedor"],
        "web": e["sitioWeb"],
        "beneficio1": beneficios[0] if len(beneficios) > 0 else "",
        "beneficio2": beneficios[1] if len(beneficios) > 1 else "",
    }

    texto = PLANTILLAS.get(plantilla_nombre, "Hola {nombre}, te contacto de {empresa}.")
    for k, v in vars_.items():
        texto = texto.replace("{" + k + "}", str(v))
    return texto


def calcular_proximo_envio(nueva_etapa: int) -> datetime | None:
    """
    Calcula cuándo enviar el siguiente mensaje según la etapa.
    Retorna None si la secuencia terminó.
    """
    config = get_config()
    sec = config["secuencia"]

    horas_map = {
        1: sec.get("horasAntesSeguimiento1", 48),
        2: sec.get("horasAntesSeguimiento2", 72),
        3: sec.get("horasAntesSeguimiento3", 120),
    }

    if nueva_etapa not in horas_map:
        return None  # Secuencia finalizada

    proximo = datetime.utcnow() + timedelta(hours=horas_map[nueva_etapa])
    return ajustar_horario_laboral(proximo, config)


def ajustar_horario_laboral(fecha: datetime, config: dict) -> datetime:
    h_inicio = config["horarioEnvio"]["horaInicio"]
    h_fin = config["horarioEnvio"]["horaFin"]
    dias_habiles = config["horarioEnvio"]["diasHabiles"]

    # Convertir a hora local aproximada (Argentina = UTC-3)
    fecha_local = fecha + timedelta(hours=-3)

    for _ in range(14):  # Máximo 14 iteraciones (2 semanas)
        dia_semana = fecha_local.weekday()  # 0=lunes, 6=domingo
        hora = fecha_local.hour

        if dia_semana not in dias_habiles:
            # Pasar al siguiente día hábil
            fecha_local = fecha_local.replace(hour=h_inicio, minute=0, second=0) + timedelta(days=1)
            continue
        if hora < h_inicio:
            fecha_local = fecha_local.replace(hour=h_inicio, minute=0, second=0)
            break
        if hora >= h_fin:
            fecha_local = fecha_local.replace(hour=h_inicio, minute=0, second=0) + timedelta(days=1)
            continue
        break

    # Convertir de vuelta a UTC
    return fecha_local + timedelta(hours=3)
