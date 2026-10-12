#!/usr/bin/env python3
"""커리어 모드 이벤트 배경 그림 넣기 — 생성 AI로 뽑은 그림을 잘라서 webp로 저장한다.

사용법:
    python scripts/import_career_scene.py <장면id> <원본파일> [--mode auto|border|corner] [--quality 90]
    python scripts/import_career_scene.py field ~/Downloads/field.png
    python scripts/import_career_scene.py talk ~/Downloads/talk.webp --mode corner

무엇을 하나:
 1) 생성 서비스가 오른쪽 아래에 넣는 반짝이 표시를 잘라낸다.
    - border 모드: 프롬프트의 "safe margin" 지시가 먹어서 바깥에 단색 테두리가 생긴 그림.
      테두리 색을 읽어 안쪽 사각형만 남긴다(그림 손실 없음 — 이쪽이 깔끔하다).
    - corner 모드: 테두리 없이 화면이 꽉 찬 그림. 표시가 있는 오른쪽·아래만 잘라낸다.
    - auto(기본): border로 시도해 보고 테두리가 없으면 corner로 넘어간다.
 2) 잘라낸 그림 오른쪽 아래에 표시가 남았는지 다시 검사해 경고한다.
 3) public/img/career-scenes/<장면id>.webp 로 저장하고, 코드에 등록할 줄을 알려 준다.

그림을 새로 뽑을 때 지킬 것(실제로 겪은 문제):
 - 배경은 화면을 꽉 채우며 잘린다. **폰에서는 가로 가운데 약 1/3만 보이고**, 말풍선이 화면
   한가운데를 덮는다. 그래서 주제 소품은 "가운데, 조금 아래"에 있어야 하고 바닥 가장자리에
   닿으면 안 된다. 양 끝에 둔 소품은 폰에서 전부 잘려 나간다.
 - 프롬프트 문구와 장면 목록은 docs/career-mode/career-mode.md "이벤트 배경 그림" 절에 있다.
"""
import argparse
import os
import sys

try:
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit('Pillow가 필요합니다: pip install pillow')

try:
    import numpy as np
except ImportError:
    sys.exit('numpy가 필요합니다: pip install numpy')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'public', 'img', 'career-scenes')
# index.html의 CR_SCENE_PHOTO가 쓰는 장면 이름(= 이벤트 id). captfull은 captain 그림을 함께 쓴다.
SCENES = ['field', 'talk', 'tour', 'scout', 'captain', 'natcall', 'sns', 'diet', 'study']


def find_border_box(im):
    """바깥이 단색 테두리로 둘러싸인 그림이면 안쪽 사각형 좌표를 돌려준다. 아니면 None."""
    a = np.asarray(im.convert('RGB')).astype(int)
    h, w = a.shape[:2]
    corners = [a[3, 3], a[3, w - 4], a[h - 4, 3], a[h - 4, w - 4]]
    # 네 모서리 색이 서로 다르면 단색 테두리가 아니다
    if max(np.abs(np.array(corners) - corners[0]).sum(axis=1)) > 24:
        return None
    diff = np.abs(a - corners[0]).sum(axis=2) > 18
    rows, cols = diff.mean(axis=1), diff.mean(axis=0)
    if rows.max() < 0.5 or cols.max() < 0.5:
        return None
    top = int(np.argmax(rows > 0.5))
    bot = h - 1 - int(np.argmax(rows[::-1] > 0.5))
    left = int(np.argmax(cols > 0.5))
    right = w - 1 - int(np.argmax(cols[::-1] > 0.5))
    if (right - left) < w * 0.5 or (bot - top) < h * 0.5:
        return None                      # 테두리가 아니라 그림 내용에 걸린 경우
    if (right - left) > w * 0.97 and (bot - top) > h * 0.97:
        return None                      # 사실상 테두리 없음
    pad = 6                              # 경계선이 비치지 않게 안쪽으로 조금 더
    return (left + pad, top + pad, right - pad, bot - pad)


def corner_box(im, right=0.12, bottom=0.13, left=0.0, top=0.0):
    """표시가 있는 오른쪽·아래를 잘라낸다(테두리가 없는 그림용)."""
    w, h = im.size
    return (int(w * left), int(h * top), int(w * (1 - right)), int(h * (1 - bottom)))


def watermark_left(im):
    """오른쪽 아래에 표시가 남았는지 본다. 남았으면 (세기, 위치)를, 없으면 (0, None)을 돌려준다.

    밝기만 보면 벽·바닥 경계 같은 밝은 선도 걸리고(면담 그림에서 오탐), 영역 전체를 한 덩어리로
    묶으면 멀리 있는 밝은 점에 범위가 끌려가 진짜 표시를 놓친다(원본 검사에서 미검출).
    그래서 "가장 밝은 점 주변만" 떼어 내 그 자리가 작고 뭉친 덩어리인지 본다.
    """
    g = im.convert('L')
    d = np.asarray(g).astype(float) - np.asarray(g.filter(ImageFilter.GaussianBlur(6))).astype(float)
    w, h = im.size
    y0, x0 = int(h * 0.74), int(w * 0.78)
    win = d[y0:, x0:]
    if win.size == 0:
        return 0.0, None
    iy, ix = np.unravel_index(int(np.argmax(win)), win.shape)
    peak = float(win[iy, ix])
    if peak < 55:                                   # 이 정도로 튀지 않으면 표시가 아니다
        return 0.0, None
    r = 24                                          # 가장 밝은 점 둘레만 떼어 본다
    patch = win[max(0, iy - r):iy + r, max(0, ix - r):ix + r]
    hot = patch > peak * 0.45
    n = int(hot.sum())
    if not (10 <= n <= 700):                        # 잡티거나 밝은 면
        return 0.0, None
    ys, xs = np.where(hot)
    bh, bw = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
    if bw == 0 or bh == 0 or not (0.4 <= bw / float(bh) <= 2.5):
        return 0.0, None                            # 길게 뻗은 선(벽·바닥 경계)
    return peak, (ix + x0, iy + y0)


def main():
    ap = argparse.ArgumentParser(description='커리어 이벤트 배경 그림 넣기')
    ap.add_argument('scene', help='장면 id (%s)' % ', '.join(SCENES))
    ap.add_argument('src', help='생성 AI로 뽑은 원본 그림')
    ap.add_argument('--mode', choices=['auto', 'border', 'corner'], default='auto')
    ap.add_argument('--quality', type=int, default=90)
    ap.add_argument('--out', default=None, help='저장 경로(기본: public/img/career-scenes/<장면id>.webp)')
    args = ap.parse_args()

    if args.scene not in SCENES:
        print('! 모르는 장면 id입니다: %s' % args.scene)
        print('  쓸 수 있는 id: %s' % ', '.join(SCENES))
        print('  새 장면을 추가하는 거라면 이 파일의 SCENES와 index.html의 CR_SCENE_PHOTO에 같이 넣으세요.')
        return 1

    im = Image.open(args.src).convert('RGB')
    print('원본: %s %dx%d' % (os.path.basename(args.src), im.size[0], im.size[1]))

    box, how = None, None
    if args.mode in ('auto', 'border'):
        box = find_border_box(im)
        how = '테두리 안쪽'
    if box is None:
        if args.mode == 'border':
            print('! 단색 테두리를 못 찾았습니다. --mode corner 로 다시 해 보세요.')
            return 1
        box, how = corner_box(im), '오른쪽·아래 모서리'
    cropped = im.crop(box)
    print('자르기(%s): %s → %dx%d (비율 %.2f:1)'
          % (how, box, cropped.size[0], cropped.size[1], cropped.size[0] / cropped.size[1]))

    mark, at = watermark_left(cropped)
    if at:
        print('! 오른쪽 아래(x %d, y %d)에 표시가 남아 있습니다(세기 %.0f). --mode corner 로 더 잘라내세요.' % (at[0], at[1], mark))
    else:
        print('표시 검사: 깨끗함')

    out = args.out or os.path.join(OUT_DIR, args.scene + '.webp')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cropped.save(out, 'WEBP', quality=args.quality)
    print('저장: %s (%.0fKB)' % (out, os.path.getsize(out) / 1024))
    print('')
    print('index.html의 CR_SCENE_PHOTO에 아래 항목이 있는지 확인하세요:')
    print("    %s:'%s.webp'" % (args.scene, args.scene))
    print('폰에서 가운데만 보이므로, 넣은 뒤에는 꼭 좁은 화면으로도 확인하세요.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
