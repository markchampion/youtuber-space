import "server-only";
import { env } from "@/lib/env";
import { AUTO_STEPS, AUTO_STEP_LABELS, autopilotOf, isAdChannel, type AutoStep, type AutopilotConfig, type AutopilotState } from "@/lib/channel";
import { needsImage } from "@/lib/ai/prompts/image";
import { runningJobOf, startJob, waitForJob, type JobCtx } from "@/lib/jobs/queue";
import { wordCount } from "@/lib/sync";
import type { StepKey } from "@/lib/types";
import { approveStep, getChannel, getProject, scenesOf, updateProject } from "./common";
import { approveScript, generateOutline, generateScript, POLISH_MARKER } from "./script";
import { paragraphsNeedingVoice, startVoiceJob, voiceConfig } from "./voice";
import { startPlanScenesJob } from "./scenes";
import { approveAllImages, startImagesJob } from "./images";
import { startRenderJob } from "./render";
import { listRenders } from "./history";
import { generateAdScript } from "./product-ad";

/**
 * Autopilot runs the steps one after another in a background job, using the same functions as the
 * buttons on each step page. Every step is skipped when its output is already there and current, so
 * Continue / Retry simply run the loop again. It pauses after the steps the channel asks to review.
 */

const JOB = "autopilot";

type Run = { from?: AutoStep; config?: Partial<AutopilotConfig> };

export function autopilotState(projectId: string): AutopilotState | null {
  const a = getProject(projectId).autopilot;
  if (!a) return null;
  // "running" with no live job means the server stopped mid-run.
  return a.status === "running" && !runningJobOf(projectId, JOB) ? { ...a, interrupted: true } : a;
}

function save(projectId: string, patch: Partial<AutopilotState>) {
  const cur = getProject(projectId).autopilot;
  if (!cur) return;
  updateProject(projectId, { autopilot: { ...cur, ...patch } });
}

/** Start a new run. `run.from` / `run.config` override the channel defaults (used by Re-voice). */
export function startAutopilot(projectId: string, baseUrl: string, run: Run = {}) {
  if (runningJobOf(projectId, JOB)) throw new Error("Autopilot is already running");
  const p = getProject(projectId);
  const config = { ...autopilotOf(getChannel(p.channelId).profile), ...(run.config ?? {}) };
  const from = run.from ?? "outline";
  if (AUTO_STEPS.indexOf(from) > AUTO_STEPS.indexOf(config.stopAfter)) throw new Error("Nothing to run");
  preflight(projectId, from, config);
  const state: AutopilotState = { status: "running", step: from, from, config, baseUrl, startedAt: new Date().toISOString() };
  updateProject(projectId, { autopilot: state });
  return startJob(projectId, JOB, (ctx) => loop(projectId, from, ctx));
}

/** Continue after a review pause (approving that step as it is now), or retry after an error / restart. */
export function continueAutopilot(projectId: string, baseUrl?: string) {
  const a = autopilotState(projectId);
  if (!a) throw new Error("Autopilot hasn't run on this video yet");
  if (a.status === "running" && !a.interrupted) throw new Error("Autopilot is already running");
  if (a.status === "done") throw new Error("Autopilot already finished");
  let start = a.step;
  if (a.status === "paused" && !a.pausedReason) {
    // A review checkpoint: your edits are what gets approved, then the next step starts.
    approve(projectId, a.step);
    const next = AUTO_STEPS[AUTO_STEPS.indexOf(a.step) + 1];
    if (!next || AUTO_STEPS.indexOf(a.step) >= AUTO_STEPS.indexOf(a.config.stopAfter)) {
      save(projectId, { status: "done", pausedReason: undefined });
      return null;
    }
    start = next;
  }
  preflight(projectId, start, a.config);
  save(projectId, { status: "running", step: start, error: undefined, pausedReason: undefined, ...(baseUrl ? { baseUrl } : {}) });
  return startJob(projectId, JOB, (ctx) => loop(projectId, start, ctx));
}

/** Stop after the current step. A step already running (e.g. images) finishes first; jobs can't be cancelled. */
export function stopAutopilot(projectId: string) {
  const a = getProject(projectId).autopilot;
  if (!a) return;
  save(projectId, { status: "stopped" });
}

function preflight(projectId: string, from: AutoStep, config: AutopilotConfig) {
  const includes = (s: AutoStep) => AUTO_STEPS.indexOf(from) <= AUTO_STEPS.indexOf(s) && AUTO_STEPS.indexOf(s) <= AUTO_STEPS.indexOf(config.stopAfter);
  if (includes("voice") && !env.dryRun && getProject(projectId).voiceMode !== "none") voiceConfig(projectId); // throws "Pick a voice first"
}

async function loop(projectId: string, from: AutoStep, ctx: JobCtx) {
  const steps = AUTO_STEPS.slice(AUTO_STEPS.indexOf(from), AUTO_STEPS.indexOf(getProject(projectId).autopilot!.config.stopAfter) + 1);
  for (const [i, step] of steps.entries()) {
    const state = getProject(projectId).autopilot;
    if (!state || state.status !== "running") return; // stopped by the user
    save(projectId, { step });
    const report = (frac: number, msg: string) => ctx.progress((i + frac) / steps.length, `${AUTO_STEP_LABELS[step]}: ${msg}`);
    try {
      report(0, "starting");
      const produced = await produce(projectId, step, state, report);
      if (getProject(projectId).autopilot?.status !== "running") return; // stopped while this step ran
      const reason = problem(projectId, step);
      if (reason) {
        save(projectId, { status: "paused", pausedReason: reason });
        return;
      }
      const review = state.config.pauseAfter.includes(step) && (produced || !isApproved(projectId, step));
      if (review) {
        save(projectId, { status: "paused", pausedReason: undefined });
        return;
      }
      approve(projectId, step);
    } catch (e) {
      save(projectId, { status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }
  save(projectId, { status: "done" });
}

/** Run a step if its output is missing or out of date. Returns whether anything was (re)made. */
async function produce(projectId: string, step: AutoStep, state: AutopilotState, report: (frac: number, msg: string) => void) {
  const p = getProject(projectId);
  const ad = isAdChannel(getChannel(p.channelId).profile);
  switch (step) {
    case "outline":
      // Ads are written straight from the product brief.
      if (p.outline || ad) return false;
      report(0.1, "writing the outline");
      await generateOutline(projectId);
      return true;

    case "script": {
      if (p.script?.trim()) return false;
      if (ad) {
        report(0.2, "writing the ad");
        await generateAdScript(projectId);
        return true;
      }
      const lang = getChannel(p.channelId).profile.language;
      let text = "";
      let last = 0;
      await generateScript(projectId, (d) => {
        if (d === POLISH_MARKER) {
          text = "";
          report(0.6, "polishing");
          return;
        }
        text += d;
        if (Date.now() - last > 1000) {
          last = Date.now();
          report(0.3, `writing (${wordCount(text, lang)} words)`);
        }
      });
      return true;
    }

    case "voice":
      approveScriptIfNeeded(projectId);
      // Silent ads: approving the script already timed every line by reading pace. Nothing to voice.
      if (p.voiceMode === "none") return false;
      if (getProject(projectId).audioPath && !paragraphsNeedingVoice(projectId).length) return false;
      report(0.05, "voicing");
      await waitForJob(startVoiceJob(projectId));
      return true;

    case "scenes":
      approveScriptIfNeeded(projectId);
      if (scenesOf(projectId).length && !p.stale.scenes) return false;
      report(0.1, "planning scenes");
      await waitForJob(startPlanScenesJob(projectId));
      return true;

    case "images": {
      const id = startImagesJob(projectId, { quality: state.config.imageQuality, onlyMissing: true });
      if (!id) return false;
      report(0.05, "drawing");
      // A partial failure is reported by problem(); only "all failed" throws.
      await waitForJob(id);
      return true;
    }

    case "render": {
      if (p.renderPath && p.approvals.render && !p.stale.render) return false;
      // Re-voice keeps the options of the last render; a first render uses the Autopilot settings.
      const last = listRenders(projectId)[0]?.options ?? {};
      const opts = {
        showCaptions: typeof last.captions === "boolean" && state.from === "voice" ? last.captions : state.config.captions,
        kenBurns: typeof last.kenBurns === "boolean" && state.from === "voice" ? last.kenBurns : state.config.kenBurns,
      };
      report(0.02, "rendering");
      await waitForJob(startRenderJob(projectId, { ...opts, baseUrl: state.baseUrl }));
      return true;
    }
  }
}

/** Something that needs you before going on, even when that step isn't a review checkpoint. */
function problem(projectId: string, step: AutoStep): string | null {
  if (step === "images") {
    const profile = getChannel(getProject(projectId).channelId).profile;
    const missing = scenesOf(projectId).filter((s) => needsImage(profile, s) && !s.imagePath).length;
    if (missing) return `${missing} image${missing > 1 ? "s" : ""} failed. Regenerate or upload them, then continue.`;
  }
  if (step === "voice" && getProject(projectId).voiceMode !== "none" && paragraphsNeedingVoice(projectId).length) return "Some paragraphs failed to voice. Retry them, then continue.";
  return null;
}

const STEP_KEY: Partial<Record<AutoStep, StepKey>> = { script: "script", voice: "voice", scenes: "scenes", images: "images", render: "render" };

function isApproved(projectId: string, step: AutoStep) {
  const key = STEP_KEY[step];
  if (!key) return false; // the outline has no approval of its own
  const p = getProject(projectId);
  return Boolean(p.approvals[key]) && !p.stale[key];
}

function approveScriptIfNeeded(projectId: string) {
  if (!isApproved(projectId, "script")) approveScript(projectId);
}

function approve(projectId: string, step: AutoStep) {
  const key = STEP_KEY[step];
  if (!key) return;
  if (step === "script") return approveScriptIfNeeded(projectId);
  if (step === "images") approveAllImages(projectId);
  approveStep(projectId, key);
}
