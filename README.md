# Pi-JitRL

[简体中文](README.zh-CN.md) · [日本語](README.ja.md)

Pi-JitRL records how a coding agent uses tools, retrieves similar past states, and estimates which actions produced better returns. It sends those estimates to Pi before the next model call. Experience stays in a local SQLite database across sessions.

V1 implements action-level guidance inspired by [Just-In-Time Reinforcement Learning](https://arxiv.org/abs/2601.18510). It computes advantages and a reference action policy. Pi's model then decides whether to follow the advice. V1 does not modify provider token logits, enforce action probabilities, or update model weights.

## Install

Use Node.js 22.19 or later and Pi. The current Pi package is `@earendil-works/pi-coding-agent`; this project builds and tests against version 1.0.3.

```bash
pi install git:github.com/Jas-S/Pi-JitRL
```

For local development:

```bash
git clone https://github.com/Jas-S/Pi-JitRL.git
cd Pi-JitRL
npm ci
npm run build
pi -e .
```

The repository ships `dist/extension.js`, the entry declared in the Pi package manifest. Pi installs Git packages without development dependencies, so the compiled files are included in Git. Restart Pi or run `/reload` after installing. The package has no third-party runtime dependencies; SQLite comes from Node.js.

## Use it

Work in Pi as usual. Pi-JitRL records one trajectory per agent run, with each tool's pre-action state, action category, reward and discounted return. On a new project, it collects experience without injecting advice. Guidance starts when similar trajectories contain enough evidence for different actions.

```text
/jitrl status
/jitrl stats
/jitrl memory 5
/jitrl explain
/jitrl feedback success
```

`explain` shows the retrieved trajectory IDs, similarities, estimated Q values, advantages and reference probabilities. Feedback rates the last completed trajectory on the current session branch. `success` gives +1; `failure` and `revert` give -1; `correction` gives -0.8. You can also supply a number in [-1, 1]. A new rating replaces the previous one and recomputes returns.

Ending an agent run does not earn a success reward. Use explicit feedback when you want to record task acceptance. Ordinary chat text such as "looks good" is not scored automatically.

## Rewards and retrieval

The action categories are `READ`, `SEARCH`, `EDIT`, `WRITE`, `BASH`, `TEST`, `BUILD`, `TYPECHECK`, `LINT`, `GIT` and `DELEGATE`.

| Signal | Reward |
| --- | ---: |
| Test command exits with 0 | +0.80 |
| Build command exits with 0 | +0.60 |
| Typecheck command exits with 0 | +0.40 |
| Lint command exits with 0 | +0.30 |
| Tool failure | -0.20 |
| Test / build / typecheck / lint failure | -0.50 / -0.40 / -0.30 / -0.20, in addition to tool failure |
| Repeated error within the run | -0.30 extra |

Exit status is a proxy for verification, not proof that the task is correct. V1 recognizes common runners such as `npm test`, `python -m pytest`, `cargo test` and `npx tsc --noEmit`. Commands with shell chains, pipes or failure masking stay in `BASH` and receive no verification bonus. Nested tool calls are excluded to avoid counting an outer tool and its children twice.

Retrieval uses normalized task text, word n-grams, recent actions, edit state and the last tool outcome. Chinese text also uses character boundaries. Jaccard similarity selects nearby states, with at most one state per action from each trajectory. Only completed trajectories from the same canonical working directory enter retrieval. No embeddings or external inference service are required.

## Configuration

```text
/jitrl config
/jitrl config mode observe
/jitrl config beta 0.5
/jitrl config mode guide
```

`guide` records experience and injects numeric advice. `observe` records experience without advice, for comparison runs. `off` stops both. Change settings between agent runs; the command saves them to `.pi/jitrl/config.json` in the current project.

| Setting | Default | Meaning |
| --- | ---: | --- |
| `gamma` | 0.9 | Discount for future rewards; applies to new trajectories |
| `beta` | 0.5 | Strength of the reference policy correction; smaller means stronger |
| `topK` | 20 | Maximum retrieved state/action matches |
| `minSimilarity` | 0.15 | Minimum Jaccard similarity, with task-text overlap required |
| `minSamples` | 2 | Trajectories supporting an action before its advantage affects advice |
| `maxCandidates` | 500 | Recent completed trajectories scanned per query |
| `maxTrajectories` | 2000 | Completed or aborted trajectories retained per project |
| `ngram` | 2 | Largest task n-gram size, from 1 to 4 |

## Local data

The default database is `~/.pi/agent/jitrl/memory.sqlite`. Set `PI_JITRL_DB` to use another location. Project partitions use a hash of the canonical working directory, so sessions in one directory share experience while other directories stay separate.

The database stores bounded, normalized task text and action metadata. It does not store raw tool arguments, file contents or tool output. Common credential formats are redacted before storage, but redaction cannot detect every secret. Keep private data out of prompts when you need a stronger boundary. Guidance contains numeric estimates and fixed text; historical task text never enters the injected advice.

Incomplete trajectories remain available for inspection but do not affect retrieval. Session navigation restores the feedback target from branch entries. Ratings survive reloads because they live in SQLite.

## Development

```bash
npm run check
npm test
npm run experiment
npm pack --dry-run
```

Tests cover return calculations, sparse evidence, project isolation, persistence, branch feedback and Pi's actual extension loader. They also run Pi's bash tool without calling a model. The experiment uses synthetic trajectories to show how advantages change the reference policy; it is not an agent benchmark.

The [local Codex validation](docs/validation.md) records three real Pi runs, including guidance reaching provider requests after a restart.

`src/core` contains the Pi-independent learning logic and exports through `pi-jitrl/core`. `src/storage` implements SQLite persistence. `src/extension.ts` adapts Pi events and commands. See [the algorithm notes](docs/algorithm.md) for the equations and V1's departures from the paper, and [the V1 scope](docs/v1.md) for the implementation boundary.

## References

The [JitRL implementation](https://github.com/liushiliushi/JitRL) provides the trajectory retrieval and advantage-estimation reference. Pi's [extension API](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) and [package format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md) define the integration.

License: [MIT](LICENSE).
