"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Lock, XCircle } from "lucide-react";
import { api } from "@/lib/client";
import { ALL_SETTINGS, API_KEYS, DRY_RUN, MODEL_SETTINGS, UI_LANGUAGE, type PublicSetting, type SettingDef, type SettingKey } from "@/lib/settings-defs";
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
import { useT, type T, type TKey } from "@/lib/i18n";

type TestResult = { ok: boolean; message: string };

// Labels from settings-defs.ts / claude-models.ts, translated with an English fallback.
// Option values can contain "." (e.g. "gpt-image-1.5"), which would split the key path.
const optKey = (value: string) => value.replace(/\./g, "_");
const defLabel = (t: T, def: SettingDef) => t.dyn(`settings.defs.${def.key}.label`, def.label);
const defHelp = (t: T, def: SettingDef) => t.dyn(`settings.defs.${def.key}.help`, def.help);
const optLabel = (t: T, key: SettingKey, o: { value: string; label: string }) => t.dyn(`settings.defs.${key}.options.${optKey(o.value)}`, o.label);

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
      qc.invalidateQueries({ queryKey: ["project"] }); // voice connection changes the Voice step
    },
  });
}

export default function SettingsPage() {
  const t = useT();
  const { data } = useSettings();
  const byKey = new Map(data?.settings.map((s) => [s.key, s]));
  const localTts = byKey.get("TTS_BACKEND")?.value === "local";
  // ElevenLabs-only options don't apply while narration comes from the local server.
  const modelSettings = MODEL_SETTINGS.filter((d) => !(localTts && d.key.startsWith("ELEVENLABS_")));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
      <p className="mt-1 text-sm text-stone-600">
        {t("settings.introBefore")} <code className="rounded bg-stone-200/70 px-1 text-[13px]">.env.local</code> {t("settings.introAfter")}
      </p>

      {!data ? (
        <Spinner className="mt-6" />
      ) : (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="mb-2 font-semibold">{t("settings.sections.appLanguage")}</h2>
            <AppLanguageRow setting={byKey.get(UI_LANGUAGE.key)!} />
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <KeyRound className="size-4 text-stone-500" /> {t("settings.sections.apiKeys")}
            </h2>
            <div className="space-y-3">
              {API_KEYS.map((def) => (
                <KeyRow key={def.key} def={def} setting={byKey.get(def.key)!} backend={BACKEND_FOR[def.key] ? { ...BACKEND_FOR[def.key]!, setting: byKey.get(BACKEND_FOR[def.key]!.key)! } : undefined} />
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-500">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {t("settings.keysStoredBefore")} <code>data/app.db</code>
                {t("settings.keysStoredAfter")}
              </span>
            </p>
          </section>

          <section id="claude" className="scroll-mt-20">
            <h2 className="mb-2 font-semibold">{t("settings.sections.claudeModels")}</h2>
            <ClaudeModelsCard byKey={byKey} />
          </section>

          <section>
            <h2 className="mb-2 font-semibold">{t("settings.sections.voiceImages")}</h2>
            <Card className="divide-y divide-stone-200">
              {modelSettings.map((def) => (
                <SelectRow key={def.key} def={def} setting={byKey.get(def.key)!} />
              ))}
            </Card>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">{t("settings.sections.testing")}</h2>
            <DryRunRow setting={byKey.get(DRY_RUN.key)!} />
          </section>
        </div>
      )}
    </main>
  );
}

function SourceBadge({ s }: { s: PublicSetting }) {
  const t = useT();
  if (!s.isSet) return <Badge tone="red">{t("settings.source.notSet")}</Badge>;
  if (s.source === "saved") return <Badge tone="green">{t("settings.source.saved")}</Badge>;
  if (s.source === "env") return <Badge tone="blue">{t("settings.source.env")}</Badge>;
  return <Badge>{t("settings.source.default")}</Badge>;
}

/** Which subscription CLI does the work: Claude Code for text, Codex for text or images. */
type CliUse = "claude" | "codex-text" | "codex-image" | "local-tts";
type CliOption = { value: string; use: CliUse; label: string };

/** Keys that can be replaced by a subscription CLI. */
const BACKEND_FOR: Partial<Record<SettingKey, { key: SettingKey; clis: CliOption[] }>> = {
  ANTHROPIC_API_KEY: {
    key: "CLAUDE_BACKEND",
    clis: [
      { value: "cli", use: "claude", label: "Claude Code (my plan)" },
      { value: "codex", use: "codex-text", label: "Codex (my ChatGPT plan)" },
    ],
  },
  ELEVENLABS_API_KEY: { key: "TTS_BACKEND", clis: [{ value: "local", use: "local-tts", label: "Local TTS (VieNeu)" }] },
  OPENAI_API_KEY: { key: "IMAGE_BACKEND", clis: [{ value: "codex", use: "codex-image", label: "Codex (my ChatGPT plan)" }] },
};

type Backend = { key: SettingKey; clis: CliOption[]; setting: PublicSetting };

function KeyRow({ def, setting, backend }: { def: SettingDef; setting: PublicSetting; backend?: Backend }) {
  const t = useT();
  const label = defLabel(t, def);
  const save = useSave();
  const activeCli = backend?.clis.find((c) => c.value === backend.setting?.value);
  const useCli = Boolean(activeCli);
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
            <span className="font-medium">{label}</span>
            {useCli ? null : <SourceBadge s={setting} />}
          </div>
          <p className="mt-0.5 text-[13px] text-stone-600">{defHelp(t, def)}</p>
        </div>
        {def.link && !useCli ? (
          <a href={def.link.href} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline">
            {def.link.label === "Get a key" ? t("settings.key.getKey") : def.link.label} <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>

      {backend ? (
        <div role="radiogroup" aria-label={t("settings.key.connection", { label })} className="mt-3 inline-flex flex-wrap rounded-lg bg-stone-200/70 p-1">
          {[{ v: "api", label: "API key" }, ...backend.clis.map((c) => ({ v: c.value, label: c.label }))].map((o) => (
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
              {optLabel(t, backend.key, { value: o.v, label: o.label })}
            </button>
          ))}
        </div>
      ) : null}

      {activeCli?.use === "local-tts" ? (
        <LocalTtsPanel />
      ) : activeCli ? (
        <CliPanel use={activeCli.use} />
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
              placeholder={t("settings.key.placeholder")}
              autoComplete="off"
              spellCheck={false}
              aria-label={t("settings.key.ariaLabel", { label })}
              className="pr-10 font-mono text-[13px]"
              autoFocus={setting.isSet}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? t("settings.key.hide") : t("settings.key.show")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-700"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button type="submit" variant="primary" disabled={!draft.trim()} loading={save.isPending || test.isPending}>
            {t("settings.key.saveTest")}
          </Button>
          {setting.isSet ? (
            <Button type="button" variant="ghost" onClick={() => (setEditing(false), setDraft(""))}>
              {t("common.cancel")}
            </Button>
          ) : null}
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-stone-100 px-2.5 py-1.5 font-mono text-[13px] text-stone-700">{setting.value}</code>
          <Button size="sm" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
            {t("common.test")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t("settings.key.replace")}
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
              title={t("settings.key.removeTitle")}
            >
              {t("settings.key.remove")}
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
  const t = useT();
  const save = useSave();
  const known = def.options?.some((o) => o.value === setting.value);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <div className="min-w-[200px] flex-1">
        <label htmlFor={def.key} className="text-sm font-medium">
          {defLabel(t, def)}
        </label>
        <p className="text-[13px] text-stone-600">{defHelp(t, def)}</p>
      </div>
      <div className="flex items-center gap-2">
        {save.isSuccess && !save.isPending ? <CheckCircle2 className="size-4 text-emerald-600" aria-label={t("common.saved")} /> : null}
        <Select
          id={def.key}
          className="w-72"
          value={setting.value}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ [def.key]: e.target.value === def.default ? null : e.target.value })}
        >
          {!known ? <option value={setting.value}>{t("settings.fromEnv", { value: setting.value })}</option> : null}
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {optLabel(t, def.key, o)}
              {o.value === def.default ? ` (${t("common.default")})` : ""}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/** English / Tiếng Việt for the app's own UI. Reloads the page data so every label switches at once. */
function AppLanguageRow({ setting }: { setting: PublicSetting }) {
  const t = useT();
  const save = useSave();
  const router = useRouter();
  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <div className="min-w-[200px] flex-1">
        <label htmlFor={UI_LANGUAGE.key} className="text-sm font-medium">
          {defLabel(t, UI_LANGUAGE)}
        </label>
        <p className="text-[13px] text-stone-600">{defHelp(t, UI_LANGUAGE)}</p>
      </div>
      <Select
        id={UI_LANGUAGE.key}
        className="w-48"
        value={setting.value}
        disabled={save.isPending}
        onChange={async (e) => {
          await save.mutateAsync({ [UI_LANGUAGE.key]: e.target.value === UI_LANGUAGE.default ? null : e.target.value });
          router.refresh();
        }}
      >
        {UI_LANGUAGE.options!.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <ErrorNote error={save.error} />
    </Card>
  );
}

function DryRunRow({ setting }: { setting: PublicSetting }) {
  const t = useT();
  const save = useSave();
  const on = setting.value === "1" || setting.value.toLowerCase() === "true";
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{defLabel(t, DRY_RUN)}</div>
        <p className="text-[13px] text-stone-600">{defHelp(t, DRY_RUN)}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={defLabel(t, DRY_RUN)}
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
  const t = useT();
  const save = useSave();
  const preset = (byKey.get("CLAUDE_PRESET")?.value ?? "balanced") as ClaudePreset;
  const custom = Object.fromEntries(CLAUDE_STEPS.map((s) => [s.key, byKey.get(customKey(s.key))?.value ?? ""])) as Record<ClaudeStep, string>;
  const modelsFor = (p: ClaudePreset) =>
    Object.fromEntries(CLAUDE_STEPS.map((s) => [s.key, resolveModel(s.key, p, custom)])) as Record<ClaudeStep, string>;
  const current = modelsFor(preset);
  const stepName = (s: (typeof CLAUDE_STEPS)[number]) => t.dyn(`settings.claudeSteps.${s.key}.label`, s.label);

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
    ...(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => ({
      key: k,
      label: t.dyn(`settings.presets.${k}.label`, PRESETS[k].label),
      blurb: t.dyn(`settings.presets.${k}.blurb`, PRESETS[k].blurb),
    })),
    { key: "custom", label: t("settings.claude.custom"), blurb: t("settings.claude.customBlurb") },
  ];

  return (
    <Card className="p-4">
      {byKey.get("CLAUDE_BACKEND")?.value === "codex" ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 ring-1 ring-amber-200">
          {t("settings.claude.codexNote")}
        </p>
      ) : null}
      <p className="mb-3 text-[13px] text-stone-600">
        {t("settings.claude.introBefore")} <b>{t("settings.claude.spent")}</b> {t("settings.claude.introAfter")}
      </p>
      <div role="radiogroup" aria-label={t("settings.claude.presetGroup")} className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const cost = estimateVideoCost(modelsFor(o.key));
          const active = preset === o.key;
          return (
            <button
              key={o.key}
              role="radio"
              aria-checked={active}
              aria-label={t("settings.claude.presetAria", { label: o.label, cost: cost.toFixed(2) })}
              disabled={save.isPending}
              onClick={() => pick(o.key)}
              className={cn(
                "rounded-lg p-3 text-left ring-1 ring-stone-200 transition-shadow hover:shadow-sm disabled:opacity-60",
                active && "ring-2 ring-brand",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{o.label}</span>
                {o.key === "balanced" ? <Badge tone="brand">{t("settings.claude.recommended")}</Badge> : null}
                <span className="ml-auto text-sm tabular-nums text-stone-700">{t("settings.claude.perVideo", { cost: cost.toFixed(2) })}</span>
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
                  {stepName(s)}
                </label>
                <div className="text-xs text-stone-500">{t.dyn(`settings.claudeSteps.${s.key}.help`, s.help)}</div>
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
              {stepName(s)}: <span className="font-medium text-stone-700">{modelLabel(current[s.key])}</span>
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

const CLI_INFO: Record<Exclude<CliUse, "local-tts">, { which: "claude" | "codex"; test: string; testLabel: TKey; confirm?: TKey; note: TKey }> = {
  claude: {
    which: "claude",
    test: "CLAUDE_CLI",
    testLabel: "settings.cli.testMessage",
    note: "settings.cli.noteClaude",
  },
  "codex-text": {
    which: "codex",
    test: "CODEX_TEXT",
    testLabel: "settings.cli.testMessage",
    note: "settings.cli.noteCodexText",
  },
  "codex-image": {
    which: "codex",
    test: "CODEX_IMAGE",
    testLabel: "settings.cli.testImage",
    confirm: "settings.cli.imageConfirm",
    note: "settings.cli.noteCodexImage",
  },
};

/** Status + test for a subscription CLI (Claude Code or Codex). */
function CliPanel({ use }: { use: Exclude<CliUse, "local-tts"> }) {
  const t = useT();
  const info = CLI_INFO[use];
  const { which } = info;
  const status = useQuery({
    queryKey: ["cli-status"],
    queryFn: () => api<{ claude: CliStatus; codex: CliStatus }>("/api/settings/cli"),
    staleTime: 30_000,
  });
  const test = useMutation({
    mutationFn: () => api<TestResult>("/api/settings/test", { json: { provider: info.test } }),
  });
  const s = status.data?.[which];
  const name = which === "claude" ? "Claude Code" : "Codex";

  return (
    <div className="mt-3 space-y-2">
      {status.isLoading ? (
        <div className="flex items-center gap-2 text-[13px] text-stone-600">
          <Spinner /> {t("settings.cli.checking", { name })}
        </div>
      ) : s ? (
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-[13px] ring-1 ring-stone-200">
          <div className="flex flex-wrap items-center gap-2">
            {s.found && s.loggedIn !== false ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}
            <span className="font-medium">{s.found ? `${name} ${s.version ?? ""}` : t("settings.cli.notFound", { name })}</span>
            {s.loggedIn ? (
              <Badge tone="green">{t("settings.cli.loggedIn")}</Badge>
            ) : s.loggedIn === false ? (
              <Badge tone="red">{t("settings.cli.notLoggedIn")}</Badge>
            ) : null}
          </div>
          {s.path ? <div className="mt-0.5 font-mono text-[11px] text-stone-500">{s.path}</div> : null}
          {s.detail ? <div className="mt-0.5 text-stone-600">{s.detail}</div> : null}
        </div>
      ) : null}
      <CliTextSetting settingKey={which === "claude" ? "CLAUDE_CLI_PATH" : "CODEX_CLI_PATH"} label={t("settings.cli.path")} placeholder={t("settings.cli.autoDetect")} onSaved={() => status.refetch()} />
      {use === "codex-text" ? <CliTextSetting settingKey="CODEX_TEXT_MODEL" label={t("settings.cli.model")} placeholder={t("settings.cli.codexDefault")} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={test.isPending}
          disabled={!s?.found}
          onClick={() => {
            if (info.confirm && !confirm(t(info.confirm))) return;
            test.mutate();
          }}
        >
          {t(info.testLabel)}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => status.refetch()} loading={status.isFetching && !status.isLoading}>
          {t("settings.cli.recheck")}
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
        {t(info.note)} {t("settings.cli.personalUse")}
      </p>
    </div>
  );
}

const LOCAL_SAMPLE_RATE = ALL_SETTINGS.find((d) => d.key === "LOCAL_TTS_SAMPLE_RATE")!;

/** Address, optional key and audio quality of the local speech server, plus a Test button. */
function LocalTtsPanel() {
  const t = useT();
  const { data } = useSettings();
  const save = useSave();
  const test = useMutation({
    mutationFn: () => api<TestResult>("/api/settings/test", { json: { provider: "LOCAL_TTS" } }),
  });
  const rate = data?.settings.find((x) => x.key === "LOCAL_TTS_SAMPLE_RATE");
  return (
    <div className="mt-3 space-y-2">
      <CliTextSetting settingKey="LOCAL_TTS_URL" label={t("settings.localTts.server")} placeholder="http://127.0.0.1:8000/v1" onSaved={() => test.mutate()} />
      <CliTextSetting settingKey="LOCAL_TTS_API_KEY" label={t("settings.localTts.key")} placeholder={t("settings.localTts.keyNone")} secret />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="LOCAL_TTS_SAMPLE_RATE" className="w-20 text-[13px] text-stone-600">
          {t("settings.localTts.quality")}
        </label>
        <Select
          id="LOCAL_TTS_SAMPLE_RATE"
          className="h-8 w-48 text-[13px]"
          value={rate?.value ?? LOCAL_SAMPLE_RATE.default}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ LOCAL_TTS_SAMPLE_RATE: e.target.value === LOCAL_SAMPLE_RATE.default ? null : e.target.value })}
        >
          {LOCAL_SAMPLE_RATE.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {optLabel(t, LOCAL_SAMPLE_RATE.key, o)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
          {t("common.test")}
        </Button>
      </div>
      {test.data ? (
        <div className={cn("flex items-start gap-1.5 text-[13px]", test.data.ok ? "text-emerald-700" : "text-red-700")}>
          {test.data.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
          {test.data.message}
        </div>
      ) : null}
      <ErrorNote error={test.error ?? save.error} />
      <p className="text-xs text-stone-500">
        {t("settings.localTts.noteBefore")} <code>uv run python -m apps.openai_speech</code> {t("settings.localTts.noteAfter")}
      </p>
    </div>
  );
}

/** Small inline text setting (CLI path, Codex model); empty means auto-detect / default. */
function CliTextSetting({
  settingKey,
  label,
  placeholder,
  onSaved,
  secret,
}: {
  settingKey: SettingKey;
  label: string;
  placeholder: string;
  onSaved?: () => void;
  /** Secrets come back masked: start empty and show the mask as the placeholder. */
  secret?: boolean;
}) {
  const t = useT();
  const { data } = useSettings();
  const save = useSave();
  const stored = data?.settings.find((x) => x.key === settingKey)?.value ?? "";
  const value = secret ? "" : stored;
  if (secret && stored) placeholder = stored;
  const [draft, setDraft] = useState<string | null>(null);
  const dirty = draft !== null && draft.trim() !== value;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await save.mutateAsync({ [settingKey]: draft?.trim() || null });
        setDraft(null);
        onSaved?.();
      }}
    >
      <label htmlFor={settingKey} className="w-20 text-[13px] text-stone-600">
        {label}
      </label>
      <Input
        id={settingKey}
        type={secret ? "password" : undefined}
        autoComplete={secret ? "off" : undefined}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-8 min-w-[200px] flex-1 font-mono text-[12px]"
      />
      {dirty ? (
        <Button type="submit" size="sm" variant="secondary" loading={save.isPending}>
          {t("common.save")}
        </Button>
      ) : null}
      <ErrorNote error={save.error} />
    </form>
  );
}
