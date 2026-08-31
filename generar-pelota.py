#!/usr/bin/env python3
"""Genera pelota.png: una pelota amarilla de waterpolo con fondo transparente."""
from __future__ import annotations

from math import hypot, sin, cos, pi
from pathlib import Path
import struct
import zlib

TAM = 256
CENTRO = TAM / 2
RADIO = 102
COLOR_BRILLO = (255, 248, 210)
COLOR_BASE = (246, 206, 35)
COLOR_SOMBRA = (208, 150, 18)
COLOR_COSTURA = (222, 168, 20)
COLOR_COSTURA_LUZ = (255, 226, 118)


def clamp(valor, minimo, maximo):
    return max(minimo, min(maximo, valor))


def mezclar(a, b, t):
    return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(3))


def png_chunk(tipo, datos):
    return (
        struct.pack(">I", len(datos))
        + tipo
        + datos
        + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    )


def escribir_png_rgba(ruta: Path, imagen):
    alto = len(imagen)
    ancho = len(imagen[0]) if alto else 0
    filas = bytearray()
    for fila in imagen:
        filas.append(0)
        for r, g, b, a in fila:
            filas.extend((r, g, b, a))

    cabecera = struct.pack(">IIBBBBB", ancho, alto, 8, 6, 0, 0, 0)
    contenido = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", cabecera)
        + png_chunk(b"IDAT", zlib.compress(bytes(filas), level=9))
        + png_chunk(b"IEND", b"")
    )
    ruta.write_bytes(contenido)


def alpha_pixel(distancia):
    borde = RADIO - distancia
    if borde >= 1:
        return 255
    if borde <= -1:
        return 0
    return int(round(clamp((borde + 1) / 2, 0, 1) * 255))


def color_pelota(nx, ny):
    luz = clamp(0.5 + (-0.55 * nx) + (-0.72 * ny), 0, 1)
    color = mezclar(COLOR_SOMBRA, COLOR_BASE, 0.35 + 0.65 * luz)

    reflejo = clamp(1 - hypot(nx + 0.38, ny + 0.45) / 0.55, 0, 1)
    if reflejo > 0:
        color = mezclar(color, COLOR_BRILLO, reflejo ** 1.7 * 0.78)

    sombra_baja = clamp((ny - 0.12) / 0.88, 0, 1)
    if sombra_baja > 0:
        color = mezclar(color, COLOR_SOMBRA, sombra_baja * 0.28)

    return color


def intensidad_costura(nx, ny):
    curvas = []
    curvas.append(abs(nx + 0.18 * sin((ny + 0.02) * pi * 2.0)))
    curvas.append(abs(nx - 0.34 + 0.14 * sin((ny - 0.1) * pi * 1.7)))
    curvas.append(abs(nx + 0.34 - 0.14 * sin((ny - 0.1) * pi * 1.7)))

    mejor = min(curvas)
    if mejor > 0.05:
        return 0.0

    atenuacion = clamp(1 - mejor / 0.05, 0, 1)
    polo = clamp(1 - abs(ny) / 1.02, 0, 1)
    return atenuacion * (0.55 + 0.45 * polo)


def generar():
    imagen = [[(0, 0, 0, 0) for _ in range(TAM)] for _ in range(TAM)]

    for y in range(TAM):
        for x in range(TAM):
            dx = (x + 0.5) - CENTRO
            dy = (y + 0.5) - CENTRO
            distancia = hypot(dx, dy)
            alpha = alpha_pixel(distancia)
            if not alpha:
                continue

            nx = dx / RADIO
            ny = dy / RADIO
            color = color_pelota(nx, ny)

            costura = intensidad_costura(nx, ny)
            if costura > 0:
                color = mezclar(color, COLOR_COSTURA, costura * 0.72)
                brillo_costura = clamp(costura * (0.75 - 0.25 * ny), 0, 1)
                if brillo_costura > 0:
                    color = mezclar(color, COLOR_COSTURA_LUZ, brillo_costura * 0.24)

            # Pequeño brillo superior izquierdo para que se lea mejor como imagen.
            brillo = clamp(1 - hypot(nx + 0.26, ny + 0.36) / 0.18, 0, 1)
            if brillo > 0:
                color = mezclar(color, (255, 255, 245), brillo * 0.65)

            imagen[y][x] = (*color, alpha)

    return imagen


def main():
    ruta = Path(__file__).resolve().parent / "pelota.png"
    escribir_png_rgba(ruta, generar())
    print(f"Generado {ruta} ({TAM}x{TAM})")


if __name__ == "__main__":
    main()
