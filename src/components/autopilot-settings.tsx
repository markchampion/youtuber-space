"use client";

import { AUTO_STEPS, AUTO_STEP_LABELS, autopilotOf, type AutoStep, type AutopilotConfig, type ChannelProfile } from "@/lib/channel";
import { Label, Select, cn } from "./ui";

/** Channel default for a project's one-click Autopilot: how far it runs and where it waits for review. */
export function AutopilotSettings({ profile, onChange }: { profile: ChannelProfile; onChange: (p: ChannelProfile) => void }) {
  const cfg = autopilotOf(profile);
  const stopIdx = AUTO_STEPS.indexOf(cfg.stopAfter);
  const set = (patch: Partial<AutopilotConfig>) => {
    const next = { ...cfg, ...patch };
    const idx = AUTO_STEPS.indexOf(next.stopAfter);
    next.pauseAfter = next.pauseAfter.filter((s) => AUTO_STEPS.indexOf(s) < idx);
    onChange({ ...profile, autopilot: next });
  };
  const togglePause = (s: AutoStep) =>
    set({ pauseAfter: cfg.pauseAfter.includes(s) ? cfg.pauseAfter.filter((x) => x !== s) : [...cfg.pauseAfter, s] });
  const runs = (s: AutoStep) => AUTO_STEPS.indexOf(s) <= stopIdx;

  return (
    <div className="space-y-4">
      <div>
        <Label hint="each step after the outline uses the one before it">Run until</Label>
        <Select value={cfg.stopAfter} onChange={(e) => set({ stopAfter: e.target.value as AutoStep })} className="max-w-xs">
          {AUTO_STEPS.map((s) => (
            <option key={s} value={s}>
              {AUTO_STEPS.slice(0, AUTO_STEPS.indexOf(s) + 1)
                .map((x) => AUTO_STEP_LABELS[x])
                .join(" → ")}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label hint="Autopilot waits there until you press Continue; edits you make are kept">Pause for my review after</Label>
        <div className="flex flex-wrap gap-1.5">
          {AUTO_STEPS.slice(0, stopIdx).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => togglePause(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                cfg.pauseAfter.includes(s) ? "border-amber-300 bg-amber-50 text-amber-800" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300",
              )}
            >
              {cfg.pauseAfter.includes(s) ? "⏸ " : ""}
              {AUTO_STEP_LABELS[s]}
            </button>
          ))}
          {stopIdx === 0 ? <span className="text-xs text-stone-500">Stops after the outline.</span> : null}
        </div>
      </div>
      {runs("images") || runs("render") ? (
        <div className="flex flex-wrap items-end gap-6">
          {runs("images") ? (
            <div>
              <Label hint="per image">Image quality</Label>
              <Select value={cfg.imageQuality} onChange={(e) => set({ imageQuality: e.target.value as AutopilotConfig["imageQuality"] })} className="w-48">
                <option value="low">Low (cheapest draft)</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
          ) : null}
          {runs("render") ? (
            <>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-orange-500" checked={cfg.captions} onChange={(e) => set({ captions: e.target.checked })} />
                Captions
              </label>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-orange-500" checked={cfg.kenBurns} onChange={(e) => set({ kenBurns: e.target.checked })} />
                Slow zoom (Ken Burns)
              </label>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
