import type { Action, Reward, Step } from "./types.js";

export function toolReward(action: Action, isError: boolean, exitCode: number | undefined, repeatedError = false): Reward {
  const failed = isError || (exitCode !== undefined && exitCode !== 0);
  const weights: Partial<Record<Action, [number, number]>> = {
    TEST: [0.8, -0.5], BUILD: [0.6, -0.4], TYPECHECK: [0.4, -0.3], LINT: [0.3, -0.2],
  };
  const verification = weights[action];
  // A successful tool event alone is insufficient to infer a shell verification pass.
  const verified = !failed && exitCode === 0;
  const reward = {
    tool: failed ? -0.2 : 0,
    verification: verification ? (failed ? verification[1] : verified ? verification[0] : 0) : 0,
    repetition: failed && repeatedError ? -0.3 : 0,
    total: 0,
  };
  reward.total = reward.tool + reward.verification + reward.repetition;
  return reward;
}

export function discountedReturns(steps: Step[], gamma: number, feedback = 0): Step[] {
  let value = feedback;
  return steps.map(s => ({ ...s })).reverse().map((step, i) => {
    // Feedback is a terminal reward on the final action, without an extra discount.
    value = step.reward.total + (i === 0 ? value : gamma * value);
    return { ...step, return: value };
  }).reverse();
}
