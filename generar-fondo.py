#!/usr/bin/env python3
"""Genera FONDO.png para la pizarra, usando geometría expresada en metros."""
from pathlib import Path
import subprocess

ESCALA_PX_M = 50
CAMPO_LARGO_M = 35
CAMPO_ANCHO_M = 23
ANCHO_PNG, ALTO_PNG = 1178, 1928
CAMPO_X = int((ANCHO_PNG - CAMPO_ANCHO_M * ESCALA_PX_M) / 2)  # 14
CAMPO_Y = int((ALTO_PNG - CAMPO_LARGO_M * ESCALA_PX_M) / 2)  # 89
ANCHO_CAMPO = CAMPO_ANCHO_M * ESCALA_PX_M
LARGO_CAMPO = CAMPO_LARGO_M * ESCALA_PX_M
VERDE = (0x5A, 0x6F, 0x43)
AGUA = (0x01, 0x79, 0xCE)
BLANCO = (255, 255, 255)
RED = (185, 215, 223)


def linea(im, x1, y1, x2, y2, color, grosor=1):
    """Línea rasterizada, suficiente para conservar colores exactos del plano."""
    dx, dy = abs(x2 - x1), abs(y2 - y1)
    pasos = max(dx, dy, 1)
    for n in range(pasos + 1):
        x = round(x1 + (x2 - x1) * n / pasos)
        y = round(y1 + (y2 - y1) * n / pasos)
        radio = grosor // 2
        for yy in range(y - radio, y + radio + 1):
            for xx in range(x - radio, x + radio + 1):
                if 0 <= xx < ANCHO_PNG and 0 <= yy < ALTO_PNG:
                    im[yy][xx] = color


def rect(im, x1, y1, x2, y2, color):
    for y in range(max(0, y1), min(ALTO_PNG, y2 + 1)):
        im[y][max(0, x1):min(ANCHO_PNG, x2 + 1)] = [color] * (min(ANCHO_PNG, x2 + 1) - max(0, x1))


def generar():
    im = [[VERDE] * ANCHO_PNG for _ in range(ALTO_PNG)]
    # 23 x 35 metros exactos: desde x=14..1163 y=89..1838.
    rect(im, CAMPO_X, CAMPO_Y, CAMPO_X + ANCHO_CAMPO - 1, CAMPO_Y + LARGO_CAMPO - 1, AGUA)
    # Coordenadas de las líneas (no de los píxeles interiores): las
    # separaciones entre centros son exactamente 1150 y 1750 px.
    derecha = CAMPO_X + ANCHO_CAMPO
    abajo = CAMPO_Y + LARGO_CAMPO
    mitad = CAMPO_Y + LARGO_CAMPO // 2

    # Redes y postes, fuera de cada línea de gol.
    for arriba, sentido in ((CAMPO_Y, -1), (abajo, 1)):
        a, b = CAMPO_X + 475, CAMPO_X + 674
        fondo = arriba + sentido * 68
        linea(im, a, arriba, b, arriba, BLANCO, 4)
        linea(im, a, arriba, a, fondo, BLANCO, 4)
        linea(im, b, arriba, b, fondo, BLANCO, 4)
        for separacion in (17, 34, 51):
            linea(im, a, arriba + sentido * separacion, b, arriba + sentido * separacion, RED, 2)

    # Borde blanco y líneas de gol sólidas (las cuatro aristas son deliberadas).
    linea(im, CAMPO_X, CAMPO_Y, derecha, CAMPO_Y, BLANCO, 6)
    linea(im, CAMPO_X, abajo, derecha, abajo, BLANCO, 6)
    linea(im, CAMPO_X, CAMPO_Y, CAMPO_X, abajo, BLANCO, 6)
    linea(im, derecha, CAMPO_Y, derecha, abajo, BLANCO, 6)
    # Mitad punteada.
    for x in range(CAMPO_X, derecha + 1, 42):
        linea(im, x, mitad, min(x + 24, derecha), mitad, BLANCO, 5)
    # Áreas de portería, también a escala de metros (6 m de profundidad, 11 m ancho).
    for y, direccion in ((CAMPO_Y, 1), (abajo, -1)):
        linea(im, CAMPO_X + 300, y, CAMPO_X + 300, y + direccion * 300, BLANCO, 5)
        linea(im, CAMPO_X + 300, y + direccion * 300, CAMPO_X + 850, y + direccion * 300, BLANCO, 5)
        linea(im, CAMPO_X + 850, y + direccion * 300, CAMPO_X + 850, y, BLANCO, 5)
    return im


def main():
    raiz = Path(__file__).resolve().parent
    ppm = raiz / "FONDO.ppm"
    png = raiz / "FONDO.png"
    im = generar()
    with ppm.open("wb") as archivo:
        archivo.write(f"P6\n{ANCHO_PNG} {ALTO_PNG}\n255\n".encode())
        archivo.write(b"".join(bytes(pixel) for fila in im for pixel in fila))
    subprocess.run([
        "convert", str(ppm), "-strip",
        "-define", "png:color-type=2", "-define", "png:bit-depth=8", str(png)
    ], check=True)
    ppm.unlink()
    print(f"Generado {png} ({ANCHO_PNG}x{ALTO_PNG}) a {ESCALA_PX_M} px/m")


if __name__ == "__main__":
    main()
