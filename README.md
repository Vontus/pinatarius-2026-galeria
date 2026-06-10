# Galería Pinatarius 2026

Galería web **completa y sin repeticiones** de las fotos de la carrera Pinatarius 2026, con visor a pantalla completa y descarga individual o en ZIP.

🔗 **[Ver la galería](https://vontus.github.io/pinatarius-2026-galeria/)**

## Por qué existe

La galería oficial (`paraisodeportivosanpedrodelpinatar.com/galeria-pinatarius-2026/`) carga las fotos mediante scroll infinito contra la API `wp-json/blema/v1/galeria-vmfo`. Esa API **ignora el parámetro `offset`**: devuelva lo que devuelva la página, cada petición responde siempre con las **mismas 20 fotos**. Por eso al hacer scroll las imágenes se repiten una y otra vez y no se ven todas.

Esta versión no usa esa API. Las fotos de la carrera están subidas en **varias colecciones distintas** (comprobado por hash: son fotos diferentes, no se solapan), cada una con numeración secuencial. Cada colección es una **categoría** en la galería:

| Categoría | Fichero | Fotos |
|---|---|---|
| General | `PINATARIUS-2026.N.jpg` | 2732 |
| Varias | `variadas_pinatarius-NNN.jpg` | 616 |
| Playa | `PLAYA_PINATARIUS-N.jpg` | 1431 |
| Villananitos | `PINATARIUS_VILLANANITOS-N.jpg` | 454 |
| Podium | `podium_pinatarius-N.jpg` | 1 |
| **Total** | | **5234** |

La lista exacta de números que existen está horneada en `data.js` (comprobada una a una con HEAD), así que la web **no hace ni una sola petición fallida** y no hay repeticiones. La API rota de la web oficial solo llegaba a exponer una fracción de las `variadas`; el resto de las fotos estaban ahí, pero la galería nunca las mostraba.

## CORS

- El **JSON de la API** no envía `Access-Control-Allow-Origin`, así que no se puede consumir desde otro dominio. No lo usamos.
- Las **imágenes** (BunnyCDN) responden con `Access-Control-Allow-Origin: *`, por lo que se pueden mostrar **y descargar** (incluido el ZIP, que se genera en el navegador con JSZip) sin ningún problema de CORS.
- La web es 100 % estática y no llama a ninguna API en tiempo de ejecución → no hay CORS que resolver.

## Funcionalidades

- Cuadrícula con ~5200 fotos en categorías (General, Varias, Playa, Villananitos, Podium), carga perezosa (lazy-load) usando miniaturas redimensionadas (150×150, ~10 KB) en vez de los originales (~600 KB).
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
