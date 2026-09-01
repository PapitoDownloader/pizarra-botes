/* =====================================================
   Pizarra Táctica · Kayak Polo
   Motor de la pizarra + interfaz (mouse, táctil y lápiz)
   Vista: zoom con pinch/rueda + pan con 2 dedos
   ===================================================== */

/* ================= CANVAS ================= */

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Geometría del fondo: 50 píxeles representan exactamente un metro.
const ESCALA_PX_M = 50;
const CAMPO_LARGO_M = 35;
const CAMPO_ANCHO_M = 24;
const FONDO_ANCHO_PX = 1178;
const FONDO_ALTO_PX = 1928;
const CAMPO_ORIGEN_X = (FONDO_ANCHO_PX - CAMPO_ANCHO_M * ESCALA_PX_M) / 2;
const CAMPO_ORIGEN_Y = (FONDO_ALTO_PX - CAMPO_LARGO_M * ESCALA_PX_M) / 2;
const ASSET_VERSION = "2026-08-31-04";

function assetUrl(path) {
  return `${path}?v=${ASSET_VERSION}`;
}

// Convierte coordenadas tácticas (x: ancho, y: largo) a coordenadas de mundo.
function metrosAMundo(xMetros, yMetros) {
  return {
    x: CAMPO_ORIGEN_X + xMetros * ESCALA_PX_M,
    y: CAMPO_ORIGEN_Y + yMetros * ESCALA_PX_M
  };
}

/* Ajuste base del fondo: el PNG se encaja en la ventana y ese mismo encaje
   (escala + origen) lo comparten el fondo, los botes, la pelota y los trazos.
   Las coordenadas de mundo son siempre píxeles nativos del fondo. */
let fondoAncho = FONDO_ANCHO_PX;
let fondoAlto = FONDO_ALTO_PX;
const base = { escala: 1, x: 0, y: 0 };

function calcularBase() {
  base.escala = Math.min(canvas.width / fondoAncho, canvas.height / fondoAlto);
  base.x = (canvas.width - fondoAncho * base.escala) / 2;
  base.y = (canvas.height - fondoAlto * base.escala) / 2;
}

function ajustarCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  calcularBase();
}

// Escala final con la que se pinta todo: ajuste del fondo por el zoom actual.
function escalaTotal() {
  return base.escala * vista.zoom;
}

/* ================= ESTADO GENERAL ================= */

let modo = "mover";
let seleccionado = null;
let offsetX = 0;
let offsetY = 0;
let dibujando = false;

/* ================= VISTA (zoom y desplazamiento) ================= */

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const vista = { zoom: 1, x: 0, y: 0 };
let vistaObjetivo = null;
let pellizco = null;
const punteros = new Map();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// de coordenadas de pantalla a coordenadas del campo (mundo = píxeles del fondo).
function aMundo(sx, sy) {
  const escala = escalaTotal();
  return {
    x: (sx - (base.x * vista.zoom + vista.x)) / escala,
    y: (sy - (base.y * vista.zoom + vista.y)) / escala
  };
}

function zoomEn(sx, sy, factor) {
  const zoom = clamp(vista.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const ux = (sx - vista.x) / vista.zoom;
  const uy = (sy - vista.y) / vista.zoom;
  vista.zoom = zoom;
  vista.x = sx - ux * zoom;
  vista.y = sy - uy * zoom;
  vistaObjetivo = null;
}

function recuadrar() {
  vistaObjetivo = { zoom: 1, x: 0, y: 0 };
}

/* ================= IMÁGENES ================= */

const fondo = new Image();
const imgRojo = new Image();
const imgAzul = new Image();
const imgPelota = new Image();

fondo.src = assetUrl("FONDO.png");
imgRojo.src = assetUrl("bote-rojo.png");
imgAzul.src = assetUrl("bote-azul.png");
imgPelota.src = assetUrl("pelota.png");

/* ================= OBJETOS ================= */

// Los sprites de bote son kayaks largos (ancho ~0.73 m, largo ~3 m a 50 px/m).
// Se dibujan respetando la proporción real del PNG para que no se vean
// aplastados dentro de un cuadrado.
const TAM_BOTE_LARGO = 150; // ~3 m a la escala actual (50 px = 1 m)
const TAM_PELOTA = 30;
const botes = [];

// Devuelve el ancho/alto del sprite en píxeles de mundo manteniendo su aspecto.
function dimensionesBote(b) {
  const fuente = b.img;
  const aspecto = fuente.width && fuente.height ? fuente.width / fuente.height : 0.24;
  return {
    w: TAM_BOTE_LARGO * aspecto,
    h: TAM_BOTE_LARGO
  };
}

// Formación inicial: los dos equipos ordenados sobre el costado izquierdo del
// campo, en dos columnas. Todas las posiciones nacen en metros y quedan dentro
// del campo (0..19 m de ancho, 0..35 m de largo).
const COLUMNA_ROJA_X_M = 2.2;
const COLUMNA_AZUL_X_M = 4.8;
const FILAS_FORMACION_M = [5.0, 8.5, 12.0, 15.5, 19.0, 22.5, 26.0, 29.5];

const formacionRoja = FILAS_FORMACION_M.map(y => [COLUMNA_ROJA_X_M, y]);
const formacionAzul = FILAS_FORMACION_M.map(y => [COLUMNA_AZUL_X_M, y]);
formacionRoja.forEach(([x, y]) => {
  const posicion = metrosAMundo(x, y);
  botes.push({ img: imgRojo, ...posicion, rot: 0, scale: 1 });
});
formacionAzul.forEach(([x, y]) => {
  const posicion = metrosAMundo(x, y);
  botes.push({ img: imgAzul, ...posicion, rot: Math.PI, scale: 1 });
});

const centroCampo = metrosAMundo(CAMPO_ANCHO_M / 2, CAMPO_LARGO_M / 2);
const pelota = { x: centroCampo.x, y: centroCampo.y, r: 11 };

const trazos = [];
let trazoActual = [];

/* ================= INTERFAZ ================= */

const botonesModo = document.querySelectorAll(".tool");
const btnRecuadrar = document.getElementById("btn-recuadrar");
const btnLimpiar = document.getElementById("btn-limpiar");
const btnGuardar = document.getElementById("btn-guardar");
const statusTexto = document.getElementById("status-texto");
const barra = document.getElementById("toolbar");
const barraHandle = document.getElementById("barra-handle");

const TOQUE = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

const AYUDAS = {
  mover: "Mover — arrastra los botes y la pelota",
  rotar: "Rotar — arrastra alrededor del bote para girarlo",
  escalar: "Escalar — arrastra hacia arriba/abajo para cambiar el tamaño",
  lapiz: "Lápiz — dibuja sobre el campo"
};

const memoria = {
  get(clave) {
    try {
      return localStorage.getItem(clave);
    } catch {
      return null;
    }
  },
  set(clave, valor) {
    try {
      localStorage.setItem(clave, valor);
    } catch {}
  }
};

function ayudaModo(m) {
  return AYUDAS[m] + (TOQUE ? " · 2 dedos: zoom y mover" : "");
}

function avisar(mensaje) {
  statusTexto.textContent = mensaje;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => {
    statusTexto.textContent = ayudaModo(modo);
  }, 2200);
}

function setModo(m) {
  modo = m;
  botonesModo.forEach(b => b.classList.toggle("is-active", b.dataset.modo === m));
  statusTexto.textContent = ayudaModo(m);
  canvas.className = "cur-" + m;
}

botonesModo.forEach(b => b.addEventListener("click", () => setModo(b.dataset.modo)));
btnRecuadrar.addEventListener("click", recuadrar);
btnLimpiar.addEventListener("click", limpiar);
btnGuardar.addEventListener("click", guardar);

/* ================= ATAJOS DE TECLADO ================= */

window.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === "z") {
      trazos.pop();
      e.preventDefault();
      avisar("Trazo deshecho");
    }
    if (k === "s") {
      guardar();
      e.preventDefault();
    }
    return;
  }

  switch (e.key.toLowerCase()) {
    case "v":
    case "1":
      setModo("mover");
      break;
    case "r":
    case "2":
      setModo("rotar");
      break;
    case "e":
    case "3":
      setModo("escalar");
      break;
    case "p":
    case "4":
      setModo("lapiz");
      break;
    case "0":
      recuadrar();
      break;
  }
});

/* ================= DIBUJO ================= */

function dibujarFondo() {
  if (!fondo.complete || !fondo.width) return;
  ctx.drawImage(fondo, 0, 0, fondoAncho, fondoAlto);
}

function anillo(x, y, radio) {
  ctx.beginPath();
  ctx.arc(x, y, radio, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 2.5 / escalaTotal();
  ctx.setLineDash([7 / escalaTotal(), 6 / escalaTotal()]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function anilloBote(b, dim) {
  const rx = (dim.w / 2) * b.scale + 8;
  const ry = (dim.h / 2) * b.scale + 8;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 2.5 / escalaTotal();
  ctx.setLineDash([7 / escalaTotal(), 6 / escalaTotal()]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function dibujarBotes() {
  botes.forEach(b => {
    if (!b.img.complete || !b.img.width) return;
    const dim = dimensionesBote(b);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(b.scale, b.scale);
    ctx.drawImage(b.img, -dim.w / 2, -dim.h / 2, dim.w, dim.h);
    ctx.restore();

    if (b === seleccionado) anilloBote(b, dim);
  });
}

function dibujarPelotaRespaldo() {
  ctx.beginPath();
  ctx.arc(pelota.x, pelota.y, pelota.r, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();
  ctx.lineWidth = 2 / escalaTotal();
  ctx.strokeStyle = "rgba(15, 23, 42, 0.75)";
  ctx.stroke();
}

function dibujarPelota() {
  if (imgPelota.complete && imgPelota.width) {
    ctx.drawImage(imgPelota, pelota.x - TAM_PELOTA / 2, pelota.y - TAM_PELOTA / 2, TAM_PELOTA, TAM_PELOTA);
  } else {
    dibujarPelotaRespaldo();
  }

  if (pelota === seleccionado) anillo(pelota.x, pelota.y, pelota.r + 8);
}

function dibujarTrazos() {
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3 / escalaTotal();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  trazos.forEach(t => {
    ctx.beginPath();
    t.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  });
}

function loop() {
  if (vistaObjetivo) {
    vista.zoom += (vistaObjetivo.zoom - vista.zoom) * 0.25;
    vista.x += (vistaObjetivo.x - vista.x) * 0.25;
    vista.y += (vistaObjetivo.y - vista.y) * 0.25;
    if (
      Math.abs(vista.zoom - vistaObjetivo.zoom) < 0.002 &&
      Math.abs(vista.x - vistaObjetivo.x) < 0.5 &&
      Math.abs(vista.y - vistaObjetivo.y) < 0.5
    ) {
      Object.assign(vista, vistaObjetivo);
      vistaObjetivo = null;
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const escala = escalaTotal();
  ctx.setTransform(
    escala, 0, 0, escala,
    base.x * vista.zoom + vista.x,
    base.y * vista.zoom + vista.y
  );

  dibujarFondo();
  dibujarBotes();
  dibujarPelota();
  dibujarTrazos();
  requestAnimationFrame(loop);
}

/* ================= CARGA DE IMÁGENES ================= */

let pendientes = 4;
const imagenLista = () => {
  pendientes -= 1;
  if (pendientes === 0) loop();
};

[fondo, imgRojo, imgAzul, imgPelota].forEach(img => {
  img.addEventListener("load", imagenLista);
  img.addEventListener("error", imagenLista);
});

fondo.addEventListener("load", () => {
  fondoAncho = fondo.naturalWidth || FONDO_ANCHO_PX;
  fondoAlto = fondo.naturalHeight || FONDO_ALTO_PX;
  calcularBase();
});

/* ================= INTERACCIÓN (mouse / táctil / lápiz) ================= */

canvas.addEventListener("pointerdown", e => {
  const mx = e.offsetX;
  const my = e.offsetY;
  punteros.set(e.pointerId, { x: mx, y: my });
  canvas.setPointerCapture(e.pointerId);

  if (punteros.size === 2) {
    soltar();
    vistaObjetivo = null;
    const [a, b] = [...punteros.values()];
    pellizco = {
      dist: Math.max(10, Math.hypot(b.x - a.x, b.y - a.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom: vista.zoom,
      x: vista.x,
      y: vista.y
    };
    return;
  }
  if (punteros.size > 2) return;

  const w = aMundo(mx, my);
  const toque = e.pointerType === "touch";
  const margen = (toque ? 14 : 4) / escalaTotal();

  if (Math.hypot(w.x - pelota.x, w.y - pelota.y) < pelota.r + 6 + margen) {
    seleccionado = pelota;
    offsetX = w.x - pelota.x;
    offsetY = w.y - pelota.y;
    return;
  }

  for (let i = botes.length - 1; i >= 0; i--) {
    const b = botes[i];
    const dim = dimensionesBote(b);
    const radio = Math.max(dim.w, dim.h) / 2 * b.scale + margen;
    if (Math.hypot(w.x - b.x, w.y - b.y) < radio) {
      seleccionado = b;
      offsetX = w.x - b.x;
      offsetY = w.y - b.y;
      return;
    }
  }

  if (modo === "lapiz") {
    dibujando = true;
    trazoActual = [{ x: w.x, y: w.y }];
    trazos.push(trazoActual);
  }
});

canvas.addEventListener("pointermove", e => {
  const mx = e.offsetX;
  const my = e.offsetY;
  if (punteros.has(e.pointerId)) punteros.set(e.pointerId, { x: mx, y: my });

  if (pellizco && punteros.size >= 2) {
    const [a, b] = [...punteros.values()];
    const dist = Math.max(10, Math.hypot(b.x - a.x, b.y - a.y));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = clamp(pellizco.zoom * (dist / pellizco.dist), ZOOM_MIN, ZOOM_MAX);
    const wx = (pellizco.mid.x - pellizco.x) / pellizco.zoom;
    const wy = (pellizco.mid.y - pellizco.y) / pellizco.zoom;
    vista.zoom = zoom;
    vista.x = mid.x - wx * zoom;
    vista.y = mid.y - wy * zoom;
    statusTexto.textContent = "Zoom: " + Math.round(zoom * 100) + "%";
    return;
  }

  const w = aMundo(mx, my);

  if (modo === "mover" && seleccionado) {
    seleccionado.x = w.x - offsetX;
    seleccionado.y = w.y - offsetY;
  }

  if (modo === "rotar" && seleccionado && seleccionado.rot !== undefined) {
    seleccionado.rot = Math.atan2(w.y - seleccionado.y, w.x - seleccionado.x) + Math.PI / 2;
  }

  if (modo === "escalar" && seleccionado && seleccionado.scale !== undefined) {
    const recorrido = (w.y - seleccionado.y) * escalaTotal();
    seleccionado.scale = clamp(1 + recorrido / 150, 0.3, 2);
  }

  if (modo === "lapiz" && dibujando) {
    trazoActual.push({ x: w.x, y: w.y });
  }
});

function finPuntero(e) {
  punteros.delete(e.pointerId);
  if (pellizco && punteros.size < 2) {
    pellizco = null;
    statusTexto.textContent = ayudaModo(modo);
  }
  if (punteros.size === 0) soltar();
}
canvas.addEventListener("pointerup", finPuntero);
canvas.addEventListener("pointercancel", finPuntero);

canvas.addEventListener(
  "wheel",
  e => {
    e.preventDefault();
    zoomEn(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  },
  { passive: false }
);

canvas.addEventListener("contextmenu", e => e.preventDefault());

/* ================= ACCIONES ================= */

function soltar() {
  seleccionado = null;
  dibujando = false;
}

function limpiar() {
  trazos.length = 0;
  avisar("Trazos borrados");
}

function guardar() {
  const a = document.createElement("a");
  a.download = "pizarra-tactica.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
  avisar("Pizarra guardada como PNG ✓");
}

/* ================= BARRA LIBRE EN PC / MÓVIL ================= */

const estadoBarraPc = (() => {
  try {
    return JSON.parse(memoria.get("pizarra-barra-pc") || "") || { edge: "top", ratio: 0.5 };
  } catch {
    return { edge: "top", ratio: 0.5 };
  }
})();

let arrastreBarraMovil = null;
let arrastreBarraPc = null;
let modoBarraMovil = false;

function esMovil() {
  return window.innerWidth <= 720 || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

function guardarBarraPc() {
  memoria.set("pizarra-barra-pc", JSON.stringify(estadoBarraPc));
}

function estadoBarraMovil(abajo) {
  barra.classList.toggle("barra-abajo", abajo);
  memoria.set("pizarra-barra-abajo", abajo ? "1" : "0");
}

function normalizarBarraPc() {
  if (!["top", "bottom", "left", "right"].includes(estadoBarraPc.edge)) {
    estadoBarraPc.edge = "top";
  }
  estadoBarraPc.ratio = clamp(Number(estadoBarraPc.ratio) || 0.5, 0, 1);
}

function bordeMasCercano(x, y) {
  const distancias = [
    ["left", x],
    ["right", window.innerWidth - x],
    ["top", y],
    ["bottom", window.innerHeight - y]
  ];
  distancias.sort((a, b) => a[1] - b[1]);
  return distancias[0][0];
}

function aplicarBarraPc() {
  normalizarBarraPc();
  barra.classList.remove("modo-movil", "barra-abajo");
  barra.classList.add("modo-pc", "posicion-libre");
  barra.dataset.edge = estadoBarraPc.edge;
  barra.dataset.layout = (estadoBarraPc.edge === "left" || estadoBarraPc.edge === "right") ? "vertical" : "horizontal";

  barra.style.left = "16px";
  barra.style.top = "16px";
  barra.style.right = "auto";
  barra.style.bottom = "auto";

  const margen = 16;
  const ancho = barra.offsetWidth;
  const alto = barra.offsetHeight;

  if (barra.dataset.layout === "horizontal") {
    const usable = Math.max(0, window.innerWidth - ancho - margen * 2);
    const left = Math.round(margen + usable * estadoBarraPc.ratio);
    const top = estadoBarraPc.edge === "top"
      ? margen
      : Math.max(margen, window.innerHeight - alto - margen);
    barra.style.left = `${left}px`;
    barra.style.top = `${Math.round(top)}px`;
  } else {
    const usable = Math.max(0, window.innerHeight - alto - margen * 2);
    const top = Math.round(margen + usable * estadoBarraPc.ratio);
    const left = estadoBarraPc.edge === "left"
      ? margen
      : Math.max(margen, window.innerWidth - ancho - margen);
    barra.style.left = `${Math.round(left)}px`;
    barra.style.top = `${top}px`;
  }
}

function aplicarBarraMovil() {
  barra.classList.remove("modo-pc", "posicion-libre");
  barra.classList.add("modo-movil");
  barra.dataset.edge = barra.classList.contains("barra-abajo") ? "bottom" : "left";
  barra.dataset.layout = barra.classList.contains("barra-abajo") ? "horizontal" : "vertical";
  barra.style.left = "";
  barra.style.top = "";
  barra.style.right = "";
  barra.style.bottom = "";
}

function aplicarBarra() {
  modoBarraMovil = esMovil();
  if (modoBarraMovil) {
    estadoBarraMovil(memoria.get("pizarra-barra-abajo") === "1");
    aplicarBarraMovil();
  } else {
    aplicarBarraPc();
  }
}

barraHandle.addEventListener("pointerdown", e => {
  e.preventDefault();
  if (modoBarraMovil) {
    arrastreBarraMovil = { y: e.clientY, pointerId: e.pointerId };
  } else {
    arrastreBarraPc = { pointerId: e.pointerId };
    barra.classList.add("arrastrando");
  }
  barraHandle.setPointerCapture(e.pointerId);
});

barraHandle.addEventListener("pointermove", e => {
  if (modoBarraMovil) {
    if (!arrastreBarraMovil || arrastreBarraMovil.pointerId !== e.pointerId) return;
    const dy = e.clientY - arrastreBarraMovil.y;
    if (!barra.classList.contains("barra-abajo") && dy > 45) {
      estadoBarraMovil(true);
      aplicarBarraMovil();
      arrastreBarraMovil = null;
      avisar("Barra abajo");
    } else if (barra.classList.contains("barra-abajo") && dy < -45) {
      estadoBarraMovil(false);
      aplicarBarraMovil();
      arrastreBarraMovil = null;
      avisar("Barra al costado");
    }
    return;
  }

  if (!arrastreBarraPc || arrastreBarraPc.pointerId !== e.pointerId) return;
  const edge = bordeMasCercano(e.clientX, e.clientY);
  estadoBarraPc.edge = edge;
  if (edge === "left" || edge === "right") {
    estadoBarraPc.ratio = clamp((e.clientY - 16) / Math.max(1, window.innerHeight - 32), 0, 1);
  } else {
    estadoBarraPc.ratio = clamp((e.clientX - 16) / Math.max(1, window.innerWidth - 32), 0, 1);
  }
  aplicarBarraPc();
});

function terminarArrastreBarra(e) {
  if (arrastreBarraMovil && arrastreBarraMovil.pointerId === e.pointerId) {
    arrastreBarraMovil = null;
  }
  if (arrastreBarraPc && arrastreBarraPc.pointerId === e.pointerId) {
    arrastreBarraPc = null;
    barra.classList.remove("arrastrando");
    guardarBarraPc();
  }
}

barraHandle.addEventListener("pointerup", terminarArrastreBarra);
barraHandle.addEventListener("pointercancel", terminarArrastreBarra);
barraHandle.addEventListener("dblclick", () => {
  if (modoBarraMovil) return;
  estadoBarraPc.edge = "top";
  estadoBarraPc.ratio = 0.5;
  aplicarBarraPc();
  guardarBarraPc();
  avisar("Barra reubicada en su posición original");
});

if (TOQUE && memoria.get("pizarra-tip-barra-movil") !== "1") {
  memoria.set("pizarra-tip-barra-movil", "1");
  setTimeout(() => avisar("Tip: arrastrá el asa para llevar la barra al costado o abajo"), 1400);
} else if (!TOQUE && memoria.get("pizarra-tip-barra-pc") !== "1") {
  memoria.set("pizarra-tip-barra-pc", "1");
  setTimeout(() => avisar("Tip: arrastrá el asa para mover la barra; doble clic la reinicia"), 1400);
}

/* ================= INICIO ================= */

ajustarCanvas();
aplicarBarra();
window.addEventListener("resize", () => {
  ajustarCanvas();
  aplicarBarra();
});
setModo("mover");
