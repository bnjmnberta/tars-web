#!/usr/bin/env python3
"""
guardados_a_guia.py — Convierte tus guardados de Instagram en una guía de
implementación para tus proyectos.

Instagram NO ofrece una API para leer "Guardados", así que el punto de partida
es la exportación oficial de tus datos:

  Instagram → Configuración → Centro de cuentas → Tu información y permisos →
  Descargar tu información → formato JSON → (basta con marcar "Guardados").

Pasos que hace el script (cada uno guarda su resultado y se puede reanudar):

  1. extraer     Lee el ZIP/carpeta/JSON exportado → guardados.json
  2. enriquecer  Intenta bajar el texto (caption) de cada post público.
                 Si Instagram lo bloquea, puedes pegar los captions a mano en
                 guardados.json (campo "caption") y volver a ejecutar.
  3. analizar    Claude clasifica cada post y propone cómo aplicarlo a tus
                 proyectos → analisis.json
  4. guia        Claude redacta guia_guardados.md (prioridades + pasos).

Uso rápido:

  export ANTHROPIC_API_KEY=sk-ant-...
  python3 guardados_a_guia.py instagram-export.zip \\
      --proyecto ../.. --proyecto ~/otro-proyecto

  # Sin IA (solo ordena y lista los guardados):
  python3 guardados_a_guia.py instagram-export.zip --sin-ia

Solo usa la biblioteca estándar de Python 3.9+.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

MODELO_POR_DEFECTO = "claude-sonnet-5-5"
API_URL = "https://api.anthropic.com/v1/messages"
IG_RE = re.compile(
    r"https?://(?:www\.)?instagram\.com/(?:[\w.]+/)?(p|reel|reels|tv)/([\w-]+)", re.I
)
TAMANO_LOTE = 25
MAX_CAPTION = 1500


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def arreglar_texto(s):
    """Los JSON de Instagram guardan UTF-8 como si fuera latin-1 (mojibake)."""
    if not isinstance(s, str):
        return s
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def leer_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def escribir_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# --------------------------------------------------------------------------- #
# 1. Extraer guardados de la exportación
# --------------------------------------------------------------------------- #
def cargar_jsons_guardados(origen: Path) -> list[tuple[str, object]]:
    """Devuelve [(nombre, json)] de los archivos de guardados del export."""
    candidatos: list[tuple[str, object]] = []

    def es_guardado(nombre: str) -> bool:
        n = nombre.lower().replace("\\", "/")
        return n.endswith(".json") and ("/saved/" in n or "saved_" in n.split("/")[-1])

    if origen.is_file() and origen.suffix.lower() == ".zip":
        with zipfile.ZipFile(origen) as z:
            for nombre in z.namelist():
                if es_guardado(nombre):
                    candidatos.append((nombre, json.loads(z.read(nombre))))
    elif origen.is_dir():
        for p in origen.rglob("*.json"):
            if es_guardado(str(p)):
                candidatos.append((str(p), json.loads(p.read_text(encoding="utf-8"))))
    elif origen.is_file():
        candidatos.append((origen.name, json.loads(origen.read_text(encoding="utf-8"))))
    return candidatos


def recorrer(nodo, coleccion, salida, usuario=""):
    """Recorre el JSON buscando enlaces a posts; tolerante a cambios de formato."""
    if isinstance(nodo, list):
        for item in nodo:
            if isinstance(item, dict):
                smd = item.get("string_map_data") or {}
                titulo = arreglar_texto(item.get("title") or "")
                nombre = arreglar_texto((smd.get("Name") or smd.get("Nombre") or {}).get("value", ""))
                if titulo.lower() in ("collection", "colección", "coleccion") and nombre:
                    coleccion = nombre  # entrada que declara una colección
                    continue
            coleccion = recorrer(item, coleccion, salida, usuario) or coleccion
    elif isinstance(nodo, dict):
        href = nodo.get("href")
        if isinstance(href, str) and IG_RE.search(href):
            m = IG_RE.search(href)
            salida.append(
                {
                    "kind": "reel" if m.group(1).lower() == "reels" else m.group(1).lower(),
                    "code": m.group(2),
                    "usuario": usuario,
                    "coleccion": coleccion,
                    "guardado_ts": nodo.get("timestamp"),
                }
            )
        usuario_hijo = usuario
        if "title" in nodo and isinstance(nodo["title"], str) and "string_map_data" in nodo:
            usuario_hijo = arreglar_texto(nodo["title"]) or usuario
        for v in nodo.values():
            if isinstance(v, (list, dict)):
                recorrer(v, coleccion, salida, usuario_hijo)
    return coleccion


def extraer(origen: Path) -> list[dict]:
    jsons = cargar_jsons_guardados(origen)
    if not jsons:
        sys.exit(
            f"No encontré archivos de guardados en {origen}.\n"
            "Revisa que la exportación sea en formato JSON e incluya 'Guardados'."
        )
    crudos: list[dict] = []
    for nombre, data in jsons:
        log(f"  · {nombre}")
        recorrer(data, "", crudos)

    por_code: dict[str, dict] = {}
    for r in crudos:
        item = por_code.setdefault(
            r["code"],
            {
                "code": r["code"],
                "kind": r["kind"],
                "url": f"https://www.instagram.com/{r['kind']}/{r['code']}/",
                "usuario": r["usuario"],
                "colecciones": [],
                "guardado_el": "",
                "caption": "",
                "estado": "pendiente",
            },
        )
        if r["coleccion"] and r["coleccion"] not in item["colecciones"]:
            item["colecciones"].append(r["coleccion"])
        if r["usuario"] and not item["usuario"]:
            item["usuario"] = r["usuario"]
        if r["guardado_ts"] and not item["guardado_el"]:
            item["guardado_el"] = datetime.fromtimestamp(
                int(r["guardado_ts"]), tz=timezone.utc
            ).strftime("%Y-%m-%d")
    items = sorted(por_code.values(), key=lambda i: i["guardado_el"], reverse=True)
    log(f"  → {len(items)} posts únicos")
    return items


# --------------------------------------------------------------------------- #
# 2. Enriquecer: bajar caption público (mejor esfuerzo)
# --------------------------------------------------------------------------- #
class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta: dict[str, str] = {}

    def handle_starttag(self, tag, attrs):
        if tag == "meta":
            a = dict(attrs)
            clave = a.get("property") or a.get("name")
            if clave and a.get("content"):
                self.meta.setdefault(clave, a["content"])


def limpiar_caption(og_desc: str) -> str:
    # '1,234 likes, 56 comments - user on March 3, 2024: "texto".'
    m = re.match(r'^.*?-\s.*?:\s*["“](.*)["”]\.?\s*$', og_desc, re.S)
    return html.unescape(m.group(1) if m else og_desc).strip()


def bajar_caption(url: str) -> tuple[str, str]:
    """Devuelve (caption, estado). estado: ok | sin_texto | bloqueado | limite"""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            "Accept-Language": "es,en;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            cuerpo = r.read(400_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return "", "limite" if e.code == 429 else "bloqueado"
    except (urllib.error.URLError, TimeoutError):
        return "", "bloqueado"
    p = MetaParser()
    p.feed(cuerpo)
    desc = p.meta.get("og:description") or p.meta.get("description") or ""
    if not desc or "Log in" in desc or "Inicia sesión" in desc:
        return "", "sin_texto"
    return limpiar_caption(desc), "ok"


def enriquecer(items: list[dict], ruta: Path, pausa: float) -> None:
    pendientes = [i for i in items if i["estado"] == "pendiente" and not i["caption"]]
    log(f"  {len(pendientes)} posts por consultar (pausa ~{pausa}s)")
    fallos_seguidos = 0
    for n, it in enumerate(pendientes, 1):
        caption, estado = bajar_caption(it["url"])
        it["caption"], it["estado"] = caption, estado
        log(f"  [{n}/{len(pendientes)}] {it['code']} → {estado}")
        escribir_json(ruta, items)  # guarda progreso
        if estado == "limite":
            log("  Instagram pidió frenar (429). Reintenta más tarde; el progreso está guardado.")
            it["estado"] = "pendiente"
            break
        fallos_seguidos = fallos_seguidos + 1 if estado != "ok" else 0
        if fallos_seguidos >= 8:
            log("  Muchos fallos seguidos: Instagram bloquea la lectura anónima.")
            log(f"  Pega los captions a mano en {ruta} (campo \"caption\") y vuelve a ejecutar.")
            break
        time.sleep(pausa + random.random())
    escribir_json(ruta, items)


# --------------------------------------------------------------------------- #
# Contexto de los proyectos
# --------------------------------------------------------------------------- #
IGNORAR = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next"}
EXT_IMG = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".mov", ".ico", ".woff", ".woff2"}


def describir_proyecto(raiz: Path, max_archivos: int = 120) -> str:
    raiz = raiz.expanduser().resolve()
    if not raiz.is_dir():
        sys.exit(f"--proyecto: {raiz} no es una carpeta")
    partes = [f"### Proyecto: {raiz.name}"]
    archivos: list[str] = []
    for p in sorted(raiz.rglob("*")):
        rel = p.relative_to(raiz)
        if any(x in IGNORAR for x in rel.parts) or p.is_dir():
            continue
        if p.suffix.lower() in EXT_IMG or "tools/guardados-instagram" in str(rel):
            continue
        archivos.append(str(rel))
        if len(archivos) >= max_archivos:
            archivos.append("… (lista recortada)")
            break
    partes.append("Archivos relevantes:\n" + "\n".join(f"- {a}" for a in archivos))
    for nombre in ("README.md", "package.json", "requirements.txt", "pyproject.toml", "CLAUDE.md"):
        f = raiz / nombre
        if f.exists():
            partes.append(f"--- {nombre} ---\n{f.read_text(encoding='utf-8', errors='replace')[:2500]}")
    # Pistas de stack
    if (raiz / "index.html").exists() and not (raiz / "package.json").exists():
        partes.append("Pista: sitio estático (HTML/CSS/JS), sin build ni framework.")
    return "\n\n".join(partes)


# --------------------------------------------------------------------------- #
# Llamadas a Claude
# --------------------------------------------------------------------------- #
def llamar_claude(sistema: str, usuario: str, modelo: str, max_tokens: int = 8000) -> str:
    clave = os.environ.get("ANTHROPIC_API_KEY")
    if not clave:
        sys.exit("Falta la variable de entorno ANTHROPIC_API_KEY (o usa --sin-ia).")
    cuerpo = json.dumps(
        {
            "model": modelo,
            "max_tokens": max_tokens,
            "system": sistema,
            "messages": [{"role": "user", "content": usuario}],
        }
    ).encode()
    for intento in range(5):
        req = urllib.request.Request(
            API_URL,
            data=cuerpo,
            headers={
                "x-api-key": clave,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.loads(r.read())
            return "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
        except urllib.error.HTTPError as e:
            detalle = e.read().decode("utf-8", "replace")[:300]
            if e.code in (429, 500, 502, 503, 529) and intento < 4:
                espera = 2 ** (intento + 1)
                log(f"  API {e.code}, reintento en {espera}s…")
                time.sleep(espera)
                continue
            sys.exit(f"Error de la API ({e.code}): {detalle}")
        except (urllib.error.URLError, TimeoutError) as e:
            if intento < 4:
                time.sleep(2 ** (intento + 1))
                continue
            sys.exit(f"No pude conectar con la API: {e}")
    sys.exit("La API no respondió tras varios intentos.")


def extraer_json_lista(texto: str) -> list[dict]:
    i, j = texto.find("["), texto.rfind("]")
    if i == -1 or j == -1:
        raise ValueError("la respuesta no contiene una lista JSON")
    return json.loads(texto[i : j + 1])


SISTEMA_ANALISIS = """Eres un asesor técnico que convierte posts guardados de Instagram \
(ideas, trucos, herramientas, diseño, marketing, código) en acciones concretas para los \
proyectos del usuario. Responde en español.

Reglas:
- Basa todo SOLO en el texto (caption) que se te da. Si un post no tiene caption o no se \
entiende, usa relevancia "desconocida" y resumen "Sin contexto: abrir el enlace a mano". \
No inventes el contenido de un post.
- Evalúa la relevancia (alta|media|baja|desconocida) contra los proyectos descritos.
- 'como_aplicarlo' son pasos concretos y cortos, mencionando archivos o secciones reales \
del proyecto cuando sea posible.
- Devuelve ÚNICAMENTE una lista JSON, sin texto alrededor, con un objeto por post:
  {"id": "<code>", "titulo": "...", "categoria": "...", "resumen": "...",
   "relevancia": "alta|media|baja|desconocida", "proyecto": "<nombre o ''>",
   "esfuerzo": "bajo|medio|alto", "como_aplicarlo": ["paso", "..."],
   "herramientas": ["..."]}
- Usa categorías cortas y consistentes (p. ej. Diseño UI, Animación, SEO, Contenido, \
Herramientas IA, Rendimiento, Marketing, Negocio)."""

SISTEMA_GUIA = """Eres un tech lead que redacta una guía de implementación en Markdown, en \
español, a partir de un análisis de posts guardados de Instagram y la descripción de los \
proyectos del usuario. No inventes nada que no esté en el análisis. Estructura:

1. # Guía de implementación — resumen en 5-8 líneas.
2. ## Quick wins (relevancia alta + esfuerzo bajo): checklist con casillas `- [ ]`, \
cada una con enlace al post, qué hacer y en qué archivo/sección.
3. ## Plan por fases (Fase 1 esta semana, Fase 2 este mes, Fase 3 después), cada fase con \
tareas ordenadas.
4. ## Por categoría: para cada categoría, ideas con pasos detallados, herramientas y enlace.
5. ## Por proyecto: qué aplicar en cada proyecto.
6. ## Para revisar a mano: posts sin contexto (lista de enlaces).
7. ## Descartados / baja relevancia: lista breve con motivo.
Sé concreto y accionable; evita relleno."""


def analizar(items, contexto, ruta, modelo):
    previo = {a["id"]: a for a in (leer_json(ruta) or [])}
    pend = [i for i in items if i["code"] not in previo]
    log(f"  {len(previo)} ya analizados, {len(pend)} por analizar")
    for k in range(0, len(pend), TAMANO_LOTE):
        lote = pend[k : k + TAMANO_LOTE]
        payload = [
            {
                "id": i["code"],
                "url": i["url"],
                "tipo": i["kind"],
                "usuario": i["usuario"],
                "colecciones": i["colecciones"],
                "caption": (i["caption"] or "")[:MAX_CAPTION],
            }
            for i in lote
        ]
        usuario = (
            f"PROYECTOS DEL USUARIO:\n{contexto}\n\nPOSTS GUARDADOS:\n"
            + json.dumps(payload, ensure_ascii=False)
        )
        log(f"  lote {k // TAMANO_LOTE + 1}/{-(-len(pend) // TAMANO_LOTE)} ({len(lote)} posts)")
        for intento in range(2):
            try:
                res = extraer_json_lista(llamar_claude(SISTEMA_ANALISIS, usuario, modelo, 12000))
                break
            except (ValueError, json.JSONDecodeError) as e:
                if intento:
                    sys.exit(f"No pude interpretar la respuesta del modelo: {e}")
                log("  respuesta no válida, reintentando…")
        urls = {i["code"]: i["url"] for i in lote}
        for a in res:
            if a.get("id") in urls:
                a["url"] = urls[a["id"]]
                previo[a["id"]] = a
        escribir_json(ruta, list(previo.values()))
    return list(previo.values())


def redactar_guia(analisis, contexto, modelo) -> str:
    usuario = (
        f"PROYECTOS DEL USUARIO:\n{contexto}\n\nANÁLISIS DE POSTS (JSON):\n"
        + json.dumps(analisis, ensure_ascii=False)
    )
    return llamar_claude(SISTEMA_GUIA, usuario, modelo, 16000)


# --------------------------------------------------------------------------- #
# Guía sin IA (solo ordena)
# --------------------------------------------------------------------------- #
def guia_sin_ia(items: list[dict]) -> str:
    grupos: dict[str, list[dict]] = defaultdict(list)
    for i in items:
        grupos[(i["colecciones"] or ["Sin colección"])[0]].append(i)
    out = [f"# Guardados de Instagram ({len(items)})\n"]
    for nombre, lista in sorted(grupos.items()):
        out.append(f"\n## {nombre} ({len(lista)})\n")
        for i in lista:
            texto = " ".join(i["caption"].split())[:140] or "_(sin texto — abrir a mano)_"
            out.append(f"- [ ] [{i['usuario'] or i['code']}]({i['url']}) — {texto}")
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(
        description="Genera una guía de implementación a partir de tus guardados de Instagram.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("export", type=Path, nargs="?", help="ZIP / carpeta / saved_posts.json exportado")
    ap.add_argument("--proyecto", action="append", default=[], type=Path,
                    help="carpeta de un proyecto (repetible)")
    ap.add_argument("--salida", type=Path, default=Path("salida-guardados"),
                    help="carpeta de trabajo (default: salida-guardados)")
    ap.add_argument("--modelo", default=MODELO_POR_DEFECTO)
    ap.add_argument("--sin-red", action="store_true", help="no consultar Instagram (usa captions ya guardados)")
    ap.add_argument("--sin-ia", action="store_true", help="no usar Claude: solo ordenar y listar")
    ap.add_argument("--pausa", type=float, default=3.0, help="segundos entre consultas a Instagram")
    args = ap.parse_args()

    args.salida.mkdir(parents=True, exist_ok=True)
    ruta_items = args.salida / "guardados.json"
    ruta_analisis = args.salida / "analisis.json"
    ruta_guia = args.salida / "guia_guardados.md"

    # 1. extraer
    items = leer_json(ruta_items)
    if args.export:
        log("1/4 Extrayendo guardados…")
        nuevos = extraer(args.export)
        existentes = {i["code"]: i for i in (items or [])}
        for n in nuevos:  # conserva captions ya bajados/editados a mano
            if n["code"] in existentes:
                n.update({k: existentes[n["code"]][k] for k in ("caption", "estado")})
        items = nuevos
        escribir_json(ruta_items, items)
    elif items is None:
        sys.exit("Indica el export de Instagram (ZIP/carpeta/JSON) la primera vez.")
    else:
        log(f"1/4 Usando {ruta_items} existente ({len(items)} posts)")

    # captions pegados a mano cuentan como ok
    for i in items:
        if i["caption"] and i["estado"] != "ok":
            i["estado"] = "ok"

    # 2. enriquecer
    if not args.sin_red:
        log("2/4 Consultando captions públicos…")
        enriquecer(items, ruta_items, args.pausa)
    ok = sum(1 for i in items if i["caption"])
    log(f"    Con texto: {ok}/{len(items)}")

    if args.sin_ia:
        ruta_guia.write_text(guia_sin_ia(items), encoding="utf-8")
        log(f"Listo (sin IA): {ruta_guia}")
        return

    if not args.proyecto:
        sys.exit("Indica al menos un --proyecto (carpeta) para que la guía sea aplicable.")
    contexto = "\n\n".join(describir_proyecto(p) for p in args.proyecto)

    # 3. analizar
    log("3/4 Analizando con Claude…")
    analisis = analizar(items, contexto, ruta_analisis, args.modelo)

    # 4. guía
    log("4/4 Redactando la guía…")
    ruta_guia.write_text(redactar_guia(analisis, contexto, args.modelo), encoding="utf-8")
    log(f"Listo: {ruta_guia}")


if __name__ == "__main__":
    main()
