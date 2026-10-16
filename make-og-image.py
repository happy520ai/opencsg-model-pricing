#!/usr/bin/env python3
"""Generate og-image.png (1200x630) with stats computed from the LIVE endpoint.

Refuses to draw if the endpoint is unreachable: a share card carrying a stale
number is worse than no share card.
"""
import json
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont

ENDPOINT = "https://ai.space.opencsg.com/v1/models"
OUT = "og-image.png"
W, H = 1200, 630

BG = (11, 13, 16)
FG = (232, 234, 240)
MUT = (152, 162, 179)
ACC = (78, 225, 160)
CARD = (18, 22, 28)
LINE = (34, 41, 50)
WARN = (255, 180, 84)

NON_CHAT = ("guard", "rerank", "embed", "asr", "audio", "image", "whisper")


def fetch():
    try:
        with urllib.request.urlopen(ENDPOINT, timeout=25) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        sys.exit("REFUSED: endpoint unreachable (%s) - not drawing stale stats" % e)


def stats(payload):
    rows = payload.get("data") or []
    if not rows:
        sys.exit("REFUSED: 0 models returned - probe is blind, not drawing")
    # "带价" 必须与站点/check-site 同一定义：有 input_token_price。
    # 只判 metadata.pricing 存在会多算（对象在但字段缺）。
    priced = [m for m in rows
              if ((m.get("metadata") or {}).get("pricing") or {}).get("input_token_price")]
    chats = []
    for m in priced:
        if m.get("task") != "text-generation":
            continue
        if any(k in m["id"].lower() for k in NON_CHAT):
            continue
        p = m["metadata"]["pricing"]
        inp = p["input_token_price"].get("price_per_million")
        # 与计算器同一条规则：没有输出价的模型不参与"最便宜"评选，
        # 否则它会被当成输出免费而虚假登顶（laya 就是这个坑）。
        outp = (p.get("output_token_price") or {}).get("price_per_million")
        if inp is None or outp is None:
            continue
        chats.append((inp, m["id"]))
    if not chats:
        sys.exit("REFUSED: no comparable chat model found - not drawing")
    cheapest = min(chats)
    return {
        "total": len(rows),
        "priced": len(priced),
        "cheap_in": cheapest[0],
        "cheap_id": cheapest[1],
    }


def main():
    s = stats(fetch())
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    def font(sz, bold=True):
        name = "msyhbd.ttc" if bold else "msyh.ttc"
        return ImageFont.truetype("C:/Windows/Fonts/" + name, sz)

    d.rectangle([0, 0, W, 8], fill=ACC)

    d.text((72, 74), "OpenCSG 模型价格实测", font=font(30), fill=MUT)
    d.text((72, 128), "一条不用注册的命令", font=font(62), fill=FG)
    d.text((72, 206), "就能看到它的全部模型和价格", font=font(62), fill=ACC)

    # command chip
    chip_y, chip_h = 316, 62
    d.rounded_rectangle([72, chip_y, 860, chip_y + chip_h], radius=12,
                        fill=(8, 10, 13), outline=LINE, width=2)
    d.text((94, chip_y + 18), "curl -s https://ai.space.opencsg.com/v1/models",
           font=ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 25), fill=FG)

    # stat cards
    cards = [
        ("%d 条" % s["total"], "免登录返回的模型数"),
        ("%d 条" % s["priced"], "带明码标价"),
        ("¥%.2f 起" % s["cheap_in"], "元/百万token · 对话模型"),
    ]
    cw, gap, cy, ch = 336, 24, 418, 118
    big_f, small_f = font(40), font(19, bold=False)
    inner = cw - 44
    for i, (big, small) in enumerate(cards):
        for label, txt, f in (("big", big, big_f), ("small", small, small_f)):
            wpx = d.textbbox((0, 0), txt, font=f)[2]
            if wpx > inner:
                sys.exit("REFUSED: card %d %s 文字宽 %dpx 超出卡内宽 %dpx -> %r"
                         % (i, label, wpx, inner, txt))
        x = 72 + i * (cw + gap)
        d.rounded_rectangle([x, cy, x + cw, cy + ch], radius=14, fill=CARD,
                            outline=LINE, width=2)
        d.text((x + 22, cy + 16), big, font=big_f, fill=ACC)
        d.text((x + 22, cy + 72), small, font=small_f, fill=MUT)

    d.text((72, 560),
           "清单实时上下架（同日读到过 25 条与 24 条）· 模型保真度未验证 · 页面含推广与邀请码",
           font=font(19, bold=False), fill=WARN)

    img.save(OUT, optimize=True)
    print("drew %s: total=%d priced=%d cheapest=%s@%.2f"
          % (OUT, s["total"], s["priced"], s["cheap_id"], s["cheap_in"]))


if __name__ == "__main__":
    main()
