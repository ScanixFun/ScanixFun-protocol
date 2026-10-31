# One-off asset prep: premultiplied resize of the transparent logo + favicon trace.
# Source RGBA has pure-black RGB under alpha 0, so resizing must be premultiplied.
import numpy as np
from PIL import Image
from collections import deque

SRC = 'brand/LOGO SCANIX PNG...png'
im = Image.open(SRC).convert('RGBA')
a = np.array(im).astype(np.float32)
alpha = a[..., 3]
ys, xs = np.where(alpha > 0)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
print('mark bbox', x0, y0, x1, y1)

def premul_resize(arr, size):
    p = arr.copy()
    p[..., :3] *= p[..., 3:4] / 255.0
    ims = [Image.fromarray(p[..., i], 'F').resize(size, Image.LANCZOS) for i in range(4)]
    out = np.stack([np.array(i) for i in ims], -1)
    al = np.clip(out[..., 3], 0, 255)
    safe = np.where(al > 0, al, 1)[..., None]
    out[..., :3] = np.clip(out[..., :3] * 255.0 / safe, 0, 255)
    out[..., 3] = al
    return Image.fromarray(out.round().astype(np.uint8), 'RGBA')

pad = 40
crop = a[max(y0 - pad, 0):y1 + pad, max(x0 - pad, 0):x1 + pad]
h, w = crop.shape[:2]
for tw in (640, 192):
    th = round(h * tw / w)
    premul_resize(crop, (tw, th)).save(f'src/assets/logo-{tw}.png', optimize=True)
    print('wrote logo', tw, th)

# split the mark into its three diamonds: 3-means on foreground pixel coords, then extreme points
fy, fx = np.where(alpha > 127)
pts = np.stack([fx, fy], 1).astype(np.float64)
cx0, cy0 = (x0 + x1) / 2, (y0 + y1) / 2
cen = np.array([[cx0, y0 + 0.3 * (y1 - y0)], [x0 + 0.25 * (x1 - x0), y0 + 0.7 * (y1 - y0)], [x0 + 0.75 * (x1 - x0), y0 + 0.7 * (y1 - y0)]])
for _ in range(30):
    lbl = ((pts[:, None] - cen[None]) ** 2).sum(2).argmin(1)
    cen = np.array([pts[lbl == k].mean(0) for k in range(3)])
polys = []
for k in range(3):
    p = pts[lbl == k]
    t = p[p[:, 1].argmin()]; b = p[p[:, 1].argmax()]; l = p[p[:, 0].argmin()]; r = p[p[:, 0].argmax()]
    polys.append([t, r, b, l]); print('diamond', k, [tuple(map(int, q)) for q in (t, r, b, l)])
S = 32 - 2 * 6
sc = S / max(x1 - x0, y1 - y0)
ox = 6 + (S - (x1 - x0) * sc) / 2; oy = 6 + (S - (y1 - y0) * sc) / 2
def m(p): return '%.2f,%.2f' % (ox + (p[0] - x0) * sc, oy + (p[1] - y0) * sc)
paths = ''.join('<polygon points="%s" fill="#fdfdfd"/>' % ' '.join(m(p) for p in poly) for poly in polys)
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
       '<rect width="32" height="32" rx="7" fill="#004bfe"/>' + paths + '</svg>')
open('src/assets/favicon.svg', 'w').write(svg)
print(svg)
