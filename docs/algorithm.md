# Action-level learning in V1

Pi-JitRL estimates action values from local trajectories. It computes the policy correction before each model call, then presents the resulting numbers as advice. The provider keeps control of generation.

## State and action

A state contains normalized task text, the last six action categories, whether an edit or write has succeeded during this run, and the last tool outcome. The edit flag remains set after verification: passing one verifier does not establish that every property of a change has been checked. Each tool result updates the state; the saved state is the snapshot from before its call.

One trajectory spans an agent run. The V1 action space groups tools into categories, including separate categories for tests, builds, typechecks and lint. The tool classifier recognizes simple verification commands. Compound shell commands remain generic `BASH` actions because their final exit code may hide an earlier failure.

## Rewards and returns

Each step has a tool reward, a verification reward and a repeated-error penalty. Explicit user feedback supplies a terminal reward. All four are visible in the stored trajectory.

For a trajectory with T steps, terminal feedback f and discount gamma:

```text
G[T-1] = r[T-1] + f
G[t]   = r[t] + gamma * G[t+1]
```

For example, an edit with reward 0 followed by a passing test with reward 0.8 has returns `[0.72, 0.8]` at gamma 0.9. A success rating of +1 changes them to `[1.62, 1.8]`. Replacing that rating with -1 yields `[-0.18, -0.2]`.

An agent run finishing does not imply task success. Interrupted runs are excluded from learning. Each recorded trajectory keeps its original gamma, so later config changes do not silently rewrite old credit assignments.

## Retrieval

The feature set combines task unigrams through n-grams with the state metadata. Similarity is Jaccard intersection over union. A candidate must share task features with the current state, beyond redacted credential placeholders; matching only an edit flag is insufficient.

Retrieval scans a bounded number of recent completed trajectories from the same project. It keeps the closest state for each action within each trajectory and takes the top-K matches globally. This limits the effect of repeated actions in a long run. Stored task features are regenerated at query time with the current n-gram setting.

## Advantage and reference policy

For retrieved match i, let w_i be similarity and G_i its return. The estimator uses similarity-weighted averages:

```text
Q(s,a) = sum(w_i * G_i for action a) / sum(w_i for action a)
V(s)   = sum(w_i * G_i over all matches) / sum(w_i over all matches)
A(s,a) = Q(s,a) - V(s)
```

Actions below `minSamples` receive advantage 0. Actions with no matches have no Q estimate and also receive advantage 0. A single well-supported action with no competing evidence has Q equal to V, so it produces no directional advice.

Given an explicit prior pi0, the core computes:

```text
pi_ref(a|s) = pi0(a|s) * exp(A(s,a) / beta) / Z
```

The implementation uses a stable softmax. A zero prior remains zero. Core callers can supply their own prior; the Pi adapter uses a uniform reference over action categories available through its active tools. That prior is an assumption, not a measurement of the model's action probabilities.

The injected message reports Q, A, evidence counts and reference probabilities. It contains no historical instructions or task text. With too little evidence, it inserts nothing.

## Relationship to JitRL

The [paper](https://arxiv.org/abs/2601.18510) motivates memory-based advantage estimation and an additive logit correction. The [official implementation](https://github.com/liushiliushi/JitRL) includes n-gram Jaccard retrieval and action-return aggregation.

V1 adapts those ideas to coding tools. It uses deterministic reward signals, category-level actions, similarity-weighted estimates and a minimum evidence count. It does not reproduce the paper's step evaluator, exploration heuristics, benchmark environments or token-level inference path. The reference-policy equation is computed locally; context advice does not guarantee that Pi samples from that policy. Agent performance needs a separate evaluation with real tasks.

A later provider adapter could supply model probabilities and apply corrections during controllable inference. That would require its own implementation and validation.
