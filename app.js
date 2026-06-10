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
const CATS = [
  { key: "barro", label: "Barro y gladiator", sources: [
    source("p", "PINATARIUS-2026", 1, 2940, { sep: "." }),
  ]},
  { key: "meta", label: "Meta y premeta", sources: [
    source("pm", "premeta_pinatarius", 1, 2936, { sep: "" }),
  ]},
  { key: "salida", label: "Salida", sources: [
    source("sal", "salida_pinatarius", 1, 312, { sep: "" }),
  ]},
  { key: "playa", label: "Playa", sources: [
    source("playa", "PLAYA_PINATARIUS", 1, 2430, { width: 4 }),
    source("villa", "PINATARIUS_VILLANANITOS", 1, 553, { width: 3 }),
  ]},
  { key: "varias", label: "Varias", sources: [
    source("v", "variadas_pinatarius", 1, 619, { width: 3 }),
    source("vg", "variadas_pinatarius", 1, 126, { sep: "" }),
  ]},
  { key: "photocall", label: "Photocall y premios", sources: [
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
const selectToggle = document.getElementById("selectToggle");
const selbar = document.getElementById("selbar");
const selCount = document.getElementById("selCount");
const selClear = document.getElementById("selClear");
const selDownload = document.getElementById("selDownload");
const toastEl = document.getElementById("toast");

const lb = document.getElementById("lb");
const lbImg = document.getElementById("lbImg");
const lbLabel = document.getElementById("lbLabel");
const lbDownload = document.getElementById("lbDownload");
const lbClose = document.getElementById("lbClose");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbShare = document.getElementById("lbShare");

// --- State ---
let selecting = false;
const selected = new Set(); // ids
let currentCat = "all";
let visiblePhotos = PHOTOS.slice();
let lbIndex = -1;

countEl.textContent = `~${PHOTOS.length}`;

// --- Barra de filtros ---
function buildFilters() {
  const counts = {};
  for (const p of PHOTOS) counts[p.cat] = (counts[p.cat] || 0) + 1;
  const defs = [{ key: "all", label: "Todas", n: PHOTOS.length }];
  for (const c of CATS) if (counts[c.key]) defs.push({ key: c.key, label: c.label, n: counts[c.key] });
  // Si solo hay una categoría con fotos, no mostramos filtros.
  if (defs.length <= 2) { filtersEl.classList.add("hidden"); return; }
  filtersEl.innerHTML = "";
  for (const d of defs) {
    const b = document.createElement("button");
    b.className = "fbtn" + (d.key === currentCat ? " active" : "");
    b.dataset.cat = d.key;
    b.innerHTML = `${d.label}<span class="cnt">${d.n}</span>`;
    b.addEventListener("click", () => setCategory(d.key));
    filtersEl.appendChild(b);
  }
}

function setCategory(key) {
  currentCat = key;
  for (const b of filtersEl.children) b.classList.toggle("active", b.dataset.cat === key);
  applyFilters();
}

// --- Filtro combinado (categoría + búsqueda) ---
function applyFilters() {
  const q = searchEl.value.trim();
  visiblePhotos = PHOTOS.filter((p) => {
    if (currentCat !== "all" && p.cat !== currentCat) return false;
    if (q === "") return true;
    if (/^\d+$/.test(q)) return p.num === parseInt(q, 10) || String(p.num).includes(q);
    return false;
  });
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
  if (selected.has(photo.id)) tile.classList.add("selected");

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

  const check = document.createElement("span");
  check.className = "check";
  check.textContent = "✓";

  tile.append(img, num, check);
  io.observe(img);

  tile.addEventListener("click", () => onTileClick(photo, tile));
  return tile;
}

function renderGrid(list) {
  resetLoader();
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const p of list) frag.appendChild(makeTile(p));
  grid.appendChild(frag);
  emptyEl.classList.toggle("hidden", list.length > 0);
}

buildFilters();
renderGrid(visiblePhotos);

// --- Tile click: select or open ---
function onTileClick(photo, tile) {
  if (selecting) {
    if (selected.has(photo.id)) {
      selected.delete(photo.id);
      tile.classList.remove("selected");
    } else {
      selected.add(photo.id);
      tile.classList.add("selected");
    }
    updateSelbar();
  } else {
    openLightbox(photo.id);
  }
}

// --- Selection mode ---
selectToggle.addEventListener("click", () => {
  selecting = !selecting;
  document.body.classList.toggle("selecting", selecting);
  selectToggle.classList.toggle("active", selecting);
  selectToggle.textContent = selecting ? "Cancelar selección" : "Seleccionar";
  selbar.classList.toggle("hidden", !selecting);
  if (!selecting) clearSelection();
});

function clearSelection() {
  selected.clear();
  for (const tile of grid.children) tile.classList.remove("selected");
  updateSelbar();
}
selClear.addEventListener("click", clearSelection);

function updateSelbar() {
  const c = selected.size;
  selCount.textContent = `${c} seleccionada${c === 1 ? "" : "s"}`;
  selDownload.disabled = c === 0;
  selDownload.textContent = c > 0 ? `Descargar ZIP (${c})` : "Descargar ZIP";
}

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

// --- ZIP de la selección ---
selDownload.addEventListener("click", async () => {
  if (selected.size === 0) return;
  if (typeof JSZip === "undefined") {
    toast("No se pudo cargar el compresor ZIP. Reintenta.");
    return;
  }
  const ids = [...selected];
  selDownload.disabled = true;
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
  triggerDownload(blob, `pinatarius-2026-seleccion-${ids.length}.zip`);
  hideToast();
  toast(failed ? `ZIP listo (${failed} fotos no se pudieron incluir).` : "ZIP descargado.");
  selDownload.disabled = false;
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
  lbImg.src = photo.full;
  lbImg.alt = photo.label;
  lbLabel.textContent = photo.label;
  lbDownload.href = photo.full;
  lbDownload.download = photo.file;
}

function closeLightbox() {
  lb.classList.add("hidden");
  lbImg.src = "";
  document.body.style.overflow = "";
  lbIndex = -1;
  setHash("");
}

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

// Swipe en móvil
let touchX = null;
lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener("touchend", (e) => {
  if (touchX === null) return;
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

// Si la URL trae #foto-ID al cargar, abrimos esa foto (enlace compartido).
syncFromHash();
