#!/usr/bin/env python3
"""Generate audit-og.png (1200x630) — the share card for audit.html.

Numbers come from gateway-readings.json, which CI rewrites from the tool's own
daily run. Nothing here is typed: a share card is the one artifact nobody ever
re-checks, because it is a picture and grep cannot read pictures.
"""
import json
import os
import sys
import time

import _fonts
from PIL import Image, ImageDraw, ImageFont

SRC = os.environ.get("AUDIT_OG_SRC", "gateway-readings.json")
# 输出路径可覆盖：负向测试若写死路径，就会把真分享卡换成夹具（同一个坑今天在 to-svg 上踩过一次）。
OUT = os.environ.get("AUDIT_OG_OUT", "audit-og.png")
W, H = 1200, 630
MAX_AGE_H = 26  # CI 每日跑；超过一天就是仪器过期，不是"数据稍微旧一点"

BG = (11, 13, 16)
FG = (232, 234, 240)
MUT = (152, 162, 179)
YES = (78, 225, 160)
NO = (255, 180, 84)
AUTH = (120, 130, 148)
LINE = (34, 41, 50)

LABEL = {"YES": "免登录公布价格", "NO": "清单公开 · 零价格", "AUTH": "401 · 不注册看不到清单"}
COLOR = {"YES": YES, "NO": NO, "AUTH": AUTH}


def font(sz, bold=True):
    return ImageFont.truetype(_fonts.require(bold), sz)


def load():
    if not os.path.exists(SRC):
        sys.exit("REFUSED: 读不到 %s —— 不出图" % SRC)
    doc = json.load(open(SRC, encoding="utf-8"))
    rows = doc.get("results") or []
    if len(rows) < 5:
        sys.exit("REFUSED: 只有 %d 行读数，不足以出横评卡" % len(rows))
    stamp = doc.get("as_of_utc") or (doc.get("as_of", "") + "T00:00:00+08:00")
    try:
        age_h = (time.time() - time.mktime(time.strptime(stamp[:19], "%Y-%m-%dT%H:%M:%S"))) / 3600
    except Exception:  # noqa: BLE001
        sys.exit("REFUSED: 读数时间戳 %r 解析不了，无法判断新鲜度" % stamp)
    if age_h > MAX_AGE_H:
        sys.exit("REFUSED: 读数已 %.0fh（>%dh）未刷新 —— 与其画一张过期的分享卡，不如没有" % (age_h, MAX_AGE_H))
    return doc, rows


def fit(d, text, f, maxw, where):
    w = d.textbbox((0, 0), text, font=f)[2]
    if w > maxw:
        sys.exit("REFUSED: %s 宽 %dpx 超出 %dpx -> %r" % (where, w, maxw, text[:40]))


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    doc, rows = load()
    n = len(rows)
    cnt = {k: sum(1 for r in rows if r.get("level") == k) for k in ("YES", "NO", "AUTH")}
    other = n - cnt["YES"] - cnt["NO"] - cnt["AUTH"]
    if other:
        # 三档之和 < 总数时，"N 家里 M 家"这句话的分子分母不同源，不能画。
        sys.exit("REFUSED: 有 %d 家落在 ERR/UNKNOWN，三档求和=%d≠%d，这张卡的分母不成立" % (other, n - other, n))

    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8], fill=YES)

    M = 60
    y = 62
    title = "注册之前，谁能看到价格？"
    fit(d, title, font(46), W - 2 * M, "标题")
    d.text((M, y), title, font=font(46), fill=FG)
    y += 68
    sub = "%d 家模型网关 · 每家一次无鉴权 GET /v1/models · %s %s" % (
        n, doc.get("as_of", "?"), doc.get("as_of_tz", ""))
    fit(d, sub, font(21, False), W - 2 * M, "副标题")
    d.text((M, y), sub, font=font(21, False), fill=MUT)
    y += 52

    box_w = (W - 2 * M - 2 * 20) // 3
    for i, lvl in enumerate(("YES", "NO", "AUTH")):
        x = M + i * (box_w + 20)
        d.rounded_rectangle([x, y, x + box_w, y + 168], radius=12, fill=(18, 22, 28), outline=LINE)
        num = str(cnt[lvl])
        d.text((x + 26, y + 18), num, font=font(76), fill=COLOR[lvl])
        d.text((x + 26, y + 118), LABEL[lvl], font=font(20, False), fill=FG)
        fit(d, LABEL[lvl], font(20, False), box_w - 52, "档位标签")

    y += 168 + 34
    hidden = cnt["NO"] + cnt["AUTH"]
    line = "其中 %d 家在你注册之前不给你看价格 —— 只有 %d 家给。" % (hidden, cnt["YES"])
    fit(d, line, font(26), W - 2 * M, "结论行")
    d.text((M, y), line, font=font(26), fill=FG)
    y += 44
    # 连"OpenRouter 466/466"这个对照数字也必须从读数里取。写死它，就等于在我用来
    # 防止手抄数字的工具里手抄一个数字——而且它在图片里，grep 看不见。
    orow = next((r for r in rows if r.get("name") == "OpenRouter"), None)
    if not orow or not orow.get("total"):
        sys.exit("REFUSED: 读数里没有 OpenRouter 的行数，脚注无法自证 —— 不退回写死数字")
    foot = ("这不是行业惯例，是一家一家的决定。免登录能看价的不止一家：OpenRouter %d/%d 全带价 —— 差异只在计价单位。" % (orow["hasPricing"], orow["total"]),
            "本页含推广（提交者持 OpenCSG 邀请码）。读数由 CI 每日重跑：happy520ai/gateway-price-check")
    givers = [r for r in rows if r.get("level") == "YES"]
    names = "、".join("%s %d/%d" % (r["name"], r["hasPricing"], r["total"]) for r in givers)
    nf = font(20, False)
    fit(d, names, nf, W - 2 * M, "给价三家")
    foot_top = H - 46 - (len(foot) - 1) * 24
    if y + 40 + 28 > foot_top:
        sys.exit("REFUSED: 给价三家这行画到 y=%d，与脚注(y=%d)相撞" % (y + 40 + 28, foot_top))
    d.text((M, y + 40), names, font=nf, fill=YES)
    ff = font(17, False)
    for t in foot:
        fit(d, t, ff, W - 2 * M, "脚注")
    if y + 30 + len(foot) * 26 > H:
        sys.exit("REFUSED: 脚注要 %d 行、画到 y=%d 超出画布高 %d" % (len(foot), y + 30 + len(foot) * 26, H))
    for i, t in enumerate(foot):
        d.text((M, H - 46 + i * 24 - (len(foot) - 1) * 24), t, font=ff, fill=MUT)

    img.save(OUT, optimize=True)
    print("wrote %s (%dx%d, %d providers, %d/%d/%d)" % (OUT, W, H, n, cnt["YES"], cnt["NO"], cnt["AUTH"]))


if __name__ == "__main__":
    main()
