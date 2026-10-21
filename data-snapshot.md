# OpenCSG 可调模型与价格（实测快照）

核查日期：2026-10-21　来源：`https://ai.space.opencsg.com/v1/models`（免登录 GET）
重放方式：`curl -s https://ai.space.opencsg.com/v1/models`　本次返回 **22** 条，其中 **19** 条带输入价。

| 模型 id | 输入 元/百万 token | 输出 元/百万 token | 上游仓库 |
|---|---|---|---|
| convaiinnovations/laya | 0.1 | - | convaiinnovations/laya |
| Qwen/Qwen3Guard-Gen-0.6B | 0.12 | 0.24 | Qwen/Qwen3Guard-Gen-0.6B |
| Qwen/Qwen3Guard-Stream-0.6B | 0.12 | 0.24 | Qwen/Qwen3Guard-Stream-0.6B |
| text-embedding-3-small | 0.16 | 0.16 | - |
| jev-1.13 | 0.5 | - | - |
| qwen3-rerank | 0.55 | 0.55 | - |
| OpenCSG/Agentic-27B | 0.75 | 3 | OpenCSG/Agentic-27B |
| glm-5.3-flash | 1.76 | 6.16 | - |
| qwen3.8-flash | 1.76 | 5.94 | - |
| qwen3.6-plus | 3 | 18 | - |
| deepseek-v4.1-flash-1017 | 4 | 17.6 | deepseek-ai/DeepSeek-V4.1-Flash-1017 |
| qwen3.7-plus | 4.4 | 26.4 | - |
| MiniMax-M2.5 | 4.62 | 18.15 | MiniMaxAI/MiniMax-M2.5 |
| deepseek-v4-flash | 6.6 | 19.8 | deepseek-ai/DeepSeek-V4-Flash |
| glm-5.1 | 8 | 28 | zai-org/GLM-5.1 |
| glm-5.2 | 8 | 28 | zai-org/GLM-5.2 |
| minimax-m3 | 9.24 | 36.96 | - |
| deepseek-v4-pro | 19.8 | 59.4 | deepseek-ai/DeepSeek-V4-Pro-0813 |
| qwen3.8-max | 26.4 | 79.2 | - |

## 主文案六个具名模型的核对结果

未命中（不得写进物料）：`deepseek-v4.1-flash`、`kimi-k3`
