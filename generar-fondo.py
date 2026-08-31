#!/usr/bin/env python3
"""Genera FONDO.png para la pizarra táctica de kayak polo.

Toda la geometría del campo está definida en metros. La única conversión a
píxeles se hace con ESCALA_PX_M, de modo que 50 píxeles representan un metro.
"""
from pathlib import Path
import struct
import zlib


ESCALA_PX_M = 50
CAMPO_LARGO_M = 35
CAMPO_ANCHO_M = 23
ANCHO_PNG, ALTO_PNG = 1178, 1928

# El campo queda centrado en el lienzo, con un margen que también se expresa
# en metros (el PNG completo no tiene que ser un número entero de metros).
MARGEN_X_M = (ANCHO_PNG / ESCALA_PX_M - CAMPO_ANCHO_M) / 2
MARGEN_Y_M = (ALTO_PNG / ESCALA_PX_M - CAMPO_LARGO_M) / 2

AGUA = (0x01, 0x79, 0xCE)
VERDE = (0x5A, 0x6F, 0x43)
BLANCO = (0xFF, 0xFF, 0xFF)
RED = (0xB9, 0xD7, 0xDF)

# Espesores y medidas de las marcas, siempre en metros.
BORDE_M = 0.12
LINEA_M = 0.10
POSTE_ARCO_M = 0.08

# Medidas reglamentarias del único arco que se dibuja sobre el campo.
ARCO_ANCHO_M = 1.5
ARCO_PROFUNDIDAD_M = 1.0
# Paso de la malla del arco: da una cuadrícula densa dentro del rectángulo.
ARCO_MALLA_PASO_M = 0.125

# Franja de agua que queda por detrás de la línea de gol para que el arco
# se apoye sobre agua y no sobre el marco verde.
AGUA_DETRAS_ARCO_M = 1.5

# Medidas de las líneas punteadas, expresadas en metros.
LINEA_SEIS_METROS_M = 6
LINEA_MITAD_M = CAMPO_LARGO_M / 2
TRAMO_PUNTEADO_M = 0.5
ESPACIO_PUNTEADO_M = 0.35


def metros_a_px(metros):
    """Convierte una medida en metros a píxeles enteros, redondeando .5 arriba."""
    return int(metros * ESCALA_PX_M + 0.5)


def punto_campo(x_m, y_m):
    """Devuelve un punto absoluto del PNG a partir de metros dentro del campo."""
    return (
        metros_a_px(MARGEN_X_M + x_m),
        metros_a_px(MARGEN_Y_M + y_m),
    )


def rectangulo(im, x1, y1, x2, y2, color):
    """Rellena [x1, x2) × [y1, y2) sin introducir colores intermedios."""
    x1 = max(0, min(ANCHO_PNG, x1))
    x2 = max(0, min(ANCHO_PNG, x2))
    y1 = max(0, min(ALTO_PNG, y1))
    y2 = max(0, min(ALTO_PNG, y2))
    if x1 >= x2 or y1 >= y2:
        return
    fila = [color] * (x2 - x1)
    for y in range(y1, y2):
        im[y][x1:x2] = fila


def linea(im, x1, y1, x2, y2, color, grosor_m=LINEA_M):
    """Dibuja una línea sólida, sin antialiasing, con grosor expresado en metros."""
    grosor_px = max(1, metros_a_px(grosor_m))
    pasos = max(abs(x2 - x1), abs(y2 - y1), 1)
    desplazamientos = range(-(grosor_px // 2), grosor_px - grosor_px // 2)

    for n in range(pasos + 1):
        x = int(round(x1 + (x2 - x1) * n / pasos))
        y = int(round(y1 + (y2 - y1) * n / pasos))
        for desplazamiento in desplazamientos:
            # Las líneas del plano son horizontales o verticales. Aplicar el
            # mismo cuadrado pequeño en ambos ejes conserva las esquinas limpias.
            for xx, yy in (
                (x + desplazamiento, y),
                (x, y + desplazamiento),
            ):
                if 0 <= xx < ANCHO_PNG and 0 <= yy < ALTO_PNG:
                    im[yy][xx] = color


def linea_campo(im, x1_m, y1_m, x2_m, y2_m, color, grosor_m=LINEA_M):
    """Dibuja una línea usando coordenadas relativas al campo, en metros."""
    x1, y1 = punto_campo(x1_m, y1_m)
    x2, y2 = punto_campo(x2_m, y2_m)
    linea(im, x1, y1, x2, y2, color, grosor_m)


def linea_punteada_horizontal(im, y_m):
    """Dibuja una línea horizontal punteada de lateral a lateral."""
    inicio_m = 0.0
    while inicio_m < CAMPO_ANCHO_M:
        fin_m = min(inicio_m + TRAMO_PUNTEADO_M, CAMPO_ANCHO_M)
        linea_campo(im, inicio_m, y_m, fin_m, y_m, BLANCO, LINEA_M)
        inicio_m += TRAMO_PUNTEADO_M + ESPACIO_PUNTEADO_M


def dibujar_arco_superior(im):
    """Dibuja el único arco: un rectángulo de 1,5 m x 1 m con malla densa.

    El arco queda centrado sobre la línea de gol superior, apoyado sobre la
    franja de agua que hay detrás de esa línea, tal como en la referencia.
    """
    lateral_izquierdo_m = (CAMPO_ANCHO_M - ARCO_ANCHO_M) / 2
    lateral_derecho_m = lateral_izquierdo_m + ARCO_ANCHO_M
    fondo_m = -ARCO_PROFUNDIDAD_M

    # Malla: cuadrícula densa de hilos verticales y horizontales que cubre
    # todo el interior del rectángulo del arco (1,5 m x 1 m = 75 x 50 px).
    hilo_m = 0.0
    while hilo_m <= ARCO_ANCHO_M + 1e-9:
        x_m = lateral_izquierdo_m + hilo_m
        linea_campo(im, x_m, 0, x_m, fondo_m, RED, 0.02)
        hilo_m += ARCO_MALLA_PASO_M

    hilo_m = 0.0
    while hilo_m <= ARCO_PROFUNDIDAD_M + 1e-9:
        y_m = -hilo_m
        linea_campo(im, lateral_izquierdo_m, y_m, lateral_derecho_m, y_m, RED, 0.02)
        hilo_m += ARCO_MALLA_PASO_M

    # Marco blanco del arco: los dos postes delimitan exactamente 1,5 m entre
    # sus líneas centrales y se prolongan exactamente 1 m fuera de la línea de
    # gol, donde los cierra el travesaño posterior.
    linea_campo(
        im, lateral_izquierdo_m, 0, lateral_izquierdo_m, fondo_m,
        BLANCO, POSTE_ARCO_M,
    )
    linea_campo(
        im, lateral_derecho_m, 0, lateral_derecho_m, fondo_m,
        BLANCO, POSTE_ARCO_M,
    )
    linea_campo(
        im, lateral_izquierdo_m, fondo_m, lateral_derecho_m, fondo_m,
        BLANCO, POSTE_ARCO_M,
    )


def generar():
    im = [[VERDE] * ANCHO_PNG for _ in range(ALTO_PNG)]

    campo_x1, campo_y1 = punto_campo(0, 0)
    campo_x2, campo_y2 = punto_campo(CAMPO_ANCHO_M, CAMPO_LARGO_M)
    # El rectángulo de agua tiene exactamente 1150 × 1750 píxeles entre sus
    # líneas de referencia, porque mide 23 × 35 metros a 50 píxeles por metro.
    rectangulo(im, campo_x1, campo_y1, campo_x2, campo_y2, AGUA)

    # Agua detrás de la línea de gol: la pileta sigue más allá del campo
    # jugable, así el arco se apoya sobre agua y no sobre el marco verde.
    # No mueve la línea de gol ni cambia las medidas del campo.
    _, agua_detras_y = punto_campo(0, -AGUA_DETRAS_ARCO_M)
    rectangulo(im, campo_x1, agua_detras_y, campo_x2, campo_y1, AGUA)

    dibujar_arco_superior(im)

    # Línea de seis metros desde la única línea de gol superior y línea de
    # mitad del campo: ambas son horizontales y punteadas.
    linea_punteada_horizontal(im, LINEA_SEIS_METROS_M)
    linea_punteada_horizontal(im, LINEA_MITAD_M)

    # Borde exterior blanco. La arista superior del campo jugable es la única
    # línea de gol sólida; no se dibuja una segunda línea de gol ni otro arco
    # abajo. Los laterales acompañan también al agua que queda detrás del arco.
    linea_campo(im, 0, 0, CAMPO_ANCHO_M, 0, BLANCO, BORDE_M)
    linea_campo(im, 0, CAMPO_LARGO_M, CAMPO_ANCHO_M, CAMPO_LARGO_M, BLANCO, BORDE_M)
    linea_campo(im, 0, -AGUA_DETRAS_ARCO_M, 0, CAMPO_LARGO_M, BLANCO, BORDE_M)
    linea_campo(
        im, CAMPO_ANCHO_M, -AGUA_DETRAS_ARCO_M,
        CAMPO_ANCHO_M, CAMPO_LARGO_M, BLANCO, BORDE_M,
    )
    # Cierre superior de la pileta, por detrás del arco.
    linea_campo(
        im, 0, -AGUA_DETRAS_ARCO_M, CAMPO_ANCHO_M, -AGUA_DETRAS_ARCO_M,
        BLANCO, BORDE_M,
    )

    return im


def png_chunk(tipo, datos):
    return (
        struct.pack(">I", len(datos))
        + tipo
        + datos
        + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    )


def escribir_png(ruta, im):
    """Escribe un PNG RGB válido usando únicamente la biblioteca estándar."""
    filas = bytearray()
    for fila in im:
        filas.append(0)  # filtro PNG: none
        for pixel in fila:
            filas.extend(pixel)

    cabecera = struct.pack(">IIBBBBB", ANCHO_PNG, ALTO_PNG, 8, 2, 0, 0, 0)
    contenido = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", cabecera)
        + png_chunk(b"IDAT", zlib.compress(bytes(filas), level=9))
        + png_chunk(b"IEND", b"")
    )
    ruta.write_bytes(contenido)


def main():
    png = Path(__file__).resolve().parent / "FONDO.png"
    escribir_png(png, generar())
    print(f"Generado {png} ({ANCHO_PNG}x{ALTO_PNG}) a {ESCALA_PX_M} px/m")


if __name__ == "__main__":
    main()
