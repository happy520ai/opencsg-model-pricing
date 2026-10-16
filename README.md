# OpenCSG 模型与价格实测（可重放）

> 一条不用注册、不用 API key 的命令，能看到这个模型网关的完整清单和明码标价：
>
> ```bash
> curl -s https://ai.space.opencsg.com/v1/models
> ```

本仓库做的事很简单：把上面这条命令的返回值变成**可核对、可重放、会自己过期**的价格表。所有数字来自当场实测，不来自宣传稿。

**在线页面**：<https://happy520ai.github.io/opencsg-model-pricing/>
**月成本计算器**：<https://happy520ai.github.io/opencsg-model-pricing/cost-calculator.html>（填你自己的 token 量，按实时单价排序；含缓存命中率敏感性）
![refresh-pricing-snapshot](https://github.com/happy520ai/opencsg-model-pricing/actions/workflows/refresh.yml/badge.svg)

`data-snapshot.md` 每天由 GitHub Actions 重放一次接口自动更新；页面正文的主力价格行受 `check-site.mjs` 守门，一旦清单漂移该任务会变红，提醒重写而不是继续挂着对不上的数字。

## 2026-10-17 实测读数

返回 23 条模型，其中 18 条带输入价（单位：元/百万 token）：

| 模型 | 输入 | 输出 | 上游仓库 |
|---|---|---|---|
| `glm-5.3-flash` | 0.88 | 3.08 | - |
| `qwen3.8-flash` | 0.88 | 2.97 | - |
| `OpenCSG/Agentic-27B` | 0.75 | 3 | OpenCSG/Agentic-27B |
| `deepseek-v4-flash` | 3.3 | 9.9 | deepseek-ai/DeepSeek-V4-Flash |
| `deepseek-v4.1-flash` | 4 | 12 | deepseek-ai/DeepSeek-V4.1-Flash |
| `glm-5.2` | 4.4 | 15.4 | zai-org/GLM-5.2 |
| `glm-5.1` | 4.62 | 18.84 | zai-org/GLM-5.1 |
| `minimax-m3` | 4.62 | 18.48 | - |
| `deepseek-v4-pro` | 9.9 | 29.7 | deepseek-ai/DeepSeek-V4-Pro-0813 |
| `qwen3.8-max` | 13.2 | 39.6 | - |

完整 19 条见 [`data-snapshot.md`](data-snapshot.md)，原始响应见 [`models-live-2026-10-16.json`](models-live-2026-10-16.json)。

## 清单会漂移，别引用静态截图

三天内我读到 **25 条**、**24 条**、**23 条**。这说明模型是实时上下架的——所以本仓库把「重放」而不是「本文表格」当作事实来源：

```bash
node refresh-model-table.mjs   # 重新生成 data-snapshot.md
```

脚本在接口不可达或返回 0 条时**拒绝产出**并返回非 0 退出码，不会用旧数据冒充新读数。

## 自己校验

```bash
node check-site.mjs
```

它会拉实时接口，把页面里高亮的三个主力模型逐字段比对输入/输出价，并扫描绝对化表述。价格对不上就报错退出。

## 怎么接

OpenAI 兼容，改动只有 `base_url` 与 `api_key` 两行：

```python
from openai import OpenAI
import os

client = OpenAI(
    base_url="https://ai.space.opencsg.com/v1",
    api_key=os.environ["CSG_API_KEY"],
)
```

> 说明：`/v1/models` 是我免登录实测过的；上面的 chat 片段按 SDK 结构书写，**需要 key 才能跑通，我没有实测对话**。

## 关于这家公司

2026-08-31 官宣完成数亿元人民币 Pre-A 轮，投后估值进入独角兽级别；本轮由静安资本、市北高新、徐汇资本、黄海金控等参与，此前有联想创投、北京国信中数、中科升哲。资金用途指向开源 AI 基础设施、Agentic AI 平台与城市级 AI 基建。

出处：[静安区融媒体 2026-09-01](https://www.jingan.gov.cn/rmtzx/003001/20260901/095144cd-2cad-4d1a-a640-7a1b7d1f2b3c.html?type=2)（政府源）·[投中网投融周报](https://www.chinaventure.com.cn/news/80-20260904-393112.html)

## 我没能验证的部分

- **Kimi / Moonshot 系模型**：当日 23 条里按 `kimi`/`moonshot` 关键字过滤命中 **0** 条。平台其他页面是否有，本仓库不作主张。
- **部分模型只有输入价**，计费口径以官网结算页为准。
- **邀请活动可能已收官**：官方 campaigns 页 2026-10-17 挂着「本期"邀请注册有礼"活动已于 [10月16日 24:00] 圆满收官」。此前写的「新用户 50 元公开福利 / 邀请人单次 99 元」出自 2026-09-30 模速空间活动页，**现可能已失效，不要再当作现行权益引用**。两点不变：99 元一直是邀请人的累计奖励而非新人到账额；且注册链接不会自动带码，需在 `Enter your code` 手填。

## 披露

本仓库与在线页面带个人邀请码 `7OV90VFJG1`，有人通过它注册我会获得平台邀请奖励。**本项目与 OpenCSG 官方无隶属关系**，页面与 README 中的推广性质均已明示。数据本身与邀请码无关，你完全可以只把它当一个价格核对工具用。
