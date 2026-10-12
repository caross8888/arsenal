# 커리어 은퇴 카드 도트 선수 재료 만들기(1회성).
#   python3 scripts/build_career_avatar.py <원본 폴더>   → arsenal-dashboard/public/img/career/av/*.png
# 원본(사용자가 AI로 뽑은 1254px 그림, 분홍 #FF00FF 배경, 고개를 오른쪽으로 살짝 돌린 뒷모습, 회색 민무늬 셔츠)은 용량 때문에 저장소에 넣지 않았다.
# 폴더에 base.png(대머리·밝은 피부) · skin1~6.png(피부톤만 바꾼 것, 밝은→어두운) · h01~h15.png(머리만 얹은 것)을 두고 돌린다.
# - 격자 맞추기·색 줄이기는 하지 않는다(사용자 지적 — AI 그림은 도트 크기가 들쭉날쭉해서 강제로 맞추면 머리결이 깨졌다). 256px로 평균 축소만.
# - 배경: 분홍 정도로 불투명도를 정하고 가장자리 분홍 번짐을 뺀다.
# - 머리: 대머리 원본과 달라진 픽셀만. 각 픽셀을 "머리색 H와 그 자리 원래 그림 S(두피·셔츠)의 섞임"으로 보고 섞인 비율 a를 구해,
#   RGB = 섞임을 푼 머리색, 알파 = a 로 저장한다 → 어떤 피부톤 위에 얹어도 페이드(투블럭)의 두피가 그 피부색으로 비친다.
import sys, os
from PIL import Image
import numpy as np

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'arsenal-dashboard', 'public', 'img', 'career', 'av')
N = 256
LONG = {5, 11}   # 셔츠 위까지 내려오는 머리(긴 생머리·포니테일)

def prep(path):
    a = np.array(Image.open(path).convert('RGB').resize((N, N), Image.BOX)).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = 1 - np.clip(((np.minimum(r, b) - g) - 60) / 80, 0, 1)
    key = np.array([240, 0, 240.]); al = np.clip(alpha, 1e-3, 1)[..., None]
    rgb = np.clip((a - key * (1 - al)) / al, 0, 255); rgb[alpha < 0.02] = 0
    return np.dstack([rgb, alpha * 255])

os.makedirs(OUT, exist_ok=True)
base = prep(os.path.join(SRC, 'base.png'))
for i in range(1, 7):
    Image.fromarray(prep(os.path.join(SRC, f'skin{i}.png')).astype(np.uint8), 'RGBA').save(os.path.join(OUT, f's{i}.png'), optimize=True)

R = np.arange(N)[:, None]
S = base[..., :3]; bl = S.mean(2); Hc = np.array([23, 15, 8.])
for i in range(1, 16):
    h = prep(os.path.join(SRC, f'h{i:02d}.png')); rgb = h[..., :3]; lum = rgb.mean(2); ha = h[..., 3] > 128
    if i == 1:   # 첫 장은 피부까지 갈색으로 바뀐 채 받아서 대머리와 비교가 안 된다 — 어두운 픽셀만
        m = ha & (lum < 75) & (R < 124)
    else:
        diff = (np.abs(S - rgb).sum(2) > 70) | ((base[..., 3] > 128) != ha)
        m = diff & ha & (lum < 170) & ((R < 132) | ((R < 232) & (lum < 90) & (i in LONG)))
    noskin = (base[..., 3] < 128) | (bl < 60)
    d = S - Hc; a = np.clip(((S - rgb) * d).sum(2) / np.maximum((d * d).sum(2), 1), 0, 1)
    a = np.where(noskin | (lum < 40), 1.0, a)
    H = np.where(a[..., None] > 0.05, (rgb - (1 - a[..., None]) * S) / np.maximum(a[..., None], 0.05), Hc)
    H = np.where(noskin[..., None], rgb, np.clip(H, 0, 255))
    out = np.zeros((N, N, 4)); out[m, :3] = H[m]; out[m, 3] = np.clip(a[m] * np.minimum(h[..., 3][m] / 255, 1), 0, 1) * 255
    out[out[..., 3] < 8] = 0
    Image.fromarray(out.astype(np.uint8), 'RGBA').save(os.path.join(OUT, f'h{i:02d}.png'), optimize=True)
print('done', OUT)
