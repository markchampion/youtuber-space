import { describe, expect, it } from "vitest";
import { CLAUDE_STEPS, PRESETS, PRICES, estimateVideoCost, resolveModel, stepForKind, type ClaudeStep } from "./claude-models";

// Every `kind` passed to claudeJSON/claudeText in src/lib/pipeline.
const KINDS = ["ideas", "evaluate_idea", "outline", "script", "rewrite", "fact_check", "scenes", "metadata", "shorts", "polish", "channel_draft", "channel_rewrite"];

describe("Claude model routing", () => {
  it("maps every pipeline kind to a step with a model in each preset", () => {
    for (const kind of KINDS) {
      const step = stepForKind(kind);
      expect(CLAUDE_STEPS.find((s) => s.key === step)?.kinds).toContain(kind);
      for (const p of ["quality", "balanced", "cheapest"] as const) expect(resolveModel(step, p, {})).toMatch(/^claude-/);
    }
  });

  it("never drops the script below Sonnet in a preset", () => {
    for (const p of Object.values(PRESETS)) expect(p.models.script).not.toBe("claude-haiku-4-5");
  });

  it("applies custom overrides and falls back to Balanced for unset steps", () => {
    expect(resolveModel("script", "custom", { script: "claude-haiku-4-5" })).toBe("claude-haiku-4-5");
    expect(resolveModel("scenes", "custom", {})).toBe(PRESETS.balanced.models.scenes);
  });

  it("orders cost estimates cheapest < balanced < best quality", () => {
    const cost = (m: Record<ClaudeStep, string>) => estimateVideoCost(m);
    expect(cost(PRESETS.cheapest.models)).toBeLessThan(cost(PRESETS.balanced.models));
    expect(cost(PRESETS.balanced.models)).toBeLessThan(cost(PRESETS.quality.models));
    console.log(
      Object.entries(PRESETS)
        .map(([k, p]) => `${k}: $${cost(p.models).toFixed(2)}`)
        .join(", "),
    );
  });
});

it("offers Opus 5.5 with its price, and uses it for writing in Balanced", () => {
  expect(PRICES["claude-opus-5-5"]).toEqual([4, 20]);
  expect(PRESETS.balanced.models.script).toBe("claude-opus-5-5");
  expect(PRESETS.balanced.models.polish).toBe("claude-opus-5-5");
  expect(PRESETS.cheapest.models.polish).toBe("claude-sonnet-5");
});
