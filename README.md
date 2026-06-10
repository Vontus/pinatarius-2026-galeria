# Galería Pinatarius 2026

Galería web **completa y sin repeticiones** de las fotos de la carrera Pinatarius 2026, con visor a pantalla completa y descarga individual o en ZIP.

🔗 **[Ver la galería](https://vontus.github.io/pinatarius-2026-galeria/)**

## Por qué existe

La galería oficial (`paraisodeportivosanpedrodelpinatar.com/galeria-pinatarius-2026/`) carga las fotos mediante scroll infinito contra la API `wp-json/blema/v1/galeria-vmfo`. Esa API **ignora el parámetro `offset`**: devuelva lo que devuelva la página, cada petición responde siempre con las **mismas 20 fotos**. Por eso al hacer scroll las imágenes se repiten una y otra vez y no se ven todas.

Esta versión no usa esa API. La colección completa de la carrera está subida con nombres secuenciales `PINATARIUS-2026.N.jpg` (N = 1 … 2940, **~2900 fotos**), así que generamos las URLs directamente. Si algún número no existe, su hueco simplemente no se muestra (no hay repeticiones). La API rota solo exponía una fracción (las ~600 `variadas`); el resto de las fotos estaban ahí, solo que la galería oficial nunca llegaba a mostrarlas.

## CORS

- El **JSON de la API** no envía `Access-Control-Allow-Origin`, así que no se puede consumir desde otro dominio. No lo usamos.
- Las **imágenes** (BunnyCDN) responden con `Access-Control-Allow-Origin: *`, por lo que se pueden mostrar **y descargar** (incluido el ZIP, que se genera en el navegador con JSZip) sin ningún problema de CORS.
- La web es 100 % estática y no llama a ninguna API en tiempo de ejecución → no hay CORS que resolver.

## Funcionalidades

- Cuadrícula con ~2900 fotos, carga perezosa (lazy-load) usando miniaturas redimensionadas (150×150, ~10 KB) en vez de los originales (~600 KB).
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
