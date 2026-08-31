const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let modo = "mover";
let seleccionado = null;
let offsetX = 0;
let offsetY = 0;
let dibujando = false;

/* IMÁGENES */
const fondo = new Image();
const imgRojo = new Image();
const imgAzul = new Image();

fondo.src = "FONDO.png";
imgRojo.src = "Kayapolored__1_-removebg-preview.png";
imgAzul.src = "KayapoloRC__1_-removebg-preview.png";

/* OBJETOS */
const TAM = 70;
const botes = [];

for (let i = 0; i < 8; i++) {
  botes.push({ img: imgRojo, x: 100 + i * 80, y: 120, rot: 0, scale: 1 });
  botes.push({ img: imgAzul, x: 100 + i * 80, y: 220, rot: 0, scale: 1 });
}

const pelota = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  r: 8
};

const trazos = [];
let trazoActual = [];

/* CARGA DE IMÁGENES */
let cargadas = 0;
[fondo, imgRojo, imgAzul].forEach(img => {
  img.onload = () => {
    cargadas++;
    if (cargadas === 3) loop();
  };
});

/* DIBUJO */
function dibujarFondo() {
  const r = Math.min(canvas.width / fondo.width, canvas.height / fondo.height);
  const w = fondo.width * r;
  const h = fondo.height * r;
  ctx.drawImage(fondo, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

function dibujarBotes() {
  botes.forEach(b => {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(b.scale, b.scale);
    ctx.drawImage(b.img, -TAM / 2, -TAM / 2, TAM, TAM);
    ctx.restore();
  });
}

function dibujarPelota() {
  ctx.beginPath();
  ctx.arc(pelota.x, pelota.y, pelota.r, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();
}

function dibujarTrazos() {
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
  trazos.forEach(t => {
    ctx.beginPath();
    t.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  });
}

/* LOOP */
function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  dibujarFondo();
  dibujarBotes();
  dibujarPelota();
  dibujarTrazos();
  requestAnimationFrame(loop);
}

/* INTERACCIÓN */
canvas.addEventListener("mousedown", e => {
  const mx = e.offsetX;
  const my = e.offsetY;

  if (Math.hypot(mx - pelota.x, my - pelota.y) < pelota.r + 5) {
    seleccionado = pelota;
    offsetX = mx - pelota.x;
    offsetY = my - pelota.y;
    return;
  }

  for (let i = botes.length - 1; i >= 0; i--) {
    const b = botes[i];
    if (Math.hypot(mx - b.x, my - b.y) < TAM / 2) {
      seleccionado = b;
      offsetX = mx - b.x;
      offsetY = my - b.y;
      return;
    }
  }

  if (modo === "lapiz") {
    dibujando = true;
    trazoActual = [{ x: mx, y: my }];
    trazos.push(trazoActual);
  }
});

canvas.addEventListener("mousemove", e => {
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

canvas.addEventListener("mouseup", () => {
  seleccionado = null;
  dibujando = false;
});

canvas.addEventListener("mouseleave", () => {
  seleccionado = null;
  dibujando = false;
});

/* ATAJOS */
window.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key === "z") trazos.pop();
});

/* UI */
function setModo(m) {
  modo = m;
  canvas.style.cursor =
    m === "mover" ? "grab" :
    m === "rotar" ? "crosshair" :
    m === "escalar" ? "ns-resize" :
    "cell";
}

function limpiar() {
  trazos.length = 0;
}

function guardar() {
  const a = document.createElement("a");
  a.download = "pizarra.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}
