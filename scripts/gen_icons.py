"""
Generate PNG icon files for the Christhood CMMS PWA.
Creates a cobalt-blue circular icon suitable for app icons and notification badges.
Run: python scripts/gen_icons.py
"""
import struct, zlib, os

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT_DIR, exist_ok=True)

# Christhood brand colors
BG = (37, 99, 235)   # Tailwind blue-600
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def encode_png(w: int, h: int, pixels: list[list[tuple]]) -> bytes:
    """Encode a w×h RGBA pixel grid as a compact PNG."""
    # Build raw scanlines: filter byte 0x00 (None) before each row
    raw = bytearray()
    for row in pixels:
        raw.append(0x00)  # filter type: None
        for r, g, b, a in row:
            raw += bytes([r, g, b, a])
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        length = struct.pack('>I', len(data))
        crc    = struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        return length + tag + data + crc

    ihdr = struct.pack('>IIBBBBB', w, h,
                       8,   # bit depth
                       6,   # colour type: RGBA
                       0, 0, 0)
    return (
        b'\x89PNG\r\n\x1a\n'      # PNG signature
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )


def make_circle_icon(size: int, bg_rgb=(37, 99, 235)) -> bytes:
    """Return PNG bytes: a circle of `bg_rgb` on a transparent background."""
    pixels = []
    cx = cy = (size - 1) / 2.0
    r  = size * 0.48  # radius: 96% of half-size

    r_in_1 = size * 0.18  # inner circle for bell shape (rough)
    r_in_2 = size * 0.30  # bell body

    for y in range(size):
        row = []
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            if dist <= r:
                row.append((*bg_rgb, 255))  # solid blue pixel
            else:
                row.append(TRANSPARENT)
        pixels.append(row)
    return encode_png(size, size, pixels)


for size, name in [(192, 'icon-192x192.png'), (72, 'badge-72x72.png')]:
    data = make_circle_icon(size)
    path = os.path.join(OUT_DIR, name)
    with open(path, 'wb') as f:
        f.write(data)
    # Verify PNG header
    with open(path, 'rb') as f:
        header = f.read(8)
    valid = header == b'\x89PNG\r\n\x1a\n'
    print(f'{"OK" if valid else "FAIL"}  {name}  ({len(data):,} bytes)')
