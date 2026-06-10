"use strict";

/*
 * Galería Pinatarius 2026.
 *
 * La web oficial carga las fotos por scroll infinito contra una API
 * (wp-json/blema/v1/galeria-vmfo) cuyo parámetro `offset` se ignora: cada
 * petición devuelve siempre las mismas 20 fotos -> de ahí las repeticiones.
 *
 * Aquí no usamos esa API. Los ficheros están numerados de forma secuencial
 * (variadas_pinatarius-N.jpg), así que generamos las URLs directamente.
 * Las imágenes del CDN responden con Access-Control-Allow-Origin: *, por lo
 * que podemos mostrarlas y descargarlas (incluso en ZIP) sin problemas de CORS.
 */

const BASE = "https://paraisodeportivosanpedrodelpinatar.com/wp-content/uploads";
const PREFIX = "variadas_pinatarius";
// En el servidor los números van con 3 dígitos y ceros a la izquierda:
// -001.jpg ... -099.jpg ... -100.jpg ... -619.jpg
const MIN = 1;
const MAX = 619;
const pad = (n) => String(n).padStart(3, "0");
// Números que no existen en el servidor (comprobado con HEAD, sin seguir redirects,
// con reintentos). Cualquier otro hueco se oculta solo vía onerror.
const MISSING = new Set([251, 252, 482]);

function buildList() {
  const out = [];
  for (let n = MIN; n <= MAX; n++) {
    if (!MISSING.has(n)) out.push(n);
  }
  return out;
}

const PHOTOS = buildList();
const urlFor = (n) => `${BASE}/${PREFIX}-${pad(n)}.jpg`;
// Miniatura: WordPress genera un recorte cuadrado 150x150 para TODAS las fotos
// (el resto de tamaños solo existen para imágenes 3:2, así que no son fiables).
// ~10 KB cada una en vez de ~600 KB de la original -> rejilla mucho más ligera.
const thumbFor = (n) => `${BASE}/${PREFIX}-${pad(n)}-150x150.jpg`;
const fileName = (n) => `pinatarius-2026-${pad(n)}.jpg`;

// --- DOM refs ---
const grid = document.getElementById("grid");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("search");
const selectToggle = document.getElementById("selectToggle");
const selbar = document.getElementById("selbar");
const selCount = document.getElementById("selCount");
const selClear = document.getElementById("selClear");
const selDownload = document.getElementById("selDownload");
const toastEl = document.getElementById("toast");

// Lightbox refs
const lb = document.getElementById("lb");
const lbImg = document.getElementById("lbImg");
const lbLabel = document.getElementById("lbLabel");
const lbDownload = document.getElementById("lbDownload");
const lbClose = document.getElementById("lbClose");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");

// --- State ---
let selecting = false;
const selected = new Set();
let visiblePhotos = PHOTOS.slice(); // tras filtro de búsqueda
let lbIndex = -1;

countEl.textContent = PHOTOS.length;

// --- Render grid ---
const io = new IntersectionObserver((entries, obs) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const img = entry.target;
    img.src = img.dataset.src;
    obs.unobserve(img);
  }
}, { rootMargin: "600px 0px" });

function makeTile(n) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.n = String(n);

  const img = document.createElement("img");
  img.alt = `Foto ${n}`;
  img.loading = "lazy";
  img.decoding = "async";
  img.dataset.src = thumbFor(n);
  img.addEventListener("load", () => img.classList.add("loaded"));
  img.addEventListener("error", () => {
    // Si por lo que sea no hay miniatura 150x150, recae en la imagen completa.
    if (img.dataset.fallback !== "1") {
      img.dataset.fallback = "1";
      img.src = urlFor(n);
    } else {
      tile.classList.add("failed");
    }
  });

  const num = document.createElement("span");
  num.className = "num";
  num.textContent = `#${n}`;

  const check = document.createElement("span");
  check.className = "check";
  check.textContent = "✓";

  tile.append(img, num, check);
  io.observe(img);

  tile.addEventListener("click", () => onTileClick(n, tile));
  return tile;
}

function renderGrid(list) {
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const n of list) frag.appendChild(makeTile(n));
  grid.appendChild(frag);
  emptyEl.classList.toggle("hidden", list.length > 0);
}

renderGrid(visiblePhotos);

// --- Tile click: select or open ---
function onTileClick(n, tile) {
  if (selecting) {
    if (selected.has(n)) {
      selected.delete(n);
      tile.classList.remove("selected");
    } else {
      selected.add(n);
      tile.classList.add("selected");
    }
    updateSelbar();
  } else {
    openLightbox(n);
  }
}

// --- Search ---
searchEl.addEventListener("input", () => {
  const q = searchEl.value.trim();
  if (q === "") {
    visiblePhotos = PHOTOS.slice();
  } else if (/^\d+$/.test(q)) {
    const num = parseInt(q, 10);
    visiblePhotos = PHOTOS.filter(
      (n) => n === num || String(n).includes(q) || pad(n).includes(q)
    );
  } else {
    visiblePhotos = [];
  }
  renderGrid(visiblePhotos);
  // re-aplica el estado de selección visual
  if (selecting) {
    for (const tile of grid.children) {
      if (selected.has(Number(tile.dataset.n))) tile.classList.add("selected");
    }
  }
});

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

// --- Download single ---
async function downloadOne(n) {
  try {
    const res = await fetch(urlFor(n), { mode: "cors" });
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    triggerDownload(blob, fileName(n));
  } catch (e) {
    // Fallback: abrir en pestaña nueva para guardar manualmente.
    window.open(urlFor(n), "_blank");
  }
}

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

// --- Download ZIP of selection ---
selDownload.addEventListener("click", async () => {
  if (selected.size === 0) return;
  if (typeof JSZip === "undefined") {
    toast("No se pudo cargar el compresor ZIP. Reintenta.");
    return;
  }
  const nums = [...selected].sort((a, b) => a - b);
  selDownload.disabled = true;
  const zip = new JSZip();
  let done = 0;
  let failed = 0;

  // Descarga en lotes para no saturar el navegador.
  const BATCH = 6;
  for (let i = 0; i < nums.length; i += BATCH) {
    const chunk = nums.slice(i, i + BATCH);
    await Promise.all(chunk.map(async (n) => {
      try {
        const res = await fetch(urlFor(n), { mode: "cors" });
        if (!res.ok) throw new Error(res.status);
        zip.file(fileName(n), await res.blob());
      } catch (e) {
        failed++;
      } finally {
        done++;
        toast(`Preparando ZIP… ${done}/${nums.length}`, true);
      }
    }));
  }

  toast("Comprimiendo…", true);
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `pinatarius-2026-seleccion-${nums.length}.zip`);
  hideToast();
  toast(failed ? `ZIP listo (${failed} fotos no se pudieron incluir).` : "ZIP descargado.");
  selDownload.disabled = false;
});

// --- Lightbox ---
function openLightbox(n) {
  lbIndex = visiblePhotos.indexOf(n);
  showLightbox();
  lb.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function showLightbox() {
  const n = visiblePhotos[lbIndex];
  if (n === undefined) return;
  lbImg.src = urlFor(n);
  lbImg.alt = `Foto ${n}`;
  lbLabel.textContent = `Foto #${n}`;
  lbDownload.href = urlFor(n);
  lbDownload.download = fileName(n);
}

function closeLightbox() {
  lb.classList.add("hidden");
  lbImg.src = "";
  document.body.style.overflow = "";
  lbIndex = -1;
}

function step(delta) {
  if (lbIndex < 0) return;
  lbIndex = (lbIndex + delta + visiblePhotos.length) % visiblePhotos.length;
  showLightbox();
}

lbClose.addEventListener("click", closeLightbox);
lbPrev.addEventListener("click", () => step(-1));
lbNext.addEventListener("click", () => step(1));
lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });

// Descarga forzada desde el lightbox (en vez de navegar al .jpg).
lbDownload.addEventListener("click", (e) => {
  e.preventDefault();
  const n = visiblePhotos[lbIndex];
  if (n !== undefined) downloadOne(n);
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
