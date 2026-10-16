# OpenCSG 可调模型与价格（实测快照）

核查日期：2026-10-16　来源：`https://ai.space.opencsg.com/v1/models`（免登录 GET）
重放方式：`curl -s https://ai.space.opencsg.com/v1/models`　本次返回 **24** 条，其中 **19** 条带输入价。

| 模型 id | 输入 元/百万 token | 输出 元/百万 token | 上游仓库 |
|---|---|---|---|
| convaiinnovations/laya | 0.1 | - | convaiinnovations/laya |
| Qwen/Qwen3Guard-Gen-0.6B | 0.12 | 0.24 | Qwen/Qwen3Guard-Gen-0.6B |
| Qwen/Qwen3Guard-Stream-0.6B | 0.12 | 0.24 | Qwen/Qwen3Guard-Stream-0.6B |
| text-embedding-3-small | 0.16 | 0.16 | - |
| jev-1.13 | 0.5 | - | - |
| qwen3-rerank | 0.55 | 0.55 | - |
| OpenCSG/Agentic-27B | 0.75 | 3 | OpenCSG/Agentic-27B |
| glm-5.3-flash | 0.88 | 3.08 | - |
| qwen3.8-flash | 0.88 | 2.97 | - |
| qwen3.6-plus | 1.5 | 9 | - |
| qwen3.7-plus | 2.2 | 13.2 | - |
| MiniMax-M2.5 | 2.31 | 9.24 | MiniMaxAI/MiniMax-M2.5 |
| deepseek-v4-flash | 3.3 | 9.9 | deepseek-ai/DeepSeek-V4-Flash |
| deepseek-v4.1-flash | 4 | 12 | deepseek-ai/DeepSeek-V4.1-Flash |
| glm-5.2 | 4.4 | 15.400000000000002 | zai-org/GLM-5.2 |
| glm-5.1 | 4.62 | 18.84 | zai-org/GLM-5.1 |
| minimax-m3 | 4.62 | 18.48 | - |
| deepseek-v4-pro | 9.9 | 29.7 | deepseek-ai/DeepSeek-V4-Pro-0813 |
| qwen3.8-max | 13.2 | 39.6 | - |

## 主文案六个具名模型的核对结果

未命中（不得写进物料）：`kimi-k3`
