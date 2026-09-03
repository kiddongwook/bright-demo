"""_05 마스터(검정 선 / 흰 배경)에서 배경을 빼 투명 PNG를 만든다.

  yeongeo-jip.png / -white.png        원본 굵기 (마스터 그대로)
  yeongeo-jip-bold.png / -bold-white.png      작은 자리용 굵은 판 (앱바·아이콘·카톡)
  yeongeo-jip-medium.png / -medium-white.png  큰 자리용 중간 판 (게이트·og)

작은 크기(앱바 30px, 아이콘)에서는 원본 선이 너무 가늘어 굵은 판을 쓴다.
"""
from PIL import Image, ImageOps, ImageFilter
import os

SRC = "KakaoTalk_20260902_132228178_05.jpg"
OUT = "assets/logo"
WIDTH = 1600
BOLD = 45          # 홀수. 작은 자리용(앱바·아이콘). 양쪽 약 22px
MEDIUM = 27        # 큰 자리용(게이트·og). 양쪽 약 13px

os.makedirs(OUT, exist_ok=True)
g0 = ImageOps.grayscale(Image.open(SRC))

# 선이 있는 곳만 남기고 여백을 자른다 (굵은 판 기준으로 잘라야 잘리지 않는다)
bw = g0.point(lambda v: 0 if v < 128 else 255)
bbox = ImageOps.invert(bw.filter(ImageFilter.MinFilter(BOLD))).getbbox()

def build(g, suffix):
    g = g.crop(bbox)
    h = round(g.height * WIDTH / g.width)
    g = g.resize((WIDTH, h), Image.LANCZOS)
    alpha = ImageOps.invert(g)
    ink = Image.new("RGBA", g.size, (0x1C, 0x1C, 0x1C, 0)); ink.putalpha(alpha)
    ink.save(f"{OUT}/yeongeo-jip{suffix}.png", optimize=True)
    white = Image.new("RGBA", g.size, (255, 255, 255, 0)); white.putalpha(alpha)
    white.save(f"{OUT}/yeongeo-jip{suffix}-white.png", optimize=True)
    return ink.size

print("regular", build(g0, ""))
print("bold   ", build(g0.filter(ImageFilter.MinFilter(BOLD)), "-bold"))
print("medium ", build(g0.filter(ImageFilter.MinFilter(MEDIUM)), "-medium"))

# PWA 아이콘: 남색 바탕에 흰 굵은 로고 (정사각)
def icon(size, out):
    bg = Image.new("RGBA", (size, size), "#2B5BD9")
    logo = Image.open(f"{OUT}/yeongeo-jip-bold-white.png").convert("RGBA")
    w = int(size * 0.72); h = int(logo.height * w / logo.width)
    logo = logo.resize((w, h), Image.LANCZOS)
    bg.alpha_composite(logo, ((size - w) // 2, (size - h) // 2))
    bg.save(out, optimize=True)
os.makedirs("app/public/logo", exist_ok=True)
icon(512, "app/public/logo/icon-512.png"); icon(192, "app/public/logo/icon-192.png")
print("icons  ok")
