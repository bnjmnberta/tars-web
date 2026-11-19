---
type: referencia
tags: [tars/producto, sub/producto-web]
aliases: [Sitio estático de TARS]
---

# TARS — sitio estático

Sitio de [[TARS]] (TARS Soluciones Digitales), hecho con HTML, CSS y JavaScript, sin pasos de compilación. La
misma portada la usa el tema de WordPress ([bnjmnberta/tars-wordpress](https://github.com/bnjmnberta/tars-wordpress)).
Publicado en [GitHub Pages](https://bnjmnberta.github.io/tars-web/) y en la Hostinger de TARS.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | La página completa |
| `css/style.css` | Estilos y aviso de cookies |
| `js/main.js`, `js/loader.js` | Animaciones (GSAP, Lenis), pila de tarjetas, pantalla de carga |
| `js/mail.js` | Formulario de Mail de la portada |
| `js/analytics.js` | Google Analytics 4, solo con consentimiento |
| `privacidad/index.html` | Política de privacidad (borrador a revisar) |
| `404.html`, `.htaccess` | Página de error, encabezados de seguridad, compresión y caché |
| `robots.txt`, `sitemap.xml` | Para buscadores; apuntan al dominio final |
| `assets/` | Logos, íconos, imagen para compartir (`og-image.jpg`), video y fuentes |

## Antes de lanzar con dominio propio

- **Dominio:** las direcciones absolutas (`canonical`, Open Graph, datos estructurados, `sitemap.xml`, `robots.txt`,
  `privacidad/`) usan `https://tarsestudio.com`. Si el dominio es otro, reemplazarlo en esos archivos.
- **Google Analytics:** poner el código `G-...` en `<meta name="tars-ga">` de `index.html`. Vacío, no mide nada ni
  muestra el aviso de cookies.
- **Formulario:** envía con FormSubmit; hay que activarlo una vez desde el mail de confirmación.
- **`robots.txt` y `sitemap.xml`:** subirlos al hosting recién cuando el dominio apunte al sitio. El dominio temporal de
  Hostinger tiene su propio `robots.txt` que bloquea a Google.
- **Cache:** al cambiar CSS o JS, subir el número `?v=` de `index.html`.

## Publicar

- **GitHub Pages:** cada push a `main` se publica solo.
- **Hostinger:** subir los archivos cambiados a `public_html` (administrador de archivos de hPanel). No usar el
  despliegue por archivo comprimido: borra todo lo demás de la carpeta.
- **Tema de WordPress:** copiar los archivos compartidos con `python tools/build.py --site ../Imagenes/web`, desde el
  repositorio del tema.

## Probar en local

```bash
python -m http.server 8420
```

Abrir `http://localhost:8420`.
