# Galería Pinatarius 2026

Galería web **completa y sin repeticiones** de las fotos de la carrera Pinatarius 2026, con visor a pantalla completa y descarga individual o en ZIP.

🔗 **[Ver la galería](#)** _(URL de GitHub Pages tras el despliegue)_

## Por qué existe

La galería oficial (`paraisodeportivosanpedrodelpinatar.com/galeria-pinatarius-2026/`) carga las fotos mediante scroll infinito contra la API `wp-json/blema/v1/galeria-vmfo`. Esa API **ignora el parámetro `offset`**: devuelva lo que devuelva la página, cada petición responde siempre con las **mismas 20 fotos**. Por eso al hacer scroll las imágenes se repiten una y otra vez y no se ven todas.

Esta versión no usa esa API. Los ficheros del servidor están numerados de forma secuencial (`variadas_pinatarius-N.jpg`), así que generamos las URLs directamente y mostramos las **517 fotos** reales (números 100–619, salvo los huecos 251, 252 y 482 que no existen en el servidor).

## CORS

- El **JSON de la API** no envía `Access-Control-Allow-Origin`, así que no se puede consumir desde otro dominio. No lo usamos.
- Las **imágenes** (BunnyCDN) responden con `Access-Control-Allow-Origin: *`, por lo que se pueden mostrar **y descargar** (incluido el ZIP, que se genera en el navegador con JSZip) sin ningún problema de CORS.
- La web es 100 % estática y no llama a ninguna API en tiempo de ejecución → no hay CORS que resolver.

## Funcionalidades

- Cuadrícula con las 517 fotos, carga perezosa (lazy-load).
- Buscador por número de foto.
- Visor (lightbox) con navegación por teclado (← →), swipe en móvil y botón de descarga.
- Modo selección múltiple → **descargar varias fotos en un ZIP**.
- Tolerante a fallos: si una foto no existe, su hueco se oculta.

## Uso local

Al ser estático, basta con servirlo:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Despliegue

Se publica con **GitHub Pages** desde la rama `main` (carpeta raíz).

## Aviso

Las imágenes son propiedad de sus autores y se sirven desde el dominio original. Esta galería solo facilita su visualización y descarga.
