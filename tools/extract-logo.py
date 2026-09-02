"""_05 마스터(검정 선 / 흰 배경)에서 배경을 빼 투명 PNG 2종을 만든다."""
from PIL import Image, ImageOps
import os

SRC = "KakaoTalk_20260902_132228178_05.jpg"
OUT = "assets/logo"
WIDTH = 1600

os.makedirs(OUT, exist_ok=True)
g = ImageOps.grayscale(Image.open(SRC))

# 선이 있는 곳만 남기고 여백을 자른다 (검정 < 128)
bw = g.point(lambda v: 0 if v < 128 else 255)
bbox = ImageOps.invert(bw).getbbox()
g = g.crop(bbox)

# 비율 유지해 폭 1600
h = round(g.height * WIDTH / g.width)
g = g.resize((WIDTH, h), Image.LANCZOS)

# 알파 = 어두울수록 불투명
alpha = ImageOps.invert(g)

ink = Image.new("RGBA", g.size, (0x1C, 0x1C, 0x1C, 0))
ink.putalpha(alpha)
ink.save(f"{OUT}/yeongeo-jip.png", optimize=True)

white = Image.new("RGBA", g.size, (255, 255, 255, 0))
white.putalpha(alpha)
white.save(f"{OUT}/yeongeo-jip-white.png", optimize=True)

print("ok", ink.size)
