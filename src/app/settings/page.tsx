"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Lock, XCircle } from "lucide-react";
import { api } from "@/lib/client";
import { API_KEYS, DRY_RUN, MODEL_SETTINGS, type PublicSetting, type SettingDef, type SettingKey } from "@/lib/settings-defs";
import {
  CLAUDE_MODELS,
  CLAUDE_STEPS,
  PRESETS,
  customKey,
  estimateVideoCost,
  modelLabel,
  resolveModel,
  type ClaudePreset,
  type ClaudeStep,
} from "@/lib/claude-models";
import { Badge, Button, Card, ErrorNote, Input, Select, Spinner, cn } from "@/components/ui";

type TestResult = { ok: boolean; message: string };

function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: PublicSetting[] }>("/api/settings") });
}

function useSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<Record<SettingKey, string | null>>) =>
      api<{ settings: PublicSetting[] }>("/api/settings", { method: "PUT", json: { values } }),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      qc.invalidateQueries({ queryKey: ["channel"] }); // nav key badges
      qc.invalidateQueries({ queryKey: ["voices"] });
    },
  });
}

export default function SettingsPage() {
  const { data } = useSettings();
  const byKey = new Map(data?.settings.map((s) => [s.key, s]));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-stone-600">Values saved here override <code className="rounded bg-stone-200/70 px-1 text-[13px]">.env.local</code> and apply right away, with no restart.</p>

      {!data ? (
        <Spinner className="mt-6" />
      ) : (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <KeyRound className="size-4 text-stone-500" /> API keys
            </h2>
            <div className="space-y-3">
              {API_KEYS.map((def) => (
                <KeyRow key={def.key} def={def} setting={byKey.get(def.key)!} backend={BACKEND_FOR[def.key] ? { ...BACKEND_FOR[def.key]!, setting: byKey.get(BACKEND_FOR[def.key]!.key)! } : undefined} />
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-500">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              Keys are stored on this machine in <code>data/app.db</code>. The browser only ever sees a masked version.
            </p>
          </section>

          <section id="claude" className="scroll-mt-20">
            <h2 className="mb-2 font-semibold">Claude models</h2>
            <ClaudeModelsCard byKey={byKey} />
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Voice & images</h2>
            <Card className="divide-y divide-stone-200">
              {MODEL_SETTINGS.map((def) => (
                <SelectRow key={def.key} def={def} setting={byKey.get(def.key)!} />
              ))}
            </Card>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Testing</h2>
            <DryRunRow setting={byKey.get(DRY_RUN.key)!} />
          </section>
        </div>
      )}
    </main>
  );
}

function SourceBadge({ s }: { s: PublicSetting }) {
  if (!s.isSet) return <Badge tone="red">Not set</Badge>;
  if (s.source === "saved") return <Badge tone="green">Saved in app</Badge>;
  if (s.source === "env") return <Badge tone="blue">From .env.local</Badge>;
  return <Badge>Default</Badge>;
}

/** Keys that can be replaced by a subscription CLI. */
const BACKEND_FOR: Partial<Record<SettingKey, { key: SettingKey; cliValue: string; which: "claude" | "codex"; cliLabel: string }>> = {
  ANTHROPIC_API_KEY: { key: "CLAUDE_BACKEND", cliValue: "cli", which: "claude", cliLabel: "Claude Code (my plan)" },
  OPENAI_API_KEY: { key: "IMAGE_BACKEND", cliValue: "codex", which: "codex", cliLabel: "Codex (my ChatGPT plan)" },
};

type Backend = { key: SettingKey; cliValue: string; which: "claude" | "codex"; cliLabel: string; setting: PublicSetting };

function KeyRow({ def, setting, backend }: { def: SettingDef; setting: PublicSetting; backend?: Backend }) {
  const save = useSave();
  const useCli = backend?.setting?.value === backend?.cliValue;
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(!setting.isSet);
  const test = useMutation({
    mutationFn: () => api<TestResult>("/api/settings/test", { json: { provider: def.key } }),
  });

  async function saveAndTest() {
    await save.mutateAsync({ [def.key]: draft });
    setDraft("");
    setEditing(false);
    test.mutate();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{def.label}</span>
            <SourceBadge s={setting} />
          </div>
          <p className="mt-0.5 text-[13px] text-stone-600">{def.help}</p>
        </div>
        {def.link && !useCli ? (
          <a href={def.link.href} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline">
            {def.link.label} <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>

      {backend ? (
        <div role="radiogroup" aria-label={`${def.label} connection`} className="mt-3 inline-flex rounded-lg bg-stone-200/70 p-1">
          {[
            { v: "api", label: "API key" },
            { v: backend.cliValue, label: backend.cliLabel },
          ].map((o) => (
            <button
              key={o.v}
              role="radio"
              aria-checked={(backend.setting?.value ?? "api") === o.v}
              disabled={save.isPending}
              onClick={() => save.mutate({ [backend.key]: o.v === "api" ? null : o.v })}
              className={cn(
                "h-8 rounded-md px-3 text-[13px] font-medium",
                (backend.setting?.value ?? "api") === o.v ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

      {useCli && backend ? (
        <CliPanel which={backend.which} />
      ) : editing ? (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) void saveAndTest();
          }}
        >
          <div className="relative min-w-[240px] flex-1">
            <Input
              type={show ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste your API key"
              autoComplete="off"
              spellCheck={false}
              aria-label={`${def.label} API key`}
              className="pr-10 font-mono text-[13px]"
              autoFocus={setting.isSet}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Hide key" : "Show key"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-700"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button type="submit" variant="primary" disabled={!draft.trim()} loading={save.isPending || test.isPending}>
            Save & test
          </Button>
          {setting.isSet ? (
            <Button type="button" variant="ghost" onClick={() => (setEditing(false), setDraft(""))}>
              Cancel
            </Button>
          ) : null}
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-stone-100 px-2.5 py-1.5 font-mono text-[13px] text-stone-700">{setting.value}</code>
          <Button size="sm" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
            Test
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Replace
          </Button>
          {setting.source === "saved" ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-stone-500 hover:text-red-700"
              onClick={() => {
                test.reset();
                save.mutate({ [def.key]: null });
              }}
              title="Remove the saved key (falls back to .env.local if set there)"
            >
              Remove
            </Button>
          ) : null}
        </div>
      )}

      {test.data && !useCli ? (
        <div className={cn("mt-2 flex items-center gap-1.5 text-[13px]", test.data.ok ? "text-emerald-700" : "text-red-700")}>
          {test.data.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {test.data.message}
        </div>
      ) : null}
      <div className="mt-2 empty:hidden">
        <ErrorNote error={save.error ?? test.error} />
      </div>
    </Card>
  );
}

function SelectRow({ def, setting }: { def: SettingDef; setting: PublicSetting }) {
  const save = useSave();
  const known = def.options?.some((o) => o.value === setting.value);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <div className="min-w-[200px] flex-1">
        <label htmlFor={def.key} className="text-sm font-medium">
          {def.label}
        </label>
        <p className="text-[13px] text-stone-600">{def.help}</p>
      </div>
      <div className="flex items-center gap-2">
        {save.isSuccess && !save.isPending ? <CheckCircle2 className="size-4 text-emerald-600" aria-label="Saved" /> : null}
        <Select
          id={def.key}
          className="w-72"
          value={setting.value}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ [def.key]: e.target.value === def.default ? null : e.target.value })}
        >
          {!known ? <option value={setting.value}>{setting.value} (from .env.local)</option> : null}
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.value === def.default ? " (default)" : ""}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function DryRunRow({ setting }: { setting: PublicSetting }) {
  const save = useSave();
  const on = setting.value === "1" || setting.value.toLowerCase() === "true";
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{DRY_RUN.label}</div>
        <p className="text-[13px] text-stone-600">{DRY_RUN.help}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Dry run"
        disabled={save.isPending}
        onClick={() => save.mutate({ DRY_RUN: on ? "0" : "1" })}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-stone-300")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </Card>
  );
}

function ClaudeModelsCard({ byKey }: { byKey: Map<SettingKey, PublicSetting> }) {
  const save = useSave();
  const preset = (byKey.get("CLAUDE_PRESET")?.value ?? "balanced") as ClaudePreset;
  const custom = Object.fromEntries(CLAUDE_STEPS.map((s) => [s.key, byKey.get(customKey(s.key))?.value ?? ""])) as Record<ClaudeStep, string>;
  const modelsFor = (p: ClaudePreset) =>
    Object.fromEntries(CLAUDE_STEPS.map((s) => [s.key, resolveModel(s.key, p, custom)])) as Record<ClaudeStep, string>;
  const current = modelsFor(preset);

  function pick(p: ClaudePreset) {
    if (p === preset) return;
    if (p === "custom") {
      // Start Custom from whatever is in effect now, so nothing changes until a dropdown is touched.
      save.mutate({ CLAUDE_PRESET: "custom", ...Object.fromEntries(CLAUDE_STEPS.map((s) => [customKey(s.key), current[s.key]])) });
    } else {
      save.mutate({ CLAUDE_PRESET: p });
    }
  }

  const options: { key: ClaudePreset; label: string; blurb: string }[] = [
    ...(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => ({ key: k, label: PRESETS[k].label, blurb: PRESETS[k].blurb })),
    { key: "custom", label: "Custom", blurb: "Pick the model for each step yourself." },
  ];

  return (
    <Card className="p-4">
      <p className="mb-3 text-[13px] text-stone-600">
        Which Claude model writes each step. Estimates are for one ~2,000-word video; the <b>Spent</b> meter on each video shows the real cost.
        Prices are $ per million input / output tokens.
      </p>
      <div role="radiogroup" aria-label="Claude model preset" className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const cost = estimateVideoCost(modelsFor(o.key));
          const active = preset === o.key;
          return (
            <button
              key={o.key}
              role="radio"
              aria-checked={active}
              aria-label={`${o.label}, about $${cost.toFixed(2)} per video`}
              disabled={save.isPending}
              onClick={() => pick(o.key)}
              className={cn(
                "rounded-lg p-3 text-left ring-1 ring-stone-200 transition-shadow hover:shadow-sm disabled:opacity-60",
                active && "ring-2 ring-brand",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{o.label}</span>
                {o.key === "balanced" ? <Badge tone="brand">Recommended</Badge> : null}
                <span className="ml-auto text-sm tabular-nums text-stone-700">≈ ${cost.toFixed(2)} / video</span>
              </div>
              <div className="mt-0.5 text-[13px] text-stone-600">{o.blurb}</div>
            </button>
          );
        })}
      </div>

      {preset === "custom" ? (
        <div className="mt-4 divide-y divide-stone-200 rounded-lg ring-1 ring-stone-200">
          {CLAUDE_STEPS.map((s) => (
            <div key={s.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
              <div className="min-w-[180px] flex-1">
                <label htmlFor={`model-${s.key}`} className="text-sm font-medium">
                  {s.label}
                </label>
                <div className="text-xs text-stone-500">{s.help}</div>
              </div>
              <Select
                id={`model-${s.key}`}
                className="h-9 w-56 text-[13px]"
                value={current[s.key]}
                disabled={save.isPending}
                onChange={(e) => save.mutate({ [customKey(s.key)]: e.target.value })}
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} (${m.price[0]} / ${m.price[1]})
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
          {CLAUDE_STEPS.map((s) => (
            <span key={s.key}>
              {s.label}: <span className="font-medium text-stone-700">{modelLabel(current[s.key])}</span>
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 empty:hidden">
        <ErrorNote error={save.error} />
      </div>
    </Card>
  );
}

type CliStatus = { found: boolean; path: string | null; version: string | null; loggedIn: boolean | null; detail: string };

/** Status + test for a subscription CLI (Claude Code or Codex). */
function CliPanel({ which }: { which: "claude" | "codex" }) {
  const status = useQuery({
    queryKey: ["cli-status"],
    queryFn: () => api<{ claude: CliStatus; codex: CliStatus }>("/api/settings/cli"),
    staleTime: 30_000,
  });
  const test = useMutation({
    mutationFn: () => api<TestResult>("/api/settings/test", { json: { provider: which === "claude" ? "CLAUDE_CLI" : "CODEX_IMAGE" } }),
  });
  const s = status.data?.[which];
  const name = which === "claude" ? "Claude Code" : "Codex";

  return (
    <div className="mt-3 space-y-2">
      {status.isLoading ? (
        <div className="flex items-center gap-2 text-[13px] text-stone-600">
          <Spinner /> Checking {name}…
        </div>
      ) : s ? (
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-[13px] ring-1 ring-stone-200">
          <div className="flex flex-wrap items-center gap-2">
            {s.found && s.loggedIn !== false ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}
            <span className="font-medium">{s.found ? `${name} ${s.version ?? ""}` : `${name} not found`}</span>
            {s.loggedIn ? <Badge tone="green">Logged in</Badge> : s.loggedIn === false ? <Badge tone="red">Not logged in</Badge> : null}
          </div>
          {s.path ? <div className="mt-0.5 font-mono text-[11px] text-stone-500">{s.path}</div> : null}
          {s.detail ? <div className="mt-0.5 text-stone-600">{s.detail}</div> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={test.isPending}
          disabled={!s?.found}
          onClick={() => {
            if (which === "codex" && !confirm("This draws one small test image using your ChatGPT plan (about 1–2 minutes). Continue?")) return;
            test.mutate();
          }}
        >
          {which === "claude" ? "Test (1 short message)" : "Test (draws 1 image)"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => status.refetch()} loading={status.isFetching && !status.isLoading}>
          Re-check
        </Button>
      </div>
      {test.data ? (
        <div className={cn("flex items-start gap-1.5 text-[13px]", test.data.ok ? "text-emerald-700" : "text-red-700")}>
          {test.data.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
          {test.data.message}
        </div>
      ) : null}
      <ErrorNote error={test.error} />
      <p className="text-xs text-stone-500">
        {which === "claude"
          ? "Uses your Claude plan's usage limits instead of per-token billing. Model presets below still apply."
          : "Uses your ChatGPT plan's image limits. About 1–2 minutes per image; set Parallel image requests to 1–2 below. Draft/final quality becomes a simpler or more polished drawing."}{" "}
        Personal use only.
      </p>
    </div>
  );
}
