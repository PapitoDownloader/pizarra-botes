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
const CAMPO_ANCHO_M = 23;
const FONDO_ANCHO_PX = 1178;
const FONDO_ALTO_PX = 1928;
const CAMPO_ORIGEN_X = (FONDO_ANCHO_PX - CAMPO_ANCHO_M * ESCALA_PX_M) / 2;
const CAMPO_ORIGEN_Y = (FONDO_ALTO_PX - CAMPO_LARGO_M * ESCALA_PX_M) / 2;

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

// Escala final con la que se pinta todo: ajuste del fondo por el zoom actual.
function escalaTotal() {
  return base.escala * vista.zoom;
}

function ajustarCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  calcularBase();
}
ajustarCanvas();
window.addEventListener("resize", ajustarCanvas);

let modo = "mover";
let seleccionado = null;
let offsetX = 0;
let offsetY = 0;
let dibujando = false;

/* ================= VISTA (zoom y desplazamiento) ================= */

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const vista = { zoom: 1, x: 0, y: 0 };
let vistaObjetivo = null; // destino animado (recuadrar)
let pellizco = null;     // estado del gesto de 2 dedos
const punteros = new Map(); // punteros activos sobre el canvas

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// de coordenadas de pantalla a coordenadas del campo (mundo = píxeles del fondo).
// Usa la misma escala base y el mismo origen con los que se dibuja el fondo,
// para que todo siga siendo seleccionable y movible con cualquier zoom.
function aMundo(sx, sy) {
  const escala = escalaTotal();
  return {
    x: (sx - (base.x * vista.zoom + vista.x)) / escala,
    y: (sy - (base.y * vista.zoom + vista.y)) / escala
  };
}

// zoom manteniendo fijo el punto (sx, sy)
function zoomEn(sx, sy, factor) {
  const zoom = clamp(vista.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  // punto de referencia en el espacio ya ajustado al fondo (zoom 1, sin pan)
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

fondo.src = "FONDO.png";
imgRojo.src = "Kayapolored__1_-removebg-preview.png";
imgAzul.src = "KayapoloRC__1_-removebg-preview.png";

/* ================= OBJETOS ================= */

const TAM = 70;
const botes = [];

// Formación inicial: los dos equipos ordenados sobre el costado izquierdo del
// campo, en dos columnas. Todas las posiciones nacen en metros y quedan dentro
// del campo (0..23 m de ancho, 0..35 m de largo).
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
const pelota = { x: centroCampo.x, y: centroCampo.y, r: 10 };

const trazos = [];
let trazoActual = [];

/* ================= INTERFAZ ================= */

const botonesModo = document.querySelectorAll(".tool");
const btnRecuadrar = document.getElementById("btn-recuadrar");
const btnLimpiar = document.getElementById("btn-limpiar");
const btnGuardar = document.getElementById("btn-guardar");
const statusTexto = document.getElementById("status-texto");

const TOQUE = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

const AYUDAS = {
  mover: "Mover — arrastra los botes y la pelota",
  rotar: "Rotar — arrastra alrededor del bote para girarlo",
  escalar: "Escalar — arrastra hacia arriba/abajo para cambiar el tamaño",
  lapiz: "Lápiz — dibuja sobre el campo"
};

function ayudaModo(m) {
  return AYUDAS[m] + (TOQUE ? " · 2 dedos: zoom y mover" : "");
}

function avisar(mensaje) {
  statusTexto.textContent = mensaje;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => {
    statusTexto.textContent = ayudaModo(modo);
  }, 2000);
}

function setModo(m) {
  modo = m;
  botonesModo.forEach(b => b.classList.toggle("is-active", b.dataset.modo === m));
  statusTexto.textContent = ayudaModo(m);
  canvas.className = "cur-" + m;
}

botonesModo.forEach(b =>
  b.addEventListener("click", () => setModo(b.dataset.modo))
);
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
    case "v": case "1": setModo("mover"); break;
    case "r": case "2": setModo("rotar"); break;
    case "e": case "3": setModo("escalar"); break;
    case "p": case "4": setModo("lapiz"); break;
    case "0": recuadrar(); break;
  }
});

/* ================= DIBUJO ================= */

function dibujarFondo() {
  if (!fondo.complete || !fondo.width) return;
  // El fondo se dibuja en coordenadas de mundo: la escala de ajuste y el
  // origen ya vienen aplicados en la transformación del lienzo.
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

function dibujarBotes() {
  botes.forEach(b => {
    if (!b.img.complete || !b.img.width) return;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(b.scale, b.scale);
    ctx.drawImage(b.img, -TAM / 2, -TAM / 2, TAM, TAM);
    ctx.restore();

    if (b === seleccionado) anillo(b.x, b.y, (TAM / 2) * b.scale + 8);
  });
}

function dibujarPelota() {
  ctx.beginPath();
  ctx.arc(pelota.x, pelota.y, pelota.r, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();
  ctx.lineWidth = 2 / escalaTotal();
  ctx.strokeStyle = "rgba(15, 23, 42, 0.75)";
  ctx.stroke();

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
  // animación suave al recuadrar
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
  // Una sola transformación para todo: escala base del fondo × zoom, con el
  // mismo origen horizontal y vertical y el mismo desplazamiento (pan).
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

let pendientes = 3;
const imagenLista = () => {
  if (--pendientes === 0) loop();
};
[fondo, imgRojo, imgAzul].forEach(img => {
  img.addEventListener("load", imagenLista);
  img.addEventListener("error", imagenLista);
});
// El tamaño real del fondo define la escala base compartida por todo.
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

  // segundo dedo: empieza zoom/pan con 2 dedos
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
  // targets más generosos con el dedo: el margen se expresa en píxeles de
  // pantalla y se traduce a mundo con la misma escala compartida.
  const margen = (toque ? 14 : 4) / escalaTotal();

  // pelota
  if (Math.hypot(w.x - pelota.x, w.y - pelota.y) < pelota.r + 6 + margen) {
    seleccionado = pelota;
    offsetX = w.x - pelota.x;
    offsetY = w.y - pelota.y;
    return;
  }

  // botes (el de arriba primero)
  for (let i = botes.length - 1; i >= 0; i--) {
    const b = botes[i];
    if (Math.hypot(w.x - b.x, w.y - b.y) < (TAM / 2) * b.scale + margen) {
      seleccionado = b;
      offsetX = w.x - b.x;
      offsetY = w.y - b.y;
      return;
    }
  }

  // lápiz
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

  // zoom/pan con 2 dedos
  if (pellizco && punteros.size >= 2) {
    const [a, b] = [...punteros.values()];
    const dist = Math.max(10, Math.hypot(b.x - a.x, b.y - a.y));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = clamp(pellizco.zoom * (dist / pellizco.dist), ZOOM_MIN, ZOOM_MAX);
    // el punto del campo que estaba bajo el centro al iniciar
    // se mantiene bajo el centro actual
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
    seleccionado.rot = Math.atan2(w.y - seleccionado.y, w.x - seleccionado.x);
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

// zoom con la rueda del mouse
canvas.addEventListener(
  "wheel",
  e => {
    e.preventDefault();
    zoomEn(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  },
  { passive: false }
);

// evita el menú contextual al mantener presionado (táctil)
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

/* ================= MOVER LA BARRA (móvil) ================= */
/* Arrastrando el botón de puntos (⠿) la barra se mueve:
   hacia abajo => horizontal en el fondo | hacia arriba => columna a la izquierda */

const barra = document.getElementById("toolbar");
const barraHandle = document.getElementById("barra-handle");

const memoria = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
};

function estadoBarra(abajo) {
  barra.classList.toggle("barra-abajo", abajo);
  memoria.set("pizarra-barra-abajo", abajo ? "1" : "0");
}

if (memoria.get("pizarra-barra-abajo") === "1") {
  barra.classList.add("barra-abajo");
}

let arrastreBarra = null;
barraHandle.addEventListener("pointerdown", e => {
  e.preventDefault();
  arrastreBarra = { y: e.clientY };
  barraHandle.setPointerCapture(e.pointerId);
});

barraHandle.addEventListener("pointermove", e => {
  if (!arrastreBarra) return;
  const dy = e.clientY - arrastreBarra.y;
  if (!barra.classList.contains("barra-abajo") && dy > 45) {
    estadoBarra(true);
    arrastreBarra = null;
  } else if (barra.classList.contains("barra-abajo") && dy < -45) {
    estadoBarra(false);
    arrastreBarra = null;
  }
});

const finArrastreBarra = () => { arrastreBarra = null; };
barraHandle.addEventListener("pointerup", finArrastreBarra);
barraHandle.addEventListener("pointercancel", finArrastreBarra);

// primera vez: recordatorio
if (TOQUE && memoria.get("pizarra-tip-barra") !== "1") {
  memoria.set("pizarra-tip-barra", "1");
  setTimeout(() => {
    avisar("Tip: arrastrá el botón de puntos (⠿) para mover la barra");
  }, 1500);
}

/* ================= INICIO ================= */

setModo("mover");
