# Local Codex validation

On October 5, 2026, Pi-JitRL 0.1.0 was installed from this GitHub repository with Pi 1.0.3. The live check used an existing Codex subscription OAuth login and `openai-codex/gpt-6.1-sol`. It required no additional API key.

## Automated checks

All 11 local tests passed. They covered advantage estimates, discounted returns, command classification, credential redaction, SQLite persistence, project separation, branch feedback, operating modes, the real Pi extension loader and Pi's bash tool. The initial GitHub [CI run](https://github.com/Jas-S/Pi-JitRL/actions/runs/37317841118) also passed on Node.js 22.19 and 24.

The package installed through `pi install git:github.com/Jas-S/Pi-JitRL`, and `pi list` reported it as a user package. Installation used the compiled entry shipped in Git, with no development dependencies installed.

## Three live runs

The fixture was a temporary JavaScript project with an `add(a,b)` function that incorrectly subtracted its arguments. Its test checked two addition cases. Each run began with the broken function and this request:

```text
Fix add in math.js so npm test passes. Read math.js, run npm test before the fix, make the smallest edit, then run npm test again. Report the outcome briefly.
```

Pi used its real tools and the logged-in Codex model. All three runs produced the sequence `READ → TEST → EDIT → TEST`. The first test failed, the edit fixed the function, and the second test passed. Pi-JitRL stored rewards `[0, -0.7, 0, 0.8]` for each run. An independent test execution also passed after every run.

After each run, `/jitrl feedback success` saved +1 and recomputed the returns. The second run used a new session. Pi was stopped and started again before the third run.

The final database contained three completed trajectories, 12 steps and three success ratings. An observation-only extension checked for the Pi-JitRL guidance marker in the actual outgoing provider payload. There were 15 provider requests in total; all five requests made after the restart contained guidance. The first two runs supplied the evidence needed for the third.

The fixture, sessions and database used a separate temporary directory. These test trajectories did not enter the user's regular experience database. The package itself was installed in Pi's normal user scope.

## Policy check

After the live runs, retrieval was queried at the state following `READ → TEST → EDIT`. The reference prior was uniform over nine available action categories. Using the three recorded trajectories gave:

| Action | Supporting trajectories | Q | Advantage | Reference probability |
| --- | ---: | ---: | ---: | ---: |
| READ | 3 | 0.6822 | -0.7038 | 2.42% |
| EDIT | 3 | 1.6200 | +0.2340 | 15.76% |
| TEST | 3 | 1.8000 | +0.4140 | 22.59% |

TEST rose from the 11.11% uniform reference prior to 22.59%. This confirms that the stored rewards produced a positive advantage for verification in that state. The probabilities describe the local reference policy, not Codex's sampling distribution.

## What the check establishes

The installed package captured real actions, persisted their rewards, accepted feedback, retrieved experience across sessions and a process restart, and included guidance in requests to Codex. Those are the V1 integration requirements.

Three repetitions of a small arithmetic fix cannot establish a gain in coding-agent success rate. The request explicitly required testing, so these runs also cannot show that guidance caused the model to choose verification. A separate evaluation should compare `guide` and `observe` with varied tasks and independent outcome scoring.
