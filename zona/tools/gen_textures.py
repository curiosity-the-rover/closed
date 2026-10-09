"""Генератор бесшовных PBR-фактур для «Зоны» (albedo + normal + roughness).

Шум — спектральный синтез (1/f^beta через обратное БПФ), поэтому фактуры
тайлятся без швов. Запуск: python3 zona/tools/gen_textures.py
"""
import os
import numpy as np
from PIL import Image

N = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tex')
rng = np.random.default_rng(7)


def spectral(beta=2.0, n=N, seed=None, aniso=(1.0, 1.0)):
    r = np.random.default_rng(seed) if seed is not None else rng
    fx = np.fft.fftfreq(n)[:, None] * aniso[1]
    fy = np.fft.fftfreq(n)[None, :] * aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / f ** (beta / 2)
    amp[0, 0] = 0
    ph = r.uniform(0, 2 * np.pi, (n, n))
    img = np.real(np.fft.ifft2(amp * np.exp(1j * ph)))
    img -= img.min()
    return img / img.max()


def band(lo, hi, seed):
    """Шум в полосе частот — для пор, зерна, пятен."""
    r = np.random.default_rng(seed)
    fx = np.fft.fftfreq(N)[:, None]
    fy = np.fft.fftfreq(N)[None, :]
    f = np.sqrt(fx * fx + fy * fy) * N
    mask = ((f >= lo) & (f <= hi)).astype(float)
    ph = r.uniform(0, 2 * np.pi, (N, N))
    img = np.real(np.fft.ifft2(mask * np.exp(1j * ph)))
    img -= img.min()
    return img / img.max()


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = t[..., None] if t.ndim == 2 else t
    return a * (1 - t) + b * t


def col(*rgb):
    return np.array(rgb, dtype=float)[None, None, :] / 255.0


def normal_from_height(h, strength=4.0):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    L = np.sqrt(dx * dx + dy * dy + nz * nz)
    n = np.stack([-dx / L, dy / L, nz / L], -1)  # OpenGL (+Y вверх)
    return (n * 0.5 + 0.5)


def save(name, albedo, height, rough, nstrength=4.0):
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((np.clip(albedo, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, name + '_col.jpg'), quality=88)
    Image.fromarray((normal_from_height(height, nstrength) * 255).astype(np.uint8)).save(os.path.join(OUT, name + '_nrm.jpg'), quality=90)
    Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, name + '_rgh.jpg'), quality=85)
    print('ok', name)


yy, xx = np.mgrid[0:N, 0:N] / N

# ---------- бетон
def concrete(name='concrete', seed=1, tint=(1, 1, 1)):
    big = spectral(2.6, seed=seed)
    mid = spectral(1.6, seed=seed + 1)
    pores = band(180, 420, seed + 2)
    streak = spectral(2.2, seed=seed + 3, aniso=(0.12, 1.0))  # вертикальные потёки
    base = mix(col(128, 126, 118), col(170, 166, 154), big)
    base = mix(base, col(96, 94, 86), smooth(streak, 0.62, 0.9) * 0.55)
    base = mix(base, col(105, 112, 88), smooth(spectral(2.4, seed=seed + 4), 0.7, 0.92) * 0.45)  # зелёный налёт
    base *= (0.9 + mid[..., None] * 0.2)
    dark_p = smooth(pores, 0.78, 0.9)
    base = mix(base, base * 0.55, dark_p)
    agg = smooth(band(120, 260, seed + 8), 0.7, 0.8)
    base = mix(base, base * 1.15, agg * 0.5)
    base *= np.array(tint)[None, None, :]
    height = big * 0.3 + mid * 0.2 - dark_p * 0.6 + pores * 0.15
    rough = 0.82 + mid * 0.12 - smooth(streak, 0.62, 0.9) * 0.1
    return base, height, rough

a, h, r = concrete()
save('concrete', a, h, r, 3.0)

# бетонный забор ПО-2: ромбический рельеф
a2, h2, r2 = concrete('fence', seed=11, tint=(0.97, 0.97, 0.95))
u = (xx * 4) % 1; v = (yy * 2) % 1
dia = np.abs(u - 0.5) + np.abs(v - 0.5)  # ромбы
rel = smooth(dia, 0.42, 0.46) - smooth(dia, 0.47, 0.5)  # выпуклая грань
rel2 = smooth(dia, 0.18, 0.2) * (1 - smooth(dia, 0.2, 0.22))
hfence = h2 * 0.5 + rel * 1.2 + rel2 * 0.6
a2 = mix(a2, a2 * 0.8, smooth(dia, 0.45, 0.5))
save('fence', a2, hfence, r2, 3.5)

# ---------- ржавчина
def rust(name='rust', seed=21, paint=None):
    big = spectral(2.2, seed=seed)
    fine = band(60, 300, seed + 1)
    spots = spectral(2.0, seed=seed + 2)
    pit = band(250, 500, seed + 3)
    base = mix(col(70, 36, 20), col(168, 88, 40), big)
    base = mix(base, col(42, 28, 22), smooth(spots, 0.55, 0.78))
    base = mix(base, col(196, 128, 64), smooth(fine, 0.68, 0.88) * 0.7)
    base = mix(base, col(96, 80, 64), smooth(spectral(2.4, seed=seed + 9), 0.66, 0.8) * 0.6)  # серые окалины
    base *= (0.75 + band(120, 400, seed + 10)[..., None] * 0.5)
    height = big * 0.3 + fine * 0.3 - smooth(pit, 0.8, 0.95) * 0.5
    rough = 0.75 + fine * 0.2
    if paint is not None:
        pm = smooth(spectral(2.3, seed=seed + 5), 0.42, 0.5)  # где краска уцелела
        pc = mix(col(*paint) * 0.85, col(*paint) * 1.1, spectral(2.5, seed=seed + 6))
        pc = mix(pc, pc * 0.6, smooth(spectral(2.0, seed=seed + 7, aniso=(0.15, 1.0)), 0.6, 0.85) * 0.5)
        base = mix(base, pc, pm)
        height = height * (1 - pm) + (0.6 + fine * 0.05) * pm
        rough = rough * (1 - pm) + 0.55 * pm
    return base, height, rough

save('rust', *rust(), 4.0)
save('army', *rust('army', 31, paint=(78, 88, 58)), 4.0)       # облупившаяся «хаки»
save('bluepaint', *rust('bluepaint', 41, paint=(62, 92, 112)), 4.0)

# ---------- асфальт с трещинами
big = spectral(2.4, seed=51)
agg = band(200, 480, 52)
stones = smooth(agg, 0.72, 0.8)
base = mix(col(46, 46, 45), col(78, 77, 74), big)
base = mix(base, col(150, 146, 136), stones * 0.7)
# трещины: края ячеек Вороного (тайлящиеся)
pts = rng.uniform(0, 1, (60, 2))
d1 = np.full((N, N), 9.0); d2 = np.full((N, N), 9.0)
for px, py in pts:
    for ox in (-1, 0, 1):
        for oy in (-1, 0, 1):
            d = np.sqrt((xx - px - ox) ** 2 + (yy - py - oy) ** 2)
            d2 = np.where(d < d1, d1, np.minimum(d2, d)); d1 = np.minimum(d1, d)
edge = d2 - d1
warp = spectral(2.0, seed=53)
crack = (1 - smooth(edge + (warp - 0.5) * 0.02, 0.0, 0.006)) * smooth(spectral(2.2, seed=54), 0.45, 0.6)
base = mix(base, col(18, 18, 17), crack)
base = mix(base, col(60, 66, 40), smooth(spectral(2.5, seed=55), 0.75, 0.9) * crack.clip(0, 1) * 0)  # (без травы — её ставим геометрией)
patch = smooth(spectral(2.8, seed=56), 0.78, 0.8)
base = mix(base, col(34, 34, 34), patch * 0.8)
height = big * 0.2 + stones * 0.5 - crack * 0.9
rough = 0.88 - stones * 0.1 + crack * 0.1
save('asphalt', base, height, rough, 3.0)

# ---------- профнастил (оцинковка с ржавыми потёками)
wave = 0.5 + 0.5 * np.sin(xx * 2 * np.pi * 10)
big = spectral(2.3, seed=61)
streak = spectral(2.0, seed=62, aniso=(0.08, 1.0))
base = mix(col(128, 132, 132), col(160, 162, 160), big)
base = mix(base, col(130, 70, 34), smooth(streak, 0.55, 0.85) * 0.8)
base = mix(base, col(80, 50, 34), smooth(spectral(2.0, seed=63), 0.72, 0.85))
base *= (0.85 + wave[..., None] * 0.2)
height = wave * 1.0 + big * 0.1
rough = 0.5 + smooth(streak, 0.55, 0.85) * 0.4
save('corrugated', base, height, rough, 6.0)

# ---------- шифер (волнистые асбестоцементные листы с лишайником)
wave = 0.5 + 0.5 * np.sin(xx * 2 * np.pi * 6)
seam = smooth((yy * 2) % 1, 0.0, 0.03) * (1 - smooth((yy * 2) % 1, 0.97, 1.0))
big = spectral(2.4, seed=71)
lichen = smooth(spectral(2.2, seed=72), 0.66, 0.74) * smooth(band(40, 160, 73), 0.45, 0.6)
moss = smooth(spectral(2.6, seed=74), 0.7, 0.85)
base = mix(col(118, 118, 110), col(152, 150, 140), big)
base = mix(base, col(70, 72, 66), smooth(spectral(2.0, seed=75, aniso=(0.2, 1.0)), 0.6, 0.9) * 0.6)
base = mix(base, col(160, 150, 90), lichen * 0.8)
base = mix(base, col(66, 82, 40), moss * 0.85)
base *= (0.85 + wave[..., None] * 0.22)
base = mix(base, base * 0.5, 1 - seam)
height = wave * 0.8 + big * 0.15 + seam * 0.3
rough = 0.85 + big * 0.1
save('slate', base, height, rough, 5.0)

# ---------- доски (старая серая древесина)
boards = 6
bx = (xx * boards) % 1
bid = np.floor(xx * boards)
grain = spectral(2.0, seed=81, aniso=(0.04, 1.0))
fine = spectral(1.5, seed=82, aniso=(0.1, 1.0))
tone = (np.sin(bid * 12.9898) * 43758.5453) % 1
base = mix(col(92, 86, 76), col(138, 130, 116), grain * 0.7 + tone[..., ] * 0.3)
base = mix(base, col(70, 62, 50), smooth(fine, 0.6, 0.9) * 0.6)
base = mix(base, col(84, 96, 60), smooth(spectral(2.6, seed=83), 0.78, 0.9) * 0.5)  # мох по низу досок
base *= (0.7 + spectral(1.2, seed=84, aniso=(0.02, 1.0))[..., None] * 0.6)
kn = np.zeros((N, N))
for kx, ky in rng.uniform(0, 1, (14, 2)):
    d = np.sqrt(((xx - kx + 0.5) % 1 - 0.5) ** 2 * 9 + ((yy - ky + 0.5) % 1 - 0.5) ** 2)
    kn = np.maximum(kn, 1 - smooth(d, 0.004, 0.02))
base = mix(base, col(48, 38, 30), kn)
gap = smooth(bx, 0.0, 0.02) * (1 - smooth(bx, 0.98, 1.0))
base = mix(base * 0.25, base, gap)
height = gap * 0.6 + grain * 0.3 + fine * 0.2
rough = 0.85 + fine * 0.1
save('planks', base, height, rough, 4.0)

# ---------- штукатурка, осыпавшаяся до кирпича
brick = np.asarray(Image.open(os.path.join(OUT, 'brick_col.jpg')).convert('RGB').resize((N, N))) / 255.0 if os.path.exists(os.path.join(OUT, 'brick_col.jpg')) else mix(col(130, 60, 40), col(150, 80, 50), spectral(2))
pl_big = spectral(2.4, seed=91)
peel = smooth(spectral(2.2, seed=92) + band(30, 120, 93) * 0.25, 0.68, 0.72)
plaster = mix(col(150, 160, 138), col(190, 196, 176), pl_big)
plaster = mix(plaster, col(110, 112, 96), smooth(spectral(2.0, seed=94, aniso=(0.12, 1.0)), 0.6, 0.9) * 0.6)
plaster *= (0.92 + band(150, 400, 95)[..., None] * 0.12)
base = mix(plaster, brick * 0.9, peel)
edge = smooth(peel, 0.0, 0.5) * (1 - smooth(peel, 0.5, 1.0))
base = mix(base, base * 0.6, edge)
height = (1 - peel) * 0.8 + pl_big * 0.2
rough = 0.9 - peel * 0.05
save('plaster', base, height, rough, 4.0)

# ---------- мешковина (мешки с песком)
weave = (0.5 + 0.25 * np.sin(xx * 2 * np.pi * 120) + 0.25 * np.sin(yy * 2 * np.pi * 120))
big = spectral(2.2, seed=101)
base = mix(col(120, 106, 76), col(160, 144, 104), big) * (0.85 + weave[..., None] * 0.2)
base = mix(base, col(80, 70, 50), smooth(spectral(2.0, seed=102), 0.7, 0.9) * 0.6)
save('burlap', base, weave * 0.4 + big * 0.3, 0.95 + big * 0.0, 3.0)
