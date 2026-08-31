/* =====================================================
   Pizarra Táctica · Kayak Polo
   Motor de la pizarra + interfaz (mouse, táctil y lápiz)
   Vista: zoom con pinch/rueda + pan con 2 dedos
   ===================================================== */

/* ================= CANVAS ================= */

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function ajustarCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
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

// de coordenadas de pantalla a coordenadas del campo
function aMundo(sx, sy) {
  return { x: (sx - vista.x) / vista.zoom, y: (sy - vista.y) / vista.zoom };
}

// zoom manteniendo fijo el punto (sx, sy)
function zoomEn(sx, sy, factor) {
  const zoom = clamp(vista.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const w = aMundo(sx, sy);
  vista.zoom = zoom;
  vista.x = sx - w.x * zoom;
  vista.y = sy - w.y * zoom;
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

// 8 rojos + 8 azules
for (let i = 0; i < 8; i++) {
  botes.push({ img: imgRojo, x: 100 + i * 80, y: 120, rot: 0, scale: 1 });
  botes.push({ img: imgAzul, x: 100 + i * 80, y: 220, rot: 0, scale: 1 });
}

const pelota = { x: canvas.width / 2, y: canvas.height / 2, r: 8 };

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
  const r = Math.min(canvas.width / fondo.width, canvas.height / fondo.height);
  const w = fondo.width * r;
  const h = fondo.height * r;
  ctx.drawImage(fondo, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

function anillo(x, y, radio) {
  ctx.beginPath();
  ctx.arc(x, y, radio, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 2.5 / vista.zoom;
  ctx.setLineDash([7 / vista.zoom, 6 / vista.zoom]);
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
  ctx.lineWidth = 2 / vista.zoom;
  ctx.strokeStyle = "rgba(15, 23, 42, 0.75)";
  ctx.stroke();

  if (pelota === seleccionado) anillo(pelota.x, pelota.y, pelota.r + 8);
}

function dibujarTrazos() {
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
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
  ctx.setTransform(vista.zoom, 0, 0, vista.zoom, vista.x, vista.y);
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
  const margen = toque ? 14 : 4; // targets más generosos con el dedo

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
    seleccionado.scale = clamp(1 + (w.y - seleccionado.y) / 150, 0.3, 2);
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

/* ================= INICIO ================= */

setModo("mover");
