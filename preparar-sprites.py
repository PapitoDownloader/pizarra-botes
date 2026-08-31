#!/usr/bin/env python3
"""Prepara sprites PNG para la pizarra.

Uso típico:
    python3 preparar-sprites.py tu-rojo.png bote-rojo.png --tipo bote --tam 256

Funciones principales para sprites de bote:
- elimina un fondo uniforme si la imagen no trae transparencia,
- orienta el casco con la proa hacia arriba,
- limpia flechas oscuras pequeñas cerca de las puntas,
- dibuja flechas blancas nuevas en ambas puntas,
- exporta un PNG cuadrado y transparente listo para usarse como sprite.
"""
from __future__ import annotations

import argparse
from collections import deque
from math import atan2, ceil, cos, hypot, pi, sin
from pathlib import Path
import struct
import zlib


def clamp(valor, minimo, maximo):
    return max(minimo, min(maximo, valor))


def lerp(a, b, t):
    return a * (1 - t) + b * t


def color_dist(c1, c2):
    return sum((int(c1[i]) - int(c2[i])) ** 2 for i in range(3)) ** 0.5


def png_chunk(tipo, datos):
    return (
        struct.pack(">I", len(datos))
        + tipo
        + datos
        + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    )


def paeth(a, b, c):
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png(path: Path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} no es un PNG válido")

    idx = 8
    width = height = None
    bit_depth = color_type = None
    palette = None
    trns = None
    idat = bytearray()

    while idx < len(data):
        chunk_len = struct.unpack(">I", data[idx:idx + 4])[0]
        idx += 4
        chunk_type = data[idx:idx + 4]
        idx += 4
        chunk_data = data[idx:idx + chunk_len]
        idx += chunk_len
        idx += 4  # crc

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, compression, flt, interlace = struct.unpack(">IIBBBBB", chunk_data)
            if compression != 0 or flt != 0 or interlace != 0:
                raise ValueError("PNG no soportado: requiere compresión/filtro/interlace estándar")
            if bit_depth != 8:
                raise ValueError("PNG no soportado: solo se admite profundidad de 8 bits")
        elif chunk_type == b"PLTE":
            palette = [tuple(chunk_data[i:i + 3]) for i in range(0, len(chunk_data), 3)]
        elif chunk_type == b"tRNS":
            trns = chunk_data
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break

    if width is None or height is None:
        raise ValueError("PNG sin cabecera IHDR")

    channels = {2: 3, 3: 1, 6: 4}.get(color_type)
    if channels is None:
        raise ValueError(f"PNG no soportado: color type {color_type}")

    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    pos = 0
    rows = []
    prev = bytearray(stride)

    for _ in range(height):
        filtro = raw[pos]
        pos += 1
        row = bytearray(raw[pos:pos + stride])
        pos += stride

        if filtro == 1:
            for i in range(channels, stride):
                row[i] = (row[i] + row[i - channels]) & 255
        elif filtro == 2:
            for i in range(stride):
                row[i] = (row[i] + prev[i]) & 255
        elif filtro == 3:
            for i in range(stride):
                left = row[i - channels] if i >= channels else 0
                row[i] = (row[i] + ((left + prev[i]) // 2)) & 255
        elif filtro == 4:
            for i in range(stride):
                left = row[i - channels] if i >= channels else 0
                up = prev[i]
                up_left = prev[i - channels] if i >= channels else 0
                row[i] = (row[i] + paeth(left, up, up_left)) & 255
        elif filtro != 0:
            raise ValueError(f"Filtro PNG no soportado: {filtro}")

        rows.append(row)
        prev = row

    image = []
    if color_type == 6:
        for row in rows:
            rgba_row = []
            for i in range(0, len(row), 4):
                rgba_row.append((row[i], row[i + 1], row[i + 2], row[i + 3]))
            image.append(rgba_row)
    elif color_type == 2:
        for row in rows:
            rgba_row = []
            for i in range(0, len(row), 3):
                rgba_row.append((row[i], row[i + 1], row[i + 2], 255))
            image.append(rgba_row)
    else:  # paleta
        if palette is None:
            raise ValueError("PNG indexado sin paleta")
        alpha_palette = [255] * len(palette)
        if trns is not None:
            for i, a in enumerate(trns):
                if i < len(alpha_palette):
                    alpha_palette[i] = a
        for row in rows:
            rgba_row = []
            for idx_color in row:
                r, g, b = palette[idx_color]
                rgba_row.append((r, g, b, alpha_palette[idx_color]))
            image.append(rgba_row)

    return image


def write_png(path: Path, image):
    height = len(image)
    width = len(image[0]) if height else 0
    raw = bytearray()
    for row in image:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((int(r), int(g), int(b), int(a)))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", zlib.compress(bytes(raw), level=9))
        + png_chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def bbox_alpha(image, threshold=8):
    points = [
        (x, y)
        for y, row in enumerate(image)
        for x, (_, _, _, a) in enumerate(row)
        if a > threshold
    ]
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def crop(image, box):
    x1, y1, x2, y2 = box
    return [row[x1:x2 + 1] for row in image[y1:y2 + 1]]


def trim(image, padding=0):
    box = bbox_alpha(image)
    if box is None:
        return image
    x1, y1, x2, y2 = box
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(len(image[0]) - 1, x2 + padding)
    y2 = min(len(image) - 1, y2 + padding)
    return crop(image, (x1, y1, x2, y2))


def alpha_points(image, threshold=8):
    pts = []
    for y, row in enumerate(image):
        for x, (_, _, _, a) in enumerate(row):
            if a > threshold:
                pts.append((x, y, a))
    return pts


def remove_flat_background(image, tolerance=42):
    height = len(image)
    width = len(image[0]) if height else 0
    if not width or not height:
        return image

    if any(image[y][x][3] < 250 for x in range(width) for y in (0, height - 1)):
        return image
    if any(image[y][x][3] < 250 for y in range(height) for x in (0, width - 1)):
        return image

    edge_samples = []
    for x in range(width):
        edge_samples.append(image[0][x][:3])
        edge_samples.append(image[height - 1][x][:3])
    for y in range(height):
        edge_samples.append(image[y][0][:3])
        edge_samples.append(image[y][width - 1][:3])

    if not edge_samples:
        return image

    fondo = tuple(round(sum(c[i] for c in edge_samples) / len(edge_samples)) for i in range(3))
    limite = tolerance

    q = deque()
    visitado = [[False] * width for _ in range(height)]

    for x in range(width):
        q.append((x, 0))
        q.append((x, height - 1))
    for y in range(height):
        q.append((0, y))
        q.append((width - 1, y))

    while q:
        x, y = q.popleft()
        if not (0 <= x < width and 0 <= y < height) or visitado[y][x]:
            continue
        visitado[y][x] = True
        px = image[y][x]
        if color_dist(px[:3], fondo) > limite:
            continue
        image[y][x] = (px[0], px[1], px[2], 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height and not visitado[ny][nx]:
                q.append((nx, ny))

    return image


def principal_angle(image):
    pts = alpha_points(image)
    if not pts:
        return 0.0
    total = sum(a for _, _, a in pts)
    mx = sum(x * a for x, _, a in pts) / total
    my = sum(y * a for _, y, a in pts) / total
    sxx = sum((x - mx) ** 2 * a for x, _, a in pts) / total
    syy = sum((y - my) ** 2 * a for _, y, a in pts) / total
    sxy = sum((x - mx) * (y - my) * a for x, y, a in pts) / total
    return 0.5 * atan2(2 * sxy, sxx - syy)


def bilinear(image, x, y):
    height = len(image)
    width = len(image[0]) if height else 0
    if x < 0 or y < 0 or x > width - 1 or y > height - 1:
        return (0, 0, 0, 0)

    x0 = int(x)
    y0 = int(y)
    x1 = min(width - 1, x0 + 1)
    y1 = min(height - 1, y0 + 1)
    tx = x - x0
    ty = y - y0

    p00 = image[y0][x0]
    p10 = image[y0][x1]
    p01 = image[y1][x0]
    p11 = image[y1][x1]

    out = []
    for i in range(4):
        a = lerp(p00[i], p10[i], tx)
        b = lerp(p01[i], p11[i], tx)
        out.append(int(round(lerp(a, b, ty))))
    return tuple(out)


def rotate(image, angle_rad):
    if abs(angle_rad) < 1e-6:
        return [row[:] for row in image]

    height = len(image)
    width = len(image[0]) if height else 0
    cx = (width - 1) / 2
    cy = (height - 1) / 2
    c = cos(angle_rad)
    s = sin(angle_rad)

    corners = []
    for x, y in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        dx = x - cx
        dy = y - cy
        rx = dx * c - dy * s
        ry = dx * s + dy * c
        corners.append((rx, ry))

    min_x = min(x for x, _ in corners)
    max_x = max(x for x, _ in corners)
    min_y = min(y for _, y in corners)
    max_y = max(y for _, y in corners)
    new_w = int(ceil(max_x - min_x + 1))
    new_h = int(ceil(max_y - min_y + 1))
    ncx = (new_w - 1) / 2
    ncy = (new_h - 1) / 2

    out = [[(0, 0, 0, 0) for _ in range(new_w)] for _ in range(new_h)]
    for y in range(new_h):
        for x in range(new_w):
            dx = x - ncx
            dy = y - ncy
            sx = dx * c + dy * s + cx
            sy = -dx * s + dy * c + cy
            out[y][x] = bilinear(image, sx, sy)
    return out


def profile_widths(image):
    widths = []
    for y, row in enumerate(image):
        xs = [x for x, (_, _, _, a) in enumerate(row) if a > 16]
        if xs:
            widths.append((y, len(xs), min(xs), max(xs)))
    return widths


def orient_bow_up(image):
    angle = principal_angle(image)
    rotated = trim(rotate(image, pi / 2 - angle), padding=2)
    widths = profile_widths(rotated)
    if not widths:
        return rotated

    tramo = max(6, len(widths) // 7)
    promedio_sup = sum(w for _, w, _, _ in widths[:tramo]) / tramo
    promedio_inf = sum(w for _, w, _, _ in widths[-tramo:]) / tramo
    if promedio_sup > promedio_inf:
        rotated = trim(rotate(rotated, pi), padding=2)
    return rotated


def connected_dark_components(image):
    height = len(image)
    width = len(image[0]) if height else 0
    seen = [[False] * width for _ in range(height)]
    comps = []

    def es_oscuro(px):
        r, g, b, a = px
        return a > 70 and max(r, g, b) < 70

    for y in range(height):
        for x in range(width):
            if seen[y][x] or not es_oscuro(image[y][x]):
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            pts = []
            while q:
                cx, cy = q.popleft()
                pts.append((cx, cy))
                for nx, ny in (
                    (cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1),
                    (cx - 1, cy - 1), (cx + 1, cy - 1), (cx - 1, cy + 1), (cx + 1, cy + 1),
                ):
                    if 0 <= nx < width and 0 <= ny < height and not seen[ny][nx] and es_oscuro(image[ny][nx]):
                        seen[ny][nx] = True
                        q.append((nx, ny))
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            comps.append({
                "points": pts,
                "area": len(pts),
                "bbox": (min(xs), min(ys), max(xs), max(ys)),
                "cx": sum(xs) / len(xs),
                "cy": sum(ys) / len(ys),
            })
    return comps


def inpaint_mask(image, mask):
    height = len(image)
    width = len(image[0]) if height else 0
    pendientes = {(x, y) for y in range(height) for x in range(width) if mask[y][x]}
    if not pendientes:
        return image

    for _ in range(80):
        if not pendientes:
            break
        resueltos = []
        for x, y in list(pendientes):
            vecinos = []
            for nx, ny in (
                (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1),
                (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1), (x + 1, y + 1),
            ):
                if 0 <= nx < width and 0 <= ny < height and not mask[ny][nx] and image[ny][nx][3] > 0:
                    vecinos.append(image[ny][nx])
            if vecinos:
                promedio = tuple(
                    int(round(sum(px[i] for px in vecinos) / len(vecinos))) for i in range(4)
                )
                image[y][x] = promedio
                resueltos.append((x, y))
        for x, y in resueltos:
            mask[y][x] = False
            pendientes.discard((x, y))
        if not resueltos:
            break

    for x, y in pendientes:
        image[y][x] = (0, 0, 0, 0)
    return image


def limpiar_marcas_puntas(image):
    comps = connected_dark_components(image)
    if not comps:
        return image, None

    cockpit = max(comps, key=lambda c: c["area"])
    height = len(image)
    width = len(image[0]) if height else 0
    mask = [[False] * width for _ in range(height)]

    for comp in comps:
        if comp is cockpit:
            continue
        x1, y1, x2, y2 = comp["bbox"]
        area = comp["area"]
        esta_en_punta = y2 < cockpit["bbox"][1] or y1 > cockpit["bbox"][3]
        es_pequeno = area < cockpit["area"] * 0.22
        if esta_en_punta and es_pequeno:
            for x, y in comp["points"]:
                mask[y][x] = True

    return inpaint_mask(image, mask), cockpit["bbox"]


def resize(image, new_w, new_h):
    old_h = len(image)
    old_w = len(image[0]) if old_h else 0
    if not old_w or not old_h:
        return [[(0, 0, 0, 0) for _ in range(new_w)] for _ in range(new_h)]
    out = [[(0, 0, 0, 0) for _ in range(new_w)] for _ in range(new_h)]
    for y in range(new_h):
        sy = 0 if new_h == 1 else y * (old_h - 1) / (new_h - 1)
        for x in range(new_w):
            sx = 0 if new_w == 1 else x * (old_w - 1) / (new_w - 1)
            out[y][x] = bilinear(image, sx, sy)
    return out


def paste(dest, src, left, top):
    for y, row in enumerate(src):
        dy = top + y
        if not (0 <= dy < len(dest)):
            continue
        for x, px in enumerate(row):
            dx = left + x
            if 0 <= dx < len(dest[0]):
                dest[dy][dx] = px


def thick_line(image, x1, y1, x2, y2, color, thickness):
    radius = max(1, thickness // 2)
    pasos = max(int(hypot(x2 - x1, y2 - y1) * 2), 1)
    for i in range(pasos + 1):
        t = i / pasos
        x = int(round(lerp(x1, x2, t)))
        y = int(round(lerp(y1, y2, t)))
        for oy in range(-radius, radius + 1):
            for ox in range(-radius, radius + 1):
                if ox * ox + oy * oy > radius * radius + 1:
                    continue
                px = x + ox
                py = y + oy
                if 0 <= py < len(image) and 0 <= px < len(image[0]):
                    image[py][px] = color


def draw_arrow(image, center_x, center_y, direction, length, thickness):
    tip_x = center_x
    tip_y = center_y - direction * (length / 2)
    tail_x = center_x
    tail_y = center_y + direction * (length / 2)
    head_len = length * 0.38
    head_dx = length * 0.17

    outline = (12, 24, 42, 190)
    white = (255, 255, 255, 255)

    thick_line(image, tail_x, tail_y, tip_x, tip_y, outline, thickness + 4)
    thick_line(image, tip_x, tip_y, tip_x - head_dx, tip_y + direction * head_len, outline, thickness + 4)
    thick_line(image, tip_x, tip_y, tip_x + head_dx, tip_y + direction * head_len, outline, thickness + 4)

    thick_line(image, tail_x, tail_y, tip_x, tip_y, white, thickness)
    thick_line(image, tip_x, tip_y, tip_x - head_dx, tip_y + direction * head_len, white, thickness)
    thick_line(image, tip_x, tip_y, tip_x + head_dx, tip_y + direction * head_len, white, thickness)


def dibujar_flechas(image, cockpit_bbox=None):
    box = bbox_alpha(image)
    if box is None:
        return image
    x1, y1, x2, y2 = box
    if cockpit_bbox is None:
        comps = connected_dark_components(image)
        cockpit_bbox = max(comps, key=lambda c: c["area"])["bbox"] if comps else None
    if cockpit_bbox is None:
        cockpit_bbox = (x1, y1 + (y2 - y1) // 3, x2, y2 - (y2 - y1) // 3)

    cx = (cockpit_bbox[0] + cockpit_bbox[2]) / 2
    top_gap = max(18, cockpit_bbox[1] - y1)
    bottom_gap = max(18, y2 - cockpit_bbox[3])

    top_center = (y1 + cockpit_bbox[1]) / 2
    bottom_center = (cockpit_bbox[3] + y2) / 2

    top_len = clamp(top_gap * 0.6, 24, 46)
    bottom_len = clamp(bottom_gap * 0.6, 24, 46)
    thickness = max(5, round((x2 - x1 + 1) / 18))

    draw_arrow(image, cx, top_center, 1, top_len, thickness)
    draw_arrow(image, cx, bottom_center, -1, bottom_len, thickness)
    return image


def preparar_bote(image, tam):
    image = [row[:] for row in image]
    image = remove_flat_background(image)
    image = trim(image, padding=2)
    image = orient_bow_up(image)
    image, cockpit_bbox = limpiar_marcas_puntas(image)
    image = trim(image, padding=4)

    h = len(image)
    w = len(image[0]) if h else 0
    if not w or not h:
        raise ValueError("La imagen quedó vacía después del recorte")

    escala = min((tam * 0.78) / w, (tam * 0.92) / h)
    nuevo_w = max(1, int(round(w * escala)))
    nuevo_h = max(1, int(round(h * escala)))
    image = resize(image, nuevo_w, nuevo_h)

    if cockpit_bbox is not None:
        factor_x = nuevo_w / w
        factor_y = nuevo_h / h
        cockpit_bbox = (
            cockpit_bbox[0] * factor_x,
            cockpit_bbox[1] * factor_y,
            cockpit_bbox[2] * factor_x,
            cockpit_bbox[3] * factor_y,
        )

    lienzo = [[(0, 0, 0, 0) for _ in range(tam)] for _ in range(tam)]
    left = (tam - nuevo_w) // 2
    top = (tam - nuevo_h) // 2
    paste(lienzo, image, left, top)

    if cockpit_bbox is not None:
        cockpit_bbox = (
            cockpit_bbox[0] + left,
            cockpit_bbox[1] + top,
            cockpit_bbox[2] + left,
            cockpit_bbox[3] + top,
        )
    dibujar_flechas(lienzo, cockpit_bbox)
    return lienzo


def parse_args():
    parser = argparse.ArgumentParser(description="Prepara sprites PNG para la pizarra")
    parser.add_argument("entrada", type=Path)
    parser.add_argument("salida", type=Path)
    parser.add_argument("--tipo", default="bote", choices=["bote"])
    parser.add_argument("--tam", type=int, default=256, help="tamaño final del sprite cuadrado")
    return parser.parse_args()


def main():
    args = parse_args()
    image = read_png(args.entrada)
    if args.tipo == "bote":
        out = preparar_bote(image, args.tam)
    else:
        raise ValueError(f"Tipo no soportado: {args.tipo}")
    write_png(args.salida, out)
    print(f"Generado {args.salida} ({args.tam}x{args.tam})")


if __name__ == "__main__":
    main()
