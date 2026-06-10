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
  { key: "barro", label: "Barro y gladiator", real: 2731, sources: [
    source("p", "PINATARIUS-2026", 1, 2940, { sep: "." }),
  ]},
  { key: "meta", label: "Meta y premeta", real: 2731, sources: [
    source("pm", "premeta_pinatarius", 1, 2936, { sep: "" }),
  ]},
  { key: "salida", label: "Salida", real: 376, sources: [
    source("sal", "salida_pinatarius", 1, 312, { sep: "" }),
  ]},
  { key: "playa", label: "Playa", real: 3043, sources: [
    source("playa", "PLAYA_PINATARIUS", 1, 2430, { width: 4 }),
    source("villa", "PINATARIUS_VILLANANITOS", 1, 553, { width: 3 }),
  ]},
  { key: "varias", label: "Varias", real: 808, sources: [
    source("v", "variadas_pinatarius", 1, 619, { width: 3 }),
    source("vg", "variadas_pinatarius", 1, 126, { sep: "" }),
  ]},
  { key: "photocall", label: "Photocall y premios", real: 236, sources: [
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
const lbImg = document.getElementById("lbImg");
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
  updateFavFilter(); // botón de favoritas SIEMPRE, al final
}

// El botón "★ Favoritas" va siempre el último (aunque haya 0; el contenido
// saldrá vacío). Solo actualizamos su contador.
function updateFavFilter() {
  let b = filtersEl.querySelector('.fbtn[data-cat="fav"]');
  if (!b) {
    b = document.createElement("button");
    b.className = "fbtn fbtn-fav" + (currentCat === "fav" ? " active" : "");
    b.dataset.cat = "fav";
    b.addEventListener("click", () => setCategory("fav"));
    filtersEl.appendChild(b);
  }
  b.innerHTML = `★ Favoritas<span class="cnt">${favorites.size.toLocaleString("es-ES")}</span>`;
}

function setCategory(key) {
  currentCat = key;
  for (const b of filtersEl.children) b.classList.toggle("active", b.dataset.cat === key);
  applyFilters();
  updateQuery();
}

// Refleja categoría y búsqueda en la URL (?cat=&q=) para poder compartir la vista.
function updateQuery() {
  const params = new URLSearchParams();
  if (currentCat !== "all") params.set("cat", currentCat);
  const q = searchEl.value.trim();
  if (q) params.set("q", q);
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
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

searchEl.addEventListener("input", () => { applyFilters(); updateQuery(); });

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
      if (img.dataset.err === "1") { img.dataset.err = ""; img.dataset.fallback = ""; }
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
  img.src = img.dataset.fallback === "1" ? img.dataset.full : img.dataset.thumb;
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
  img.dataset.full = photo.full;
  img.addEventListener("load", () => {
    img.dataset.loaded = "1";
    loading.delete(img);
    img.classList.add("loaded");
    pump(); // hueco libre: seguimos con la siguiente
  });
  img.addEventListener("error", () => {
    if (!img.getAttribute("src")) return; // src vacío = cancelada, no es error
    loading.delete(img);
    if (img.dataset.fallback !== "1") {
      // si no hay miniatura 150x150, probamos con la imagen completa
      img.dataset.fallback = "1";
      if (inView.has(img)) beginLoad(img); else pump();
    } else {
      // Falló también la completa (puede ser rate limit). NO ocultamos el tile:
      // lo dejamos gris y reintentará al volver a entrar en pantalla; al hacer
      // clic igualmente intenta cargar la imagen completa en el visor.
      img.dataset.err = "1";
      pump();
    }
  });

  const num = document.createElement("span");
  num.className = "num";
  num.textContent = `#${photo.num}`;

  const fav = document.createElement("button");
  fav.type = "button";
  fav.className = "fav" + (favorites.has(photo.id) ? " on" : "");
  fav.textContent = favorites.has(photo.id) ? "★" : "☆";
  fav.setAttribute("aria-label", "Marcar como favorita");
  fav.addEventListener("click", (e) => {
    e.stopPropagation(); // no abrir el visor al marcar
    toggleFav(photo.id);
  });

  tile.append(img, num, fav);
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

// --- Estado inicial desde la URL (?cat=&q=) ---
(function initFromQuery() {
  const params = new URLSearchParams(location.search);
  const cat = params.get("cat");
  if (cat && (cat === "fav" || CATS.some((c) => c.key === cat))) currentCat = cat;
  const q = params.get("q");
  if (q) searchEl.value = q;
})();

// --- Toggle de tamaño de miniaturas (persistido) ---
const sizeToggle = document.getElementById("sizeToggle");
const SIZE_KEY = "pinatarius2026:bigthumbs";
function applyThumbSize() {
  const big = localStorage.getItem(SIZE_KEY) === "1";
  document.body.classList.toggle("big-thumbs", big);
  sizeToggle.textContent = big ? "⊟" : "⊞";
  sizeToggle.classList.toggle("active", big);
}
try { applyThumbSize(); } catch (e) {}
sizeToggle.addEventListener("click", () => {
  const big = !(localStorage.getItem(SIZE_KEY) === "1");
  try { localStorage.setItem(SIZE_KEY, big ? "1" : "0"); } catch (e) {}
  applyThumbSize();
});

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
}

function showLightbox() {
  const photo = visiblePhotos[lbIndex];
  if (!photo) return;
  resetZoom();
  lbImg.src = photo.full;
  lbImg.alt = photo.label;
  lbLabel.textContent = `${photo.label} · ${(lbIndex + 1).toLocaleString("es-ES")} de ${visiblePhotos.length.toLocaleString("es-ES")}`;
  lbDownload.href = photo.full;
  lbDownload.download = photo.file;
  updateLbFav();
  preloadNeighbors();
}

// Precarga la siguiente y la anterior para que ← → sean instantáneas.
function preloadNeighbors() {
  for (const d of [1, -1]) {
    const p = visiblePhotos[lbIndex + d];
    if (p) { const im = new Image(); im.src = p.full; }
  }
}

lbFav.addEventListener("click", () => {
  const photo = visiblePhotos[lbIndex];
  if (photo) toggleFav(photo.id);
});

function closeLightbox() {
  lb.classList.add("hidden");
  lbImg.src = "";
  document.body.style.overflow = "";
  lbIndex = -1;
  resetZoom();
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
  lbImg.style.cursor = "";
  lbImg.classList.remove("zoomed");
}
function clampZoom() {
  if (zScale <= 1) { zx = 0; zy = 0; return; }
  // límite de paneo para no sacar la imagen de la pantalla
  const r = lbImg.getBoundingClientRect();
  const maxX = (r.width * 0.5);
  const maxY = (r.height * 0.5);
  zx = Math.max(-maxX, Math.min(maxX, zx));
  zy = Math.max(-maxY, Math.min(maxY, zy));
}

// Rueda del ratón (escritorio)
lbImg.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
  zScale = Math.max(1, Math.min(Z_MAX, zScale * factor));
  clampZoom();
  applyZoom();
}, { passive: false });

// Doble clic / doble toque: alterna zoom
let lastTap = 0;
lbImg.addEventListener("dblclick", () => toggleZoom());
function toggleZoom() {
  zScale = zScale > 1 ? 1 : 2.5;
  zx = 0; zy = 0;
  applyZoom();
}

// Arrastre para mover (escritorio con ratón cuando hay zoom)
let dragging = false, dragStartX = 0, dragStartY = 0, dragBaseX = 0, dragBaseY = 0;
lbImg.addEventListener("mousedown", (e) => {
  if (zScale <= 1) return;
  e.preventDefault();
  dragging = true; dragStartX = e.clientX; dragStartY = e.clientY; dragBaseX = zx; dragBaseY = zy;
  lbImg.style.cursor = "grabbing";
});
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  zx = dragBaseX + (e.clientX - dragStartX);
  zy = dragBaseY + (e.clientY - dragStartY);
  clampZoom(); applyZoom();
});
window.addEventListener("mouseup", () => { if (dragging) { dragging = false; lbImg.style.cursor = "grab"; } });

// Táctil: pellizco para zoom, un dedo para paneo cuando hay zoom
let pinchDist = 0, pinchBase = 1, panX0 = 0, panY0 = 0, panBaseX = 0, panBaseY = 0;
function dist(t) {
  const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
  return Math.hypot(dx, dy);
}
lbImg.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    pinchDist = dist(e.touches); pinchBase = zScale;
  } else if (e.touches.length === 1) {
    // doble-tap
    const now = Date.now();
    if (now - lastTap < 300) { toggleZoom(); }
    lastTap = now;
    if (zScale > 1) {
      panX0 = e.touches[0].clientX; panY0 = e.touches[0].clientY; panBaseX = zx; panBaseY = zy;
    }
  }
}, { passive: true });
lbImg.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    zScale = Math.max(1, Math.min(Z_MAX, pinchBase * (dist(e.touches) / pinchDist)));
    clampZoom(); applyZoom();
  } else if (e.touches.length === 1 && zScale > 1) {
    e.preventDefault();
    zx = panBaseX + (e.touches[0].clientX - panX0);
    zy = panBaseY + (e.touches[0].clientY - panY0);
    clampZoom(); applyZoom();
  }
}, { passive: false });
lbImg.addEventListener("touchend", (e) => {
  if (e.touches.length === 0 && zScale <= 1) resetZoom();
});

function step(delta) {
  if (lbIndex < 0) return;
  lbIndex = (lbIndex + delta + visiblePhotos.length) % visiblePhotos.length;
  showLightbox();
  const photo = visiblePhotos[lbIndex];
  if (photo) setHash(`foto-${photo.id}`);
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

// Swipe en móvil (solo si NO hay zoom; con zoom, un dedo panea)
let touchX = null;
lb.addEventListener("touchstart", (e) => {
  touchX = (zScale <= 1 && e.touches.length === 1) ? e.touches[0].clientX : null;
}, { passive: true });
lb.addEventListener("touchend", (e) => {
  if (touchX === null || zScale > 1) { touchX = null; return; }
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  touchX = null;
});

// --- Botón "volver arriba" (salto instantáneo, sin animación) ---
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

// --- Altura real del footer fijo (para el hueco inferior y posicionar botones) ---
const footerEl = document.querySelector(".footer");
function setFooterH() {
  if (footerEl) {
    document.documentElement.style.setProperty("--footer-h", `${footerEl.offsetHeight}px`);
  }
}
setFooterH();
window.addEventListener("resize", () => requestAnimationFrame(setFooterH));

// Si la URL trae #foto-ID al cargar, abrimos esa foto (enlace compartido).
syncFromHash();
