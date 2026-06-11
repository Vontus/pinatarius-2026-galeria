"use strict";

/*
 * Galería Pinatarius 2026 — todas las colecciones, categorizadas.
 *
 * La web oficial carga las fotos por scroll infinito contra una API rota
 * (wp-json/blema/v1/galeria-vmfo) que ignora offset/filtro y siempre devuelve
 * las mismas 20 fotos -> de ahí las repeticiones. Aquí no usamos esa API.
 *
 * Las fotos de la carrera están subidas en VARIAS colecciones con numeración
 * secuencial (comprobado: son fotos distintas, no se solapan). Cada colección
 * es una categoría en la UI. La lista exacta de números que existen está
 * horneada en data.js (window.PHOTO_DATA), comprobada una a una con HEAD, así
 * que la web no hace ni una sola petición fallida.
 *
 * Las imágenes del CDN responden con Access-Control-Allow-Origin: *, así que se
 * pueden mostrar y descargar (incluso en ZIP) sin problemas de CORS.
 */

const BASE = "https://paraisodeportivosanpedrodelpinatar.com/wp-content/uploads";
const pad3 = (n) => String(n).padStart(3, "0");

// Helper para construir una "fuente" (un patrón de nombre de fichero con su rango).
// Mostramos el RANGO COMPLETO min..max sin excepciones: si una foto no carga,
// el tile se queda gris y reintenta (no descartamos nada por si fue rate limit).
function source(tag, prefix, min, max, opts = {}) {
  // opts.width = nº de dígitos con ceros a la izquierda (ojo: muchas categorías
  // rellenan los números bajos, p. ej. PLAYA_PINATARIUS-0001).
  const w = opts.width || 0;
  const fmt = w ? (n) => String(n).padStart(w, "0") : (n) => String(n);
  const sep = opts.sep ?? "-"; // separador (ojo: "" es válido = número pegado)
  return {
    tag, min, max,
    full: (n) => `${BASE}/${prefix}${sep}${fmt(n)}.jpg`,
    thumb: (n) => `${BASE}/${prefix}${sep}${fmt(n)}-150x150.jpg`,
    file: (n) => `${tag}-${fmt(n)}.jpg`,
  };
}

// Categorías = carpetas de la galería oficial. Cada una puede tener VARIAS
// fuentes (patrones de nombre de fichero distintos para la misma categoría).
// `real` = nº real de fotos de esa carpeta en la galería oficial (vmfo). Lo
// usamos para los contadores; los rangos generados son algo más amplios.
const CATS = [
  { key: "barro", label: "Barro y gladiator", short: "Barro/Glad", real: 2731, sources: [
    source("p", "PINATARIUS-2026", 1, 2940, { sep: "." }),
  ]},
  { key: "meta", label: "Meta y premeta", short: "Meta", real: 2731, sources: [
    source("pm", "premeta_pinatarius", 1, 2936, { sep: "" }),
  ]},
  { key: "salida", label: "Salida", short: "Salida", real: 376, sources: [
    source("sal", "salida_pinatarius", 1, 312, { sep: "" }),
  ]},
  { key: "playa", label: "Playa", short: "Playa", real: 3043, sources: [
    source("playa", "PLAYA_PINATARIUS", 1, 2430, { width: 4 }),
    source("villa", "PINATARIUS_VILLANANITOS", 1, 553, { width: 3 }),
  ]},
  { key: "varias", label: "Varias", short: "Varias", real: 808, sources: [
    source("v", "variadas_pinatarius", 1, 619, { width: 3 }),
    source("vg", "variadas_pinatarius", 1, 126, { sep: "" }),
  ]},
  { key: "photocall", label: "Photocall y premios", short: "Photocall", real: 236, sources: [
    source("pc", "PINATARIUS_PHOTOCALL", 1, 224, { width: 3 }),
    source("pod", "podium_pinatarius", 1, 1),
  ]},
];

function buildPhotos() {
  const out = [];
  for (const cat of CATS) {
    for (const s of cat.sources) {
      for (let n = s.min; n <= s.max; n++) {
        out.push({
          id: `${s.tag}-${n}`,
          num: n,
          cat: cat.key,
          catLabel: cat.label,
          catShort: cat.short,
          full: s.full(n),
          thumb: s.thumb(n),
          file: s.file(n),
          label: `${cat.label} · #${n}`,
        });
      }
    }
  }
  return out;
}

const PHOTOS = buildPhotos();
const byId = new Map(PHOTOS.map((p) => [p.id, p]));

// --- DOM refs ---
const grid = document.getElementById("grid");
const filtersEl = document.getElementById("filters");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("search");
const downloadFavs = document.getElementById("downloadFavs");
const toastEl = document.getElementById("toast");

const lb = document.getElementById("lb");
const lbTrack = document.getElementById("lbTrack");
const lbViewport = document.getElementById("lbViewport");
// Cada slide del carrusel: miniatura borrosa (fondo) + original (encima) + recargar.
const slideEls = [...lbTrack.querySelectorAll(".lb-slide")].map((el) => ({
  el,
  thumb: el.querySelector(".lb-thumb"),
  full: el.querySelector(".lb-full"),
  reload: el.querySelector(".lb-reload"),
}));
// El zoom actúa siempre sobre la original del slide central. Al deslizar rotamos
// los elementos del carrusel (no reescribimos sus src), así que el central pasa a
// ser otro elemento: lbImg se reapunta en rotateSlides().
let lbImg = slideEls[1].full;
const lbLabel = document.getElementById("lbLabel");
const lbDownload = document.getElementById("lbDownload");
const lbClose = document.getElementById("lbClose");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbShare = document.getElementById("lbShare");
const lbFav = document.getElementById("lbFav");

// --- State ---
let currentCat = "all";
let visiblePhotos = PHOTOS.slice();
let lbIndex = -1;

// --- Favoritas (persistidas en localStorage) ---
const FAV_KEY = "pinatarius2026:favs";
let favorites = new Set();
try {
  favorites = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
} catch (e) { /* localStorage no disponible */ }

function saveFavs() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); } catch (e) {}
}

function toggleFav(id) {
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavs();
  syncFavUI(id);
  updateFavFilter();
  if (currentCat === "fav") applyFilters(); // si estamos viendo favoritas, refresca
}

// Refleja el estado de una foto en su tile y en el visor.
function syncFavUI(id) {
  const on = favorites.has(id);
  const tile = grid.querySelector(`.tile[data-id="${id}"]`);
  if (tile) {
    const fb = tile.querySelector(".fav");
    if (fb) { fb.classList.toggle("on", on); fb.textContent = on ? "★" : "☆"; }
  }
  const cur = visiblePhotos[lbIndex];
  if (cur && cur.id === id) updateLbFav();
}

function updateLbFav() {
  const cur = visiblePhotos[lbIndex];
  if (!cur) return;
  const on = favorites.has(cur.id);
  lbFav.classList.toggle("on", on);
  lbFav.setAttribute("aria-pressed", on ? "true" : "false");
  lbFav.textContent = on ? "★ Favorita" : "☆ Favorita";
}

// Total real de fotos = suma de las 7 carpetas de la galería oficial (vmfo):
// BARRO 2161 + SALIDA 376 + PLAYA 3043 + GLADIATOR 570 + VARIAS 808 +
// META Y PREMETA 2731 + PHOTOCALL Y PREMIOS 236 = 9925.
// (Generamos rangos algo más amplios; los huecos sobrantes se quedan grises.)
const TOTAL_REAL = 9925;
countEl.textContent = TOTAL_REAL.toLocaleString("es-ES");

// --- Barra de filtros (con los conteos REALES de cada carpeta) ---
function buildFilters() {
  const fmt = (n) => n.toLocaleString("es-ES");
  const defs = [{ key: "all", label: "Todas", n: TOTAL_REAL }];
  for (const c of CATS) defs.push({ key: c.key, label: c.label, n: c.real });
  // Si solo hay una categoría, no mostramos filtros.
  if (defs.length <= 2) { filtersEl.classList.add("hidden"); return; }
  filtersEl.innerHTML = "";
  for (const d of defs) {
    const b = document.createElement("button");
    b.className = "fbtn" + (d.key === currentCat ? " active" : "");
    b.dataset.cat = d.key;
    b.innerHTML = `${d.label}<span class="cnt">${fmt(d.n)}</span>`;
    b.addEventListener("click", () => setCategory(d.key));
    filtersEl.appendChild(b);
  }
  updateFavFilter(); // botón de favoritas SIEMPRE, el primero
}

// El botón "★ Favoritas" va siempre el primero (aunque haya 0; el contenido
// saldrá vacío). Solo actualizamos su contador.
function updateFavFilter() {
  let b = filtersEl.querySelector('.fbtn[data-cat="fav"]');
  if (!b) {
    b = document.createElement("button");
    b.className = "fbtn fbtn-fav" + (currentCat === "fav" ? " active" : "");
    b.dataset.cat = "fav";
    b.addEventListener("click", () => setCategory("fav"));
    filtersEl.prepend(b); // al principio de la lista
  }
  b.innerHTML = `★ Favoritas<span class="cnt">${favorites.size.toLocaleString("es-ES")}</span>`;
}

function setCategory(key) {
  currentCat = key;
  for (const b of filtersEl.children) b.classList.toggle("active", b.dataset.cat === key);
  applyFilters();
  updateQuery();
}

// Refleja solo la categoría en la URL (?cat=) para poder compartir la vista.
// La búsqueda NO va en la URL (para compartir una foto ya está el enlace #foto-).
function updateQuery() {
  const params = new URLSearchParams();
  if (currentCat !== "all") params.set("cat", currentCat);
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
}

// Vista "mixta" = varias categorías juntas (el número reinicia por categoría).
function isMixedView() {
  return currentCat === "all" || currentCat === "fav" || currentCat === "shared";
}

// --- Filtro combinado (categoría + búsqueda) ---
function applyFilters() {
  const q = searchEl.value.trim();
  visiblePhotos = PHOTOS.filter((p) => {
    if (currentCat === "fav") { if (!favorites.has(p.id)) return false; }
    else if (currentCat !== "all" && p.cat !== currentCat) return false;
    if (q === "") return true;
    // Coincidencia EXACTA: "32" muestra solo la #32 (no 320, 321, 323...).
    if (/^\d+$/.test(q)) return p.num === parseInt(q, 10);
    return false;
  });
  emptyEl.textContent = currentCat === "fav"
    ? "Aún no tienes favoritas. Marca fotos con la ★."
    : "No hay fotos que coincidan.";
  renderGrid(visiblePhotos);
}

searchEl.addEventListener("input", applyFilters);

// --- Carga de miniaturas: cola con límite de concurrencia + cancelación ---
//
// En vez de disparar la carga de cada tile en cuanto roza la pantalla (lo que
// hacía que un scroll rápido cargara TODAS), llevamos una cola:
//  - Solo se cargan las que están realmente en vista.
//  - Como mucho MAX_CONCURRENT a la vez.
//  - Hay un pequeño "settle": si sigues haciendo scroll, no se empieza a cargar
//    hasta que la cosa se calma un poco.
//  - Si una imagen sale de pantalla antes de terminar, se ABORTA su descarga.
const MAX_CONCURRENT = 5;
const SETTLE_MS = 100;
const inView = new Set();   // <img> actualmente en pantalla
const loading = new Set();  // <img> con descarga en curso
let pumpTimer = null;

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const img = e.target;
    if (e.isIntersecting) {
      inView.add(img);
      // Si antes falló (quizá rate limit), permitimos reintentar al volver a verlo.
      if (img.dataset.err === "1") img.dataset.err = "";
    } else {
      inView.delete(img);
      cancelLoad(img); // salió de pantalla: abortamos si estaba cargando
    }
  }
  schedulePump();
}, { rootMargin: "150px 0px" });

function schedulePump() {
  if (pumpTimer !== null) return;
  pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, SETTLE_MS);
}

function pump() {
  for (const img of inView) {
    if (loading.size >= MAX_CONCURRENT) break;
    if (img.dataset.loaded === "1" || img.dataset.err === "1" || loading.has(img)) continue;
    beginLoad(img);
  }
}

function beginLoad(img) {
  loading.add(img);
  img.src = img.dataset.thumb; // SOLO miniatura (nunca la original, para no saturar)
}

function cancelLoad(img) {
  if (loading.has(img) && img.dataset.loaded !== "1") {
    loading.delete(img);
    img.removeAttribute("src"); // aborta la petición en curso
    img.classList.remove("loaded");
  }
}

function resetLoader() {
  io.disconnect();
  inView.clear();
  loading.clear();
  if (pumpTimer !== null) { clearTimeout(pumpTimer); pumpTimer = null; }
}

function makeTile(photo) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.id = photo.id;

  const img = document.createElement("img");
  img.alt = photo.label;
  img.decoding = "async";
  img.dataset.thumb = photo.thumb;
  img.addEventListener("load", () => {
    img.dataset.loaded = "1";
    img.dataset.err = "";
    img.dataset.manualRetry = "";
    loading.delete(img);
    img.classList.add("loaded");
    tile.classList.remove("errored");
    pump(); // hueco libre: seguimos con la siguiente
  });
  img.addEventListener("error", () => {
    if (!img.getAttribute("src")) return; // src vacío = cancelada, no es error
    loading.delete(img);
    // Solo miniaturas: si falla (p. ej. rate limit), marcamos el tile y mostramos
    // un botón de recarga. También se reintenta al volver a entrar en pantalla.
    img.dataset.err = "1";
    tile.classList.add("errored");
    // Si el fallo es tras pulsar "recargar" a mano, avisamos: quizá no existe.
    if (img.dataset.manualRetry === "1") {
      img.dataset.manualRetry = "";
      toast(`Foto #${photo.num}: es posible que esta imagen no exista.`);
    }
    pump();
  });

  const num = document.createElement("span");
  num.className = "num";
  // En vistas mixtas (Todas/Favoritas/Compartidas) mostramos la categoría, porque
  // el número reinicia en cada una; en una categoría concreta basta con #N.
  num.textContent = isMixedView() ? `${photo.catShort} · ${photo.num}` : `#${photo.num}`;

  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "reload";
  reload.title = "Reintentar";
  reload.textContent = "↻";
  reload.setAttribute("aria-label", "Reintentar cargar la imagen");
  reload.addEventListener("click", (e) => {
    e.stopPropagation(); // no abrir el visor
    tile.classList.remove("errored");
    img.dataset.err = "";
    img.dataset.manualRetry = "1"; // si vuelve a fallar, avisamos
    if (inView.has(img)) beginLoad(img); else pump();
  });

  const fav = document.createElement("button");
  fav.type = "button";
  fav.className = "fav" + (favorites.has(photo.id) ? " on" : "");
  fav.textContent = favorites.has(photo.id) ? "★" : "☆";
  fav.setAttribute("aria-label", "Marcar como favorita");
  fav.addEventListener("click", (e) => {
    e.stopPropagation(); // no abrir el visor al marcar
    toggleFav(photo.id);
  });

  tile.append(img, num, fav, reload);
  io.observe(img);

  tile.addEventListener("click", () => openLightbox(photo.id));
  return tile;
}

// Renderizado incremental: en vez de crear ~10.000 nodos de golpe (lo que
// congelaba al pulsar "Todas"), pintamos por lotes y añadimos más al acercarse
// al final mediante un "sentinel".
const RENDER_BATCH = 400;
let renderList = [];
let rendered = 0;

const sentinel = document.createElement("div");
sentinel.id = "gridSentinel";
grid.after(sentinel);

const appendIO = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) appendBatch();
}, { rootMargin: "1200px 0px" });
appendIO.observe(sentinel);

function appendBatch() {
  if (rendered >= renderList.length) return;
  const end = Math.min(rendered + RENDER_BATCH, renderList.length);
  const frag = document.createDocumentFragment();
  for (let i = rendered; i < end; i++) frag.appendChild(makeTile(renderList[i]));
  grid.appendChild(frag);
  rendered = end;
}

function renderGrid(list) {
  resetLoader();
  grid.innerHTML = "";
  renderList = list;
  rendered = 0;
  emptyEl.classList.toggle("hidden", list.length > 0);
  appendBatch(); // primer lote; el resto se añade al hacer scroll
}

// --- Estado inicial desde la URL (?cat=) ---
(function initFromQuery() {
  const params = new URLSearchParams(location.search);
  const cat = params.get("cat");
  if (cat && (cat === "fav" || CATS.some((c) => c.key === cat))) currentCat = cat;
})();

buildFilters();
applyFilters();

// --- Toast ---
let toastTimer = null;
function toast(msg, persist = false) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  if (!persist) toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 3000);
}
function hideToast() {
  toastEl.classList.add("hidden");
}

// --- Descargas ---
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function downloadOne(photo) {
  try {
    const res = await fetch(photo.full, { mode: "cors" });
    if (!res.ok) throw new Error(res.status);
    triggerDownload(await res.blob(), photo.file);
  } catch (e) {
    window.open(photo.full, "_blank");
  }
}

// --- Descargar favoritas (ZIP) ---
downloadFavs.addEventListener("click", async () => {
  const ids = [...favorites];
  if (ids.length === 0) {
    toast("No tienes favoritas. Marca fotos con la ★ y vuelve a intentarlo.");
    return;
  }
  if (typeof JSZip === "undefined") {
    toast("No se pudo cargar el compresor ZIP. Reintenta.");
    return;
  }
  downloadFavs.disabled = true;
  const zip = new JSZip();
  let done = 0;
  let failed = 0;

  const BATCH = 6;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    await Promise.all(chunk.map(async (id) => {
      const photo = byId.get(id);
      try {
        const res = await fetch(photo.full, { mode: "cors" });
        if (!res.ok) throw new Error(res.status);
        zip.file(photo.file, await res.blob());
      } catch (e) {
        failed++;
      } finally {
        done++;
        toast(`Preparando ZIP… ${done}/${ids.length}`, true);
      }
    }));
  }

  toast("Comprimiendo…", true);
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `pinatarius-2026-favoritas-${ids.length}.zip`);
  hideToast();
  toast(failed ? `ZIP listo (${failed} fotos no se pudieron incluir).` : "Favoritas descargadas.");
  downloadFavs.disabled = false;
});

// --- Lightbox + deep-linking por hash (#foto-ID) ---
let suppressHash = false;

function setHash(value) {
  suppressHash = true;
  if (value) location.hash = value;
  else history.replaceState(null, "", location.pathname + location.search);
  setTimeout(() => { suppressHash = false; }, 0);
}

function openLightbox(id) {
  const photo = byId.get(id);
  if (!photo) return;
  let idx = visiblePhotos.findIndex((p) => p.id === id);
  if (idx < 0) { visiblePhotos = PHOTOS.slice(); idx = visiblePhotos.findIndex((p) => p.id === id); }
  lbIndex = idx;
  showLightbox();
  lb.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setHash(`foto-${id}`);
  maybeSwipeHint();
}

// Pista de swipe la primera vez en móvil (para que se sepa que se puede deslizar).
const HINT_KEY = "pinatarius2026:swipehint";
const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
function maybeSwipeHint() {
  if (!isCoarse) return;
  try {
    if (localStorage.getItem(HINT_KEY) === "1") return;
    localStorage.setItem(HINT_KEY, "1");
  } catch (e) {}
  toast("Desliza ← → para cambiar de foto · pellizca para ampliar");
}

function photoAt(i) {
  const n = visiblePhotos.length;
  return n ? visiblePhotos[((i % n) + n) % n] : null;
}

// --- Precarga persistente de la ventana (anterior/actual/siguiente) ---
// Objetos Image() independientes del carrusel que mantienen vivas las descargas.
// Como persisten entre swipes, la foto a la que navegas NO se reinicia: su
// descarga sigue en curso y el <img> del carrusel se engancha a ella (o a la
// caché si ya terminó), en vez de empezar de cero. Clave en conexiones lentas.
const preloaders = new Map(); // url -> Image
let winCurUrl = null, winPrevUrl = null, winNextUrl = null;
function startPreload(url) {
  if (!url || preloaders.has(url)) return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  preloaders.set(url, img);
}
// Ajusta qué se está precargando: arranca la actual (y, si withNeighbors, los
// lados) y aborta lo que ya quedó fuera de la ventana. Las URLs que siguen en la
// ventana (p. ej. la foto a la que acabas de deslizar) se mantienen intactas.
function setPreloadWindow(withNeighbors) {
  const win = [winCurUrl, winPrevUrl, winNextUrl].filter(Boolean);
  for (const [url, img] of preloaders) {
    if (!win.includes(url)) { img.removeAttribute("src"); preloaders.delete(url); }
  }
  startPreload(winCurUrl);
  if (withNeighbors) { startPreload(winPrevUrl); startPreload(winNextUrl); }
}
function clearPreloads() {
  for (const [, img] of preloaders) img.removeAttribute("src");
  preloaders.clear();
  winCurUrl = winPrevUrl = winNextUrl = null;
}

// Pone una foto en un slide: miniatura borrosa al instante + original que se
// funde encima al cargar (blur-up). La original va oculta hasta cargar, así que
// nunca se ve la foto anterior aunque la nueva tarde.
// Con deferFull la miniatura carga ya pero la original queda pendiente: solo se
// guarda su URL en dataset.src y la dispara después flushNeighborFulls().
function setSlide(slide, photo, deferFull) {
  slide.el.classList.remove("errored");
  if (!photo) { slide.thumb.removeAttribute("src"); slide.full.removeAttribute("src"); slide.full.classList.remove("shown"); return; }
  if (slide.thumb.dataset.src !== photo.thumb) {
    slide.thumb.dataset.src = photo.thumb;
    slide.thumb.src = photo.thumb;
  }
  if (slide.full.dataset.src !== photo.full) {
    // "instant" oculta la original anterior sin fundido de salida (si no, se vería
    // la foto de la que vienes mientras la nueva aún no ha cargado).
    slide.full.classList.add("instant");
    slide.full.classList.remove("shown");
    slide.full.dataset.manualRetry = "";
    slide.full.dataset.src = photo.full;
    if (deferFull) slide.full.removeAttribute("src");
    else slide.full.src = photo.full;
  }
  // si ya estaba cargada (cacheada), muéstrala ya
  if (slide.full.complete && slide.full.naturalWidth) slide.full.classList.add("shown");
}

// Carga las originales aplazadas de los slides laterales (URL ya en dataset.src
// pero sin src). Las que sigan estando vacías arrancan ahora su descarga.
function flushNeighborFulls() {
  for (const s of [slideEls[0], slideEls[2]]) {
    const want = s.full.dataset.src;
    if (want && s.full.getAttribute("src") !== want) s.full.src = want;
  }
}

// Tras abrir/cambiar de foto, espera a que la original actual cargue (o un
// margen) antes de descargar anterior/siguiente, para que la foto que se abre
// no compita por ancho de banda y aparezca cuanto antes.
let neighborTimer = null;
let neighborFlush = null;
function scheduleNeighborFulls() {
  const curFull = slideEls[1].full;
  clearTimeout(neighborTimer);
  if (neighborFlush) curFull.removeEventListener("load", neighborFlush);
  const flush = () => {
    clearTimeout(neighborTimer);
    curFull.removeEventListener("load", flush);
    neighborFlush = null;
    flushNeighborFulls();
    setPreloadWindow(true); // ya cargó la actual: precarga también los lados
  };
  neighborFlush = flush;
  if (curFull.complete && curFull.naturalWidth) { flush(); return; }
  curFull.addEventListener("load", flush);
  // Por si la actual falla o tarda demasiado, no dejamos los lados sin precargar.
  neighborTimer = setTimeout(flush, 2500);
}

// Coloca anterior/actual/siguiente en los 3 slides del carrusel. La foto actual
// se descarga primero y sola; las originales de los lados quedan aplazadas.
function assignSlides() {
  const cur = visiblePhotos[lbIndex];
  if (!cur) return;
  const prev = photoAt(lbIndex - 1), next = photoAt(lbIndex + 1);
  winCurUrl = cur.full;
  winPrevUrl = prev ? prev.full : null;
  winNextUrl = next ? next.full : null;
  setSlide(slideEls[1], cur);
  setSlide(slideEls[0], prev, true);
  setSlide(slideEls[2], next, true);
  lbImg.alt = cur.label;
  // Arranca solo la actual; mantiene viva la foto a la que navegas (sin reinicio)
  // y suelta la que quedó fuera de la ventana.
  setPreloadWindow(false);
  scheduleNeighborFulls();
}

// Handlers de carga/error/recarga de cada slide (una sola vez).
for (const slide of slideEls) {
  slide.full.addEventListener("load", () => {
    slide.el.classList.remove("errored");
    // Restaura la transición y fuerza un reflow para que el fundido de entrada
    // (blur-up) se reproduzca al aparecer la nueva original.
    slide.full.classList.remove("instant");
    void slide.full.offsetWidth;
    slide.full.classList.add("shown");
    slide.full.dataset.manualRetry = "";
  });
  slide.full.addEventListener("error", () => {
    if (!slide.full.getAttribute("src")) return; // limpiado a propósito
    slide.el.classList.add("errored");
    // Si vuelve a fallar tras pulsar "Reintentar", avisamos: quizá no existe.
    if (slide.full.dataset.manualRetry === "1") {
      slide.full.dataset.manualRetry = "";
      toast("Es posible que esta imagen no exista.");
    }
  });
  slide.reload.addEventListener("click", (e) => {
    e.stopPropagation();
    slide.el.classList.remove("errored");
    slide.full.classList.remove("shown");
    slide.full.dataset.manualRetry = "1"; // si vuelve a fallar, avisamos
    const f = slide.full.dataset.src, t = slide.thumb.dataset.src;
    // forzamos recarga reasignando el src
    if (t) { slide.thumb.src = ""; slide.thumb.src = t; }
    if (f) { slide.full.src = ""; slide.full.src = f; }
  });
}

// El track mide 300% (3 slides). Centrar el del medio = -33.3333% de su ancho.
const TRACK_CENTER = -100 / 3;
function trackReset() {
  lbTrack.style.transition = "none";
  lbTrack.style.transform = `translateX(${TRACK_CENTER}%)`;
}

// Al deslizar rotamos los 3 elementos del carrusel en lugar de reescribir sus
// src: el slide vecino que ya estabas viendo (con su imagen cargada) pasa a ser
// el central, y solo el que entra por el lado opuesto recibe foto nueva (y está
// fuera de pantalla). Así la foto a la que navegas no se vuelve a montar ni
// reparpadea. El movimiento de nodo + el trackReset que viene después son
// síncronos, así que el elemento que veías sigue centrado sin salto visual.
function rotateSlides(delta) {
  if (delta > 0) {        // siguiente: el primero pasa al final
    lbTrack.appendChild(slideEls[0].el);
    slideEls.push(slideEls.shift());
  } else if (delta < 0) { // anterior: el último pasa al principio
    lbTrack.insertBefore(slideEls[2].el, slideEls[0].el);
    slideEls.unshift(slideEls.pop());
  }
  lbImg = slideEls[1].full; // el zoom apunta siempre al slide central
}

function showLightbox() {
  const photo = visiblePhotos[lbIndex];
  if (!photo) return;
  resetZoom();
  trackReset();
  assignSlides();
  lbLabel.textContent = `${photo.label} · ${(lbIndex + 1).toLocaleString("es-ES")} de ${visiblePhotos.length.toLocaleString("es-ES")}`;
  lbDownload.href = photo.full;
  lbDownload.download = photo.file;
  updateLbFav();
}

// Desliza el carrusel a la siguiente (delta=1) o anterior (delta=-1) con animación.
function commitSlide(delta) {
  if (swAnimating || visiblePhotos.length < 2) return;
  swAnimating = true;
  // siguiente -> -66.66% (muestra el 3º), anterior -> 0% (muestra el 1º)
  const targetX = TRACK_CENTER - delta * (100 / 3);
  lbTrack.style.transition = "transform 0.2s ease-out";
  lbTrack.style.transform = `translateX(${targetX}%)`;
  const onEnd = () => {
    lbTrack.removeEventListener("transitionend", onEnd);
    resetZoom(); // limpia el zoom del slide central que sale
    lbIndex = (lbIndex + delta + visiblePhotos.length) % visiblePhotos.length;
    rotateSlides(delta); // el vecino ya cargado pasa a central (sin reescribir su src)
    showLightbox(); // recoloca el track (sin animación) y rellena solo el slide que entra
    swAnimating = false;
    const photo = visiblePhotos[lbIndex];
    if (photo) setHash(`foto-${photo.id}`);
  };
  lbTrack.addEventListener("transitionend", onEnd);
}

lbFav.addEventListener("click", () => {
  const photo = visiblePhotos[lbIndex];
  if (photo) toggleFav(photo.id);
});

function closeLightbox() {
  lb.classList.add("hidden");
  document.body.style.overflow = "";
  lbIndex = -1;
  resetZoom();
  clearPreloads();
  setHash("");
}

// --- Zoom del visor (rueda en escritorio, pellizco/doble-tap en móvil) ---
let zScale = 1, zx = 0, zy = 0;
const Z_MAX = 5;

function applyZoom() {
  lbImg.style.transform = `translate(${zx}px, ${zy}px) scale(${zScale})`;
  lbImg.style.cursor = zScale > 1 ? "grab" : "";
  lbImg.classList.toggle("zoomed", zScale > 1);
}
function resetZoom() {
  zScale = 1; zx = 0; zy = 0;
  lbImg.style.transform = "";
  lbImg.style.transformOrigin = "";
  lbImg.style.transition = "";
  lbImg.style.cursor = "";
  lbImg.classList.remove("zoomed");
}
function clampZoom() {
  if (zScale <= 1) { zx = 0; zy = 0; return; }
  // límite de paneo para no sacar la imagen de la pantalla. Usamos el viewport
  // (sin transformar) × escala, así no depende del rect animándose de lbImg.
  const r = lbViewport.getBoundingClientRect();
  const maxX = r.width * zScale * 0.5;
  const maxY = r.height * zScale * 0.5;
  zx = Math.max(-maxX, Math.min(maxX, zx));
  zy = Math.max(-maxY, Math.min(maxY, zy));
}

// Aplica un nuevo nivel de zoom manteniendo fijo bajo el cursor el punto de la
// imagen (en vez de ampliar desde el centro). Mantiene transform-origin en el
// centro y ajusta la traslación con la fórmula de "zoom hacia un punto".
function zoomTo(newScale, clientX, clientY) {
  const r = lbViewport.getBoundingClientRect();
  const ux = clientX - (r.left + r.width / 2);  // cursor respecto al centro
  const uy = clientY - (r.top + r.height / 2);
  const prev = zScale;
  zScale = Math.max(1, Math.min(Z_MAX, newScale));
  const ratio = zScale / prev;
  zx = ux - ratio * (ux - zx);
  zy = uy - ratio * (uy - zy);
  clampZoom();
  applyZoom();
}

// Rueda del ratón / trackpad (escritorio): zoom proporcional al desplazamiento
// (suave, sin saltos) y hacia el cursor.
let wheelIdle = null;
lbViewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  // normaliza el delta entre ratón (líneas/páginas) y trackpad (píxeles)
  let d = e.deltaY;
  if (e.deltaMode === 1) d *= 16;                  // líneas -> px aprox.
  else if (e.deltaMode === 2) d *= window.innerHeight; // páginas
  // Paso proporcional al desplazamiento pero topado por evento (~9%): el ratón
  // (deltas grandes) llega siempre al tope; el trackpad (deltas pequeños pero
  // muchos eventos) acumula rápido. Topamos el factor, no el delta, porque si
  // se recorta el delta el trackpad se queda corto y va lentísimo.
  let factor = Math.exp(-d * 0.01);
  factor = Math.max(0.914, Math.min(1.094, factor));
  // transición corta para suavizar los pasos discretos de la rueda
  lbImg.style.transition = "transform 0.12s ease-out";
  zoomTo(zScale * factor, e.clientX, e.clientY);
  // al dejar de hacer scroll, quita la transición para que arrastrar sea directo
  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => { lbImg.style.transition = ""; }, 140);
}, { passive: false });

// Doble clic (escritorio): alterna zoom, hacia el cursor, con animación.
lbViewport.addEventListener("dblclick", (e) => {
  lbImg.style.transition = "transform 0.18s ease-out";
  if (zScale > 1) { zScale = 1; zx = 0; zy = 0; applyZoom(); }
  else { zoomTo(2.5, e.clientX, e.clientY); }
});

// Arrastre para mover (escritorio con ratón cuando hay zoom)
let dragging = false, dragStartX = 0, dragStartY = 0, dragBaseX = 0, dragBaseY = 0;
lbViewport.addEventListener("mousedown", (e) => {
  if (zScale <= 1) return;
  e.preventDefault();
  dragging = true; dragStartX = e.clientX; dragStartY = e.clientY; dragBaseX = zx; dragBaseY = zy;
  lbImg.style.transition = "none"; // arrastre directo, sin lag de la transición de la rueda
  lbImg.style.cursor = "grabbing";
});
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  zx = dragBaseX + (e.clientX - dragStartX);
  zy = dragBaseY + (e.clientY - dragStartY);
  clampZoom(); applyZoom();
});
window.addEventListener("mouseup", () => { if (dragging) { dragging = false; lbImg.style.cursor = "grab"; } });

// Táctil: pellizco para ampliar en modo "peek" (estilo Instagram). Al soltar
// los dedos, la imagen vuelve sola a su tamaño con una pequeña animación.
let pinchDist = 0, midStartX = 0, midStartY = 0, baseTx = 0, baseTy = 0, pinching = false;
function dist(t) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}
function mid(t) {
  return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
}
lbViewport.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    pinching = true;
    pinchDist = dist(e.touches);
    const m = mid(e.touches);
    midStartX = m.x; midStartY = m.y; baseTx = 0; baseTy = 0;
    // Origen del zoom = punto entre los dedos (para ampliar desde ahí, no del centro).
    const r = lbImg.getBoundingClientRect();
    const ox = Math.max(0, Math.min(100, ((m.x - r.left) / r.width) * 100));
    const oy = Math.max(0, Math.min(100, ((m.y - r.top) / r.height) * 100));
    lbImg.style.transformOrigin = `${ox}% ${oy}%`;
    lbImg.style.transition = "none";
  }
}, { passive: true });
lbViewport.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && pinching) {
    e.preventDefault();
    zScale = Math.max(1, Math.min(Z_MAX, dist(e.touches) / pinchDist));
    const m = mid(e.touches);
    zx = baseTx + (m.x - midStartX);
    zy = baseTy + (m.y - midStartY);
    applyZoom();
  }
}, { passive: false });
function endPinch() {
  if (!pinching) return;
  pinching = false;
  lbImg.style.transition = "transform 0.2s ease-out";
  zScale = 1; zx = 0; zy = 0;
  applyZoom(); // anima de vuelta a tamaño normal (sobre el mismo origen)
  setTimeout(() => {
    lbImg.style.transition = "";
    lbImg.style.transform = "";
    lbImg.style.transformOrigin = "";
    lbImg.classList.remove("zoomed");
  }, 220);
}
lbViewport.addEventListener("touchend", (e) => { if (e.touches.length < 2) endPinch(); });
lbViewport.addEventListener("touchcancel", endPinch);

function step(delta) {
  if (lbIndex < 0) return;
  commitSlide(delta);
}

function syncFromHash() {
  if (suppressHash) return;
  const m = /^#foto-([a-z]+-\d+)$/.exec(location.hash);
  if (m && byId.has(m[1])) { openLightbox(m[1]); return; }
  if (!lb.classList.contains("hidden")) closeLightbox();
}
window.addEventListener("hashchange", syncFromHash);

lbClose.addEventListener("click", closeLightbox);
lbPrev.addEventListener("click", () => step(-1));
lbNext.addEventListener("click", () => step(1));
lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });

lbDownload.addEventListener("click", (e) => {
  e.preventDefault();
  const photo = visiblePhotos[lbIndex];
  if (photo) downloadOne(photo);
});

lbShare.addEventListener("click", async () => {
  const photo = visiblePhotos[lbIndex];
  if (!photo) return;
  const url = `${location.origin}${location.pathname}#foto-${photo.id}`;
  try {
    if (navigator.share) await navigator.share({ title: `${photo.label} · Pinatarius 2026`, url });
    else { await navigator.clipboard.writeText(url); toast("Enlace copiado al portapapeles"); }
  } catch (e) { /* cancelado */ }
});

document.addEventListener("keydown", (e) => {
  if (lb.classList.contains("hidden")) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});

// Swipe en móvil: arrastramos el carrusel (track) y desliza a la foto vecina.
let swiping = false, swStartX = 0, swDx = 0, swAnimating = false;
const SW_THRESHOLD = 60;

lb.addEventListener("touchstart", (e) => {
  if (swAnimating || zScale > 1 || pinching || e.touches.length !== 1) { swiping = false; return; }
  swiping = true; swStartX = e.touches[0].clientX; swDx = 0;
  lbTrack.style.transition = "none";
}, { passive: true });

lb.addEventListener("touchmove", (e) => {
  if (!swiping || pinching || zScale > 1 || e.touches.length !== 1) return;
  swDx = e.touches[0].clientX - swStartX;
  lbTrack.style.transform = `translateX(calc(${TRACK_CENTER}% + ${swDx}px))`;
}, { passive: true });

lb.addEventListener("touchend", () => {
  if (!swiping) return;
  swiping = false;
  if (Math.abs(swDx) > SW_THRESHOLD) commitSlide(swDx < 0 ? 1 : -1);
  else { // no llega al umbral: vuelve a centrar
    lbTrack.style.transition = "transform 0.2s ease-out";
    lbTrack.style.transform = `translateX(${TRACK_CENTER}%)`;
  }
});

// --- Botón "volver arriba" ---
const toTop = document.getElementById("toTop");
let toTopRaf = null;

window.addEventListener("scroll", () => {
  if (toTopRaf !== null) return;
  toTopRaf = requestAnimationFrame(() => {
    toTopRaf = null;
    toTop.classList.toggle("hidden", window.scrollY < 600);
  });
}, { passive: true });

toTop.addEventListener("click", () => {
  // 'auto' = salto inmediato: no atravesamos la rejilla cargando miniaturas.
  window.scrollTo({ top: 0, behavior: "auto" });
});

// --- Alturas reales de footer y cabecera (para huecos y para el selector sticky) ---
const footerEl = document.querySelector(".footer");
const topbarEl = document.querySelector(".topbar");
function setBarHeights() {
  if (footerEl) document.documentElement.style.setProperty("--footer-h", `${footerEl.offsetHeight}px`);
  if (topbarEl) document.documentElement.style.setProperty("--topbar-h", `${topbarEl.offsetHeight}px`);
}
setBarHeights();
window.addEventListener("resize", () => requestAnimationFrame(setBarHeights));

// Si la URL trae #foto-ID al cargar, abrimos esa foto (enlace compartido).
syncFromHash();
