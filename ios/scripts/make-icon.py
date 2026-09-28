#!/usr/bin/env python3
"""Draw Flow's app icon: original pixel art, 32×32 cells scaled to 1024 px.

A navy panel with two cream waves (the flow) climbing to a blue gem (the
points), outlined in the app's dark ink. Run from ios/:
    python3 scripts/make-icon.py
Needs Pillow. Writes Flow/Assets.xcassets/AppIcon.appiconset/AppIcon.png
(RGB, no alpha, as the App Store requires).
"""
from pathlib import Path
from PIL import Image

N, SCALE = 32, 32
NAVY, INK = (26, 34, 69), (12, 16, 36)
CREAM, SAND = (250, 242, 222), (226, 204, 160)
GEM, GEM_HI, GEM_LO = (56, 120, 220), (150, 200, 255), (30, 70, 150)

img = Image.new('RGB', (N, N), NAVY)
px = img.load()

def put(x, y, c):
    if 0 <= x < N and 0 <= y < N:
        px[x, y] = c

# Two waves: cells first, then an ink outline wherever a wave cell meets the panel.
wave_cells = {}
def wave(y0, x0, x1):
    shape = [0, -1, -2, -2, -1, 0, 1, 1]   # one crest per 8 cells
    for x in range(x0, x1 + 1):
        y = y0 + shape[(x - x0) % len(shape)]
        wave_cells[(x, y)] = CREAM
        wave_cells[(x, y + 1)] = CREAM
        wave_cells.setdefault((x, y + 2), SAND)

wave(21, 4, 27)
wave(14, 4, 19)
for (x, y), c in wave_cells.items():
    put(x, y, c)
for (x, y) in list(wave_cells):
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if (nx, ny) not in wave_cells:
            put(nx, ny, INK)

# The gem, up and to the right: a small cut diamond.
gem = [
    "..KKKK..",
    ".KHHGGK.",
    "KHGGGGLK",
    "KGGGGLLK",
    ".KGGLLK.",
    "..KGLK..",
    "...KK...",
]
colors = {'K': INK, 'H': GEM_HI, 'G': GEM, 'L': GEM_LO}
for dy, row in enumerate(gem):
    for dx, ch in enumerate(row):
        if ch in colors:
            put(21 + dx, 4 + dy, colors[ch])

# A hard 1-cell ink frame, as the app's panels have.
for i in range(N):
    for x, y in ((i, 0), (i, N - 1), (0, i), (N - 1, i)):
        put(x, y, INK)

out = Path(__file__).resolve().parent.parent / 'Flow/Assets.xcassets/AppIcon.appiconset/AppIcon.png'
img.resize((N * SCALE, N * SCALE), Image.NEAREST).save(out)
print(f'wrote {out}')
