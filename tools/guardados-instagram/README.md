# Guardados de Instagram → guía de implementación

Script (`guardados_a_guia.py`, Python 3.9+, sin dependencias) que lee tus guardados de
Instagram y genera `guia_guardados.md` con quick wins, plan por fases y pasos para aplicar
cada idea a tus proyectos.

## 1. Descargar tus guardados (una vez)

Instagram no tiene API para "Guardados"; se usa la exportación oficial:

**Configuración → Centro de cuentas → Tu información y permisos → Descargar tu información**
→ *Exportar a dispositivo* → **formato JSON** → marca solo **Guardados** → descarga el ZIP.

## 2. Ejecutar

```bash
export ANTHROPIC_API_KEY=sk-ant-...
python3 tools/guardados-instagram/guardados_a_guia.py ~/Descargas/instagram-export.zip \
    --proyecto . --proyecto ~/otro-proyecto
```

Resultados en `salida-guardados/`: `guardados.json`, `analisis.json`, `guia_guardados.md`.

- Es **reanudable**: si lo vuelves a correr solo procesa lo nuevo (sin ZIP usa `guardados.json`).
- **Captions**: el script intenta leer el texto público de cada post. Instagram suele bloquearlo
  tras unas decenas; si pasa, abre `guardados.json`, pega el texto en `"caption"` de los posts
  que te importen y vuelve a ejecutar con `--sin-red`. Sin texto, el post va a "Para revisar a mano".
- `--sin-ia`: solo lista y agrupa por colección, sin llamar a Claude.
- `--modelo`: cambia el modelo (por defecto `claude-sonnet-5-5`).

No subas el export ni `salida-guardados/` al repo: contiene datos personales.
