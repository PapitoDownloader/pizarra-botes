/* =====================================================
   Pizarra Táctica · Kayak Polo
   Motor de la pizarra + interfaz
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

/* ================= IMÁGENES ================= */

const fondo = new Image();
const imgRojo = new Image();
const imgAzul = new Image();

fondo.src = "fondo.jpg";
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
const btnLimpiar = document.getElementById("btn-limpiar");
const btnGuardar = document.getElementById("btn-guardar");
const statusTexto = document.getElementById("status-texto");

const AYUDAS = {
  mover: "Mover — arrastra los botes y la pelota",
  rotar: "Rotar — arrastra alrededor del bote para girarlo",
  escalar: "Escalar — arrastra hacia arriba/abajo para cambiar el tamaño",
  lapiz: "Lápiz — dibuja sobre el campo"
};

function avisar(mensaje) {
  statusTexto.textContent = mensaje;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => {
    statusTexto.textContent = AYUDAS[modo];
  }, 2000);
}

function setModo(m) {
  modo = m;
  botonesModo.forEach(b => b.classList.toggle("is-active", b.dataset.modo === m));
  statusTexto.textContent = AYUDAS[m];
  canvas.className = "cur-" + m;
}

botonesModo.forEach(b =>
  b.addEventListener("click", () => setModo(b.dataset.modo))
);
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
  ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 6]);
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
  ctx.lineWidth = 2;
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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

  // pelota
  if (Math.hypot(mx - pelota.x, my - pelota.y) < pelota.r + 6) {
    seleccionado = pelota;
    offsetX = mx - pelota.x;
    offsetY = my - pelota.y;
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  // botes (el de arriba primero)
  for (let i = botes.length - 1; i >= 0; i--) {
    const b = botes[i];
    if (Math.hypot(mx - b.x, my - b.y) < (TAM / 2) * b.scale + 4) {
      seleccionado = b;
      offsetX = mx - b.x;
      offsetY = my - b.y;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
  }

  // lápiz
  if (modo === "lapiz") {
    dibujando = true;
    trazoActual = [{ x: mx, y: my }];
    trazos.push(trazoActual);
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener("pointermove", e => {
  const mx = e.offsetX;
  const my = e.offsetY;

  if (modo === "mover" && seleccionado) {
    seleccionado.x = mx - offsetX;
    seleccionado.y = my - offsetY;
  }

  if (modo === "rotar" && seleccionado && seleccionado.rot !== undefined) {
    seleccionado.rot = Math.atan2(my - seleccionado.y, mx - seleccionado.x);
  }

  if (modo === "escalar" && seleccionado && seleccionado.scale !== undefined) {
    seleccionado.scale = Math.max(0.3, Math.min(2, 1 + (my - seleccionado.y) / 150));
  }

  if (modo === "lapiz" && dibujando) {
    trazoActual.push({ x: mx, y: my });
  }
});

function soltar() {
  seleccionado = null;
  dibujando = false;
}
canvas.addEventListener("pointerup", soltar);
canvas.addEventListener("pointercancel", soltar);

/* ================= ACCIONES ================= */

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
