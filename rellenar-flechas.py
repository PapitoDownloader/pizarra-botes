#!/usr/bin/env python3
"""Rellena huecos interiores de sprites PNG con color opaco.

Detecta huecos interiores: píxeles con alfa ≤ 8 no conectados (4-conexo) con el borde.
Pinta esos huecos de blanco opaco y compone el borde antialiasado sobre blanco
en una zona dilatada 4 px, excluyendo píxeles a ≤ 3 px del exterior.

Uso:
  ./rellenar-flechas.py bote-rojo.png bote-azul.png
  ./rellenar-flechas.py --color 255,255,255 bote-rojo.png --salida bote-rojo-nuevo.png
"""

from __future__ import annotations

import argparse
import importlib.util
import pathlib
import struct
import sys
import zlib
from collections import deque
from typing import List, Tuple

# ----------------------------------------------------------------------
# Cargar read_png de preparar-sprites.py (nombre con guion)
# ----------------------------------------------------------------------
def cargar_read_png():
    ruta = pathlib.Path(__file__).resolve().parent / "preparar-sprites.py"
    spec = importlib.util.spec_from_file_location("preparar_sprites", str(ruta))
    if spec is None or spec.loader is None:
        raise ImportError("No se pudo cargar preparar-sprites.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.read_png

read_png = cargar_read_png()

# ----------------------------------------------------------------------
# PNG writer con selección de filtro por fila
# ----------------------------------------------------------------------
def png_chunk(tipo: bytes, datos: bytes) -> bytes:
    return (
        struct.pack(">I", len(datos))
        + tipo
        + datos
        + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    )

def paeth_predictor(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c

def write_png_rgba(path: pathlib.Path, image: List[List[Tuple[int, int, int, int]]]):
    """Escribe PNG RGBA 8 bits eligiendo por fila el filtro de menor costo."""
    h = len(image)
    if h == 0:
        raise ValueError("Imagen vacía")
    w = len(image[0])
    bpp = 4  # bytes per pixel

    # Convert image to list of raw byte rows (unfiltered)
    raw_rows: List[bytes] = []
    for y in range(h):
        row = bytearray(w * bpp)
        idx = 0
        for r, g, b, a in image[y]:
            row[idx] = r & 0xFF
            row[idx+1] = g & 0xFF
            row[idx+2] = b & 0xFF
            row[idx+3] = a & 0xFF
            idx += 4
        raw_rows.append(bytes(row))

    out = bytearray()
    prev_raw = None

    for y in range(h):
        raw = raw_rows[y]
        stride = len(raw)
        # Precompute candidates
        best_filter = 0
        best_cost = None
        best_filtered = None

        # For each filter type 0..4
        for ftype in range(5):
            filtered = bytearray(stride)
            if ftype == 0:  # None
                for i in range(stride):
                    filtered[i] = raw[i]
            elif ftype == 1:  # Sub
                for i in range(stride):
                    left = raw[i - bpp] if i >= bpp else 0
                    filtered[i] = (raw[i] - left) & 0xFF
            elif ftype == 2:  # Up
                if prev_raw is None:
                    for i in range(stride):
                        filtered[i] = raw[i]
                else:
                    for i in range(stride):
                        up = prev_raw[i]
                        filtered[i] = (raw[i] - up) & 0xFF
            elif ftype == 3:  # Average
                if prev_raw is None:
                    for i in range(stride):
                        left = raw[i - bpp] if i >= bpp else 0
                        filtered[i] = (raw[i] - (left // 2)) & 0xFF
                else:
                    for i in range(stride):
                        left = raw[i - bpp] if i >= bpp else 0
                        up = prev_raw[i]
                        filtered[i] = (raw[i] - ((left + up) // 2)) & 0xFF
            else:  # Paeth
                if prev_raw is None:
                    for i in range(stride):
                        left = raw[i - bpp] if i >= bpp else 0
                        # up=0, up_left=0
                        filtered[i] = (raw[i] - paeth_predictor(left, 0, 0)) & 0xFF
                else:
                    for i in range(stride):
                        left = raw[i - bpp] if i >= bpp else 0
                        up = prev_raw[i]
                        up_left = prev_raw[i - bpp] if i >= bpp else 0
                        filtered[i] = (raw[i] - paeth_predictor(left, up, up_left)) & 0xFF

            # Cost: sum of absolute values of filtered bytes as signed
            # signed = b if b<128 else b-256
            cost = 0
            # manual loop for speed
            for b in filtered:
                if b < 128:
                    cost += b
                else:
                    cost += 256 - b  # abs(b-256)
                # early break if already worse than best
                if best_cost is not None and cost > best_cost:
                    break

            if best_cost is None or cost < best_cost:
                best_cost = cost
                best_filter = ftype
                best_filtered = filtered
                if cost == 0:
                    break

        # Write filter byte + filtered data
        out.append(best_filter)
        out.extend(best_filtered)
        prev_raw = raw

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", zlib.compress(bytes(out), level=9))
        + png_chunk(b"IEND", b"")
    )
    path.write_bytes(png_bytes)

# ----------------------------------------------------------------------
# Detección de huecos y relleno
# ----------------------------------------------------------------------
def detectar_huecos(image):
    h = len(image)
    w = len(image[0]) if h else 0
    if w == 0 or h == 0:
        return [], [], (0, 0, 0, 0), 0, 0

    # Máscara de transparencia alfa ≤ 8
    is_trans = [[False]*w for _ in range(h)]
    for y in range(h):
        row = image[y]
        tr = is_trans[y]
        for x in range(w):
            if row[x][3] <= 8:
                tr[x] = True

    visited = [[False]*w for _ in range(h)]
    q = deque()

    # Bordes
    for x in range(w):
        if is_trans[0][x] and not visited[0][x]:
            visited[0][x] = True
            q.append((x, 0))
        if is_trans[h-1][x] and not visited[h-1][x]:
            visited[h-1][x] = True
            q.append((x, h-1))
    for y in range(h):
        if is_trans[y][0] and not visited[y][0]:
            visited[y][0] = True
            q.append((0, y))
        if is_trans[y][w-1] and not visited[y][w-1]:
            visited[y][w-1] = True
            q.append((w-1, y))

    while q:
        x, y = q.popleft()
        # 4-conexo
        if x > 0 and is_trans[y][x-1] and not visited[y][x-1]:
            visited[y][x-1] = True
            q.append((x-1, y))
        if x + 1 < w and is_trans[y][x+1] and not visited[y][x+1]:
            visited[y][x+1] = True
            q.append((x+1, y))
        if y > 0 and is_trans[y-1][x] and not visited[y-1][x]:
            visited[y-1][x] = True
            q.append((x, y-1))
        if y + 1 < h and is_trans[y+1][x] and not visited[y+1][x]:
            visited[y+1][x] = True
            q.append((x, y+1))

    # Huecos interiores
    holes = []
    min_x = w
    max_x = -1
    min_y = h
    max_y = -1
    for y in range(h):
        tr = is_trans[y]
        vis = visited[y]
        for x in range(w):
            if tr[x] and not vis[x]:
                holes.append((x, y))
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y

    if not holes:
        bbox = None
    else:
        bbox = (min_x, min_y, max_x, max_y)

    return holes, visited, bbox, w, h

def procesar_imagen(image, color_rgb, holes, exterior_visited, w, h):
    """Aplica relleno y composición. Devuelve imagen modificada y stats."""
    # Color de relleno
    cr, cg, cb = color_rgb
    # Conjuntos para búsqueda rápida
    hole_set = set(holes)

    # Dilar hueco 4 px (euclídeo r<=4)
    dilated = set()
    r2 = 16
    for (x, y) in holes:
        # iterar vecindario 9x9
        x0 = max(0, x - 4)
        x1 = min(w-1, x + 4)
        y0 = max(0, y - 4)
        y1 = min(h-1, y + 4)
        for ny in range(y0, y1+1):
            dy = ny - y
            dy2 = dy*dy
            # early skip if dy^2 >16
            if dy2 > r2:
                continue
            for nx in range(x0, x1+1):
                dx = nx - x
                if dx*dx + dy2 <= r2:
                    dilated.add((nx, ny))

    # Para cada píxel dilatado, verificar si está a ≤3 px del exterior
    # Exterior = visited True (transparente conectado al borde)
    # Chequeo eficiente: para cada píxel en dilated, mirar vecindario 7x7 r<=3
    excluidos = set()
    r_excl2 = 9
    # Precomputar lista de offsets dentro de radio 3
    offsets_r3 = []
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            if dx*dx + dy*dy <= r_excl2:
                offsets_r3.append((dx, dy))

    # Para acelerar, usar visited matriz
    for (x, y) in dilated:
        # si ya es exterior (transparente de fondo) lo excluimos también (no queremos tocar fondo)
        # La exclusión por cercanía ya lo cubre, pero chequeamos
        encontrado = False
        for dx, dy in offsets_r3:
            nx = x + dx
            ny = y + dy
            if 0 <= nx < w and 0 <= ny < h:
                if exterior_visited[ny][nx]:
                    encontrado = True
                    break
        if encontrado:
            excluidos.add((x, y))

    # Ahora modificar
    modificados = 0
    # Convertir a lista de listas mutable ya lo es, pero aseguramos
    for (x, y) in dilated:
        if (x, y) in excluidos:
            continue
        r, g, b, a = image[y][x]
        if (x, y) in hole_set:
            # Pintar blanco opaco
            if (r, g, b, a) != (cr, cg, cb, 255):
                image[y][x] = (cr, cg, cb, 255)
                modificados += 1
            else:
                # ya era blanco opaco? contar igual como hueco rellenado
                modificados += 1
        else:
            if a == 255:
                continue
            # Componer sobre blanco
            # rgb' = rgb*a + 255*(1-a)
            # con a normalizado 0..1 => a/255
            # Usamos redondeo: (r*a + 255*(255-a) + 127)//255
            nr = (r * a + cr * (255 - a) + 127) // 255
            ng = (g * a + cg * (255 - a) + 127) // 255
            nb = (b * a + cb * (255 - a) + 127) // 255
            # Solo si cambia
            if (nr, ng, nb, 255) != (r, g, b, a):
                image[y][x] = (nr, ng, nb, 255)
                modificados += 1

    # Nota: modificados incluye también huecos interiores + borde antialias
    # Pero para informe de huecos rellenados queremos contar solo huecos interiores
    # Devolvemos también bbox y conteos
    return image, modificados

def procesar_archivo(ruta_entrada: pathlib.Path, ruta_salida: pathlib.Path, color_rgb):
    image = read_png(ruta_entrada)
    holes, exterior_visited, bbox, w, h = detectar_huecos(image)

    if not holes:
        print(f"{ruta_entrada}: sin huecos interiores")
        return False, 0, None

    # Informe
    min_x, min_y, max_x, max_y = bbox
    print(f"{ruta_entrada}: {len(holes)} px en 1 hueco(s) bbox x[{min_x},{max_x}] y[{min_y},{max_y}]")

    # Procesar
    image_mod, _ = procesar_imagen(image, color_rgb, holes, exterior_visited, w, h)

    # Escribir
    write_png_rgba(ruta_salida, image_mod)
    print(f"  -> escrito {ruta_salida} ({w}x{h})")

    return True, len(holes), bbox

def parse_color(s: str):
    try:
        parts = [int(p.strip()) for p in s.split(",")]
        if len(parts) != 3:
            raise ValueError
        for v in parts:
            if not (0 <= v <= 255):
                raise ValueError
        return tuple(parts)
    except:
        raise argparse.ArgumentTypeError(f"Color debe ser R,G,B con valores 0-255, recibido: {s}")

def main():
    parser = argparse.ArgumentParser(description="Rellena huecos interiores de sprites PNG con color opaco")
    parser.add_argument("entradas", nargs="+", type=pathlib.Path, help="Rutas a PNGs")
    parser.add_argument("--color", type=parse_color, default=(255, 255, 255), help="Color R,G,B (por defecto blanco)")
    parser.add_argument("--salida", type=pathlib.Path, help="Ruta de salida (solo si hay una entrada)")
    args = parser.parse_args()

    if args.salida and len(args.entradas) != 1:
        parser.error("--salida solo puede usarse con una única entrada")

    color = args.color

    for entrada in args.entradas:
        if not entrada.is_file():
            print(f"{entrada}: no existe", file=sys.stderr)
            continue
        salida = args.salida if args.salida else entrada
        procesar_archivo(entrada, salida, color)

if __name__ == "__main__":
    main()
