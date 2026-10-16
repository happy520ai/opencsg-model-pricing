"""Locate a CJK-capable TTF/TTC without hard-coding one OS's font path.

Both image generators used to hard-code C:/Windows/Fonts/msyhbd.ttc, which means
they only ever ran on this laptop - so the "daily regenerated" share cards were in
fact regenerated never. A resolver that refuses beats a silent fallback to a
Latin-only font, which would render every Chinese label as a row of tofu boxes.
"""
import os
import sys

CANDIDATES = [
    # Windows
    "C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/msyh.ttc",
    # Linux (fonts-noto-cjk)
    "/usr/share/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    # macOS
    "/System/Library/Fonts/PingFang.ttc",
]


def locate(bold=True):
    for c in CANDIDATES:
        b = os.path.basename(c).lower()
        heavy = "bd" in b or "bold" in b
        if os.path.exists(c) and heavy == bold:
            return c
    return None


MONO = ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
        "/System/Library/Fonts/Menlo.ttc"]


def require_mono():
    for c in MONO:
        if os.path.exists(c):
            return c
    sys.exit("REFUSED: 找不到等宽字体，命令行那行会排成比例字距（不是致命，但会误导读者）")


def require(bold=True):
    p = locate(bold)
    if not p:
        sys.exit("REFUSED: 找不到 %s 字重的中日韩字体（试过 %s）—— 用只含拉丁字形的字体出图，"
                 "整张卡会变成一排方框，比不出图更糟" % ("粗体" if bold else "常规", ", ".join(CANDIDATES)))
    return p
