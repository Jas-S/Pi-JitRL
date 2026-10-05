# Pi-JitRL

[English](README.md) · [日本語](README.ja.md)

Pi-JitRL 记录编码 Agent 的工具行为，检索相似的历史状态，并根据奖励估计哪些动作更值得执行。这些数值会在下一次模型调用前传给 Pi。经验保存在本地 SQLite 中，可跨会话使用。

V1 实现的是受 [Just-In-Time Reinforcement Learning](https://arxiv.org/abs/2601.18510) 启发的动作层引导。它计算 advantage 和参考动作策略，由 Pi 的模型决定是否采纳建议。V1 不修改服务端 token logits，不强制执行参考概率，也不更新模型权重。

## 安装

需要 Node.js 22.19 或更高版本，以及 Pi。目前 Pi 的包名是 `@earendil-works/pi-coding-agent`，本项目基于 1.0.3 构建和测试。

```bash
pi install git:github.com/Jas-S/Pi-JitRL
```

本地开发：

```bash
git clone https://github.com/Jas-S/Pi-JitRL.git
cd Pi-JitRL
npm ci
npm run build
pi -e .
```

仓库包含构建好的 `dist/extension.js`，Pi 通过 package manifest 加载这个入口。Pi 安装 Git 包时不安装开发依赖，因此编译产物也纳入 Git。安装后重启 Pi，或执行 `/reload`。本包没有第三方运行时依赖，SQLite 使用 Node.js 内置模块。

## 使用

按平常的方式使用 Pi 即可。每次 Agent 运行形成一条轨迹，包含各工具执行前的状态、动作类别、奖励和折扣回报。新项目没有历史经验时，只采集数据。相似轨迹为不同动作提供足够证据后，扩展才注入建议。

```text
/jitrl status
/jitrl stats
/jitrl memory 5
/jitrl explain
/jitrl feedback success
```

`explain` 展示检索到的轨迹 ID、相似度、Q 值、advantage 和参考概率。反馈针对当前会话分支最近完成的轨迹：`success` 为 +1，`failure` 和 `revert` 为 -1，`correction` 为 -0.8，也可以输入 [-1, 1] 内的数字。再次评分会替换原评分，并重算回报。

Agent 结束运行本身不会获得成功奖励。如果你认可任务结果，用反馈命令记录。普通聊天中的“不错”“完成了”等文字不会自动计分。

## 奖励与检索

动作类别包括 `READ`、`SEARCH`、`EDIT`、`WRITE`、`BASH`、`TEST`、`BUILD`、`TYPECHECK`、`LINT`、`GIT` 和 `DELEGATE`。

| 信号 | 奖励 |
| --- | ---: |
| 测试命令以 0 退出 | +0.80 |
| 构建命令以 0 退出 | +0.60 |
| 类型检查命令以 0 退出 | +0.40 |
| Lint 命令以 0 退出 | +0.30 |
| 工具失败 | -0.20 |
| 测试 / 构建 / 类型检查 / Lint 失败 | -0.50 / -0.40 / -0.30 / -0.20，另加工具失败扣分 |
| 同一次运行中重复报错 | 额外 -0.30 |

退出码只是验证结果的代理信号，不能证明任务正确。V1 识别 `npm test`、`python -m pytest`、`cargo test`、`npx tsc --noEmit` 等常见命令。含 shell 串联、管道或失败掩盖的命令归入 `BASH`，不给验证奖励。嵌套工具调用不单独采集，避免父工具与子工具重复计分。

检索特征包括归一化任务文本、词 n-gram、近期动作、编辑状态和上次工具结果。中文文本也会按汉字划分边界。Jaccard 相似度用于挑选邻近状态，每条轨迹的每种动作最多贡献一个状态。只有相同真实工作目录下的已完成轨迹进入检索，不需要 embedding 或外部推理服务。

## 配置

```text
/jitrl config
/jitrl config mode observe
/jitrl config beta 0.5
/jitrl config mode guide
```

`guide` 采集经验并注入数值建议；`observe` 只采集，便于做对照；`off` 停止采集和引导。请在 Agent 运行结束后改配置。命令将设置写入当前项目的 `.pi/jitrl/config.json`。

| 配置项 | 默认值 | 含义 |
| --- | ---: | --- |
| `gamma` | 0.9 | 未来奖励的折扣系数，适用于新轨迹 |
| `beta` | 0.5 | 参考策略修正强度，越小越强 |
| `topK` | 20 | 检索状态与动作匹配的数量上限 |
| `minSimilarity` | 0.15 | Jaccard 阈值，且任务文本必须有交集 |
| `minSamples` | 2 | 动作的 advantage 生效前所需的轨迹数量 |
| `maxCandidates` | 500 | 每次检索扫描的近期已完成轨迹上限 |
| `maxTrajectories` | 2000 | 每个项目保留的已完成或中止轨迹上限 |
| `ngram` | 2 | 任务 n-gram 的最大长度，可设为 1 至 4 |

## 本地数据

数据库默认位于 `~/.pi/agent/jitrl/memory.sqlite`，可以通过 `PI_JITRL_DB` 指定其他位置。项目分区使用真实工作目录的哈希，同一目录中的会话共享经验，其他目录互相隔离。

数据库保存截断、归一化后的任务文本和动作元数据，不保存原始工具参数、文件内容或工具输出。入库前会遮盖常见凭据格式，但无法识别所有秘密。如果需要更严格的数据边界，请不要把敏感信息放进提示词。注入给模型的内容只有数值估计和固定说明，不包含历史任务文本。

未完成的轨迹可供查看，但不参与检索。切换会话树时，扩展从分支记录恢复反馈目标；评分保存在 SQLite 中，重载后仍然有效。

## 开发

```bash
npm run check
npm test
npm run experiment
npm pack --dry-run
```

测试覆盖回报计算、稀疏证据、项目隔离、持久化、分支反馈和 Pi 实际扩展加载器，也会在不调用模型的情况下运行 Pi 的 bash 工具。实验使用合成轨迹展示 advantage 对参考策略的影响，不是 Agent 效果评测。

[本机 Codex 验证记录](docs/validation.md)记载了三轮真实 Pi 运行，也确认了重启后引导内容进入实际模型请求。记录使用英文。

`src/core` 是独立于 Pi 的学习逻辑，可通过 `pi-jitrl/core` 导入。`src/storage` 实现 SQLite 存储，`src/extension.ts` 负责 Pi 事件和命令。公式与论文差异见[算法说明](docs/algorithm.md)，实现范围见 [V1 范围](docs/v1.md)，这两份说明使用英文。

## 参考资料

[JitRL 官方实现](https://github.com/liushiliushi/JitRL) 是轨迹检索与优势估计的参考。Pi 的[扩展 API](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)和[包格式](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)定义了集成方式。

许可证：[MIT](LICENSE)。
