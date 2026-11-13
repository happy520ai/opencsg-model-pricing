# OpenCSG 可调模型与价格（实测快照）

核查日期：2026-11-13　来源：`https://ai.space.opencsg.com/v1/models`（免登录 GET）
重放方式：`curl -s https://ai.space.opencsg.com/v1/models`　本次返回 **20** 条，其中 **15** 条带输入价。

| 模型 id | 输入 元/百万 token | 输出 元/百万 token | 上游仓库 |
|---|---|---|---|
| text-embedding-3-small | 0.16 | 0.16 | - |
| OpenCSG/Agentic-27B | 0.35 | 1 | OpenCSG/Agentic-27B |
| qwen3-rerank | 0.55 | 0.55 | - |
| glm-5.3-flash | 0.88 | 3.08 | zai-org/GLM-5.3-Flash |
| qwen3.8-flash | 0.88 | 2.97 | - |
| convaiinnovations/laya | 1 | - | convaiinnovations/laya |
| deepseek-v4.1-flash-1017 | 1.1 | 4.4 | deepseek-ai/DeepSeek-V4.1-Flash-1017 |
| MiniMax-M2.5 | 2.31 | 9.24 | MiniMaxAI/MiniMax-M2.5 |
| qwen3.7-plus | 4.4 | 17.6 | - |
| deepseek-v4-pro | 4.95 | 14.85 | deepseek-ai/DeepSeek-V4-Pro-0813 |
| qwen3.6-plus | 5.5 | 33 | - |
| glm-5.1 | 7.700000000000001 | 26 | zai-org/GLM-5.1 |
| glm-5.2 | 8 | 28 | zai-org/GLM-5.2 |
| qwen3.8-max | 13.2 | 39.6 | - |
| kimi-k3 | 22 | 110 | moonshotai/Kimi-K3 |

## 主文案六个具名模型的核对结果

未命中（不得写进物料）：`deepseek-v4.1-flash`
