"use client";

import { createContext, useContext, useMemo } from "react";
import { format, lookup, type MessageKey, type UiLocale, type Vars } from "./core";
import { DICTS, type Dict } from "./dict";

export type { UiLocale } from "./core";
export type TKey = MessageKey<Dict>;

const LocaleContext = createContext<UiLocale>("en");

/** Set once in the root layout from Settings → App language. */
export function I18nProvider({ locale, children }: { locale: UiLocale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): UiLocale {
  return useContext(LocaleContext);
}

export type T = {
  /** `t("voice.title")`, `t("voice.needs", { count: 3 })`: `{name}` placeholders are filled from vars. */
  (key: TKey, vars?: Vars): string;
  /**
   * For keys built at runtime (e.g. `common.steps.${step.key}`): falls back to `fallback` when the
   * key doesn't exist, so a new step or setting still shows its English label.
   */
  dyn: (key: string, fallback: string, vars?: Vars) => string;
  locale: UiLocale;
};

export function makeT(locale: UiLocale): T {
  const dict = DICTS[locale];
  const t = ((key: TKey, vars?: Vars) => format(lookup(dict, key) ?? lookup(DICTS.en, key) ?? key, vars, locale)) as T;
  t.dyn = (key, fallback, vars) => format(lookup(dict, key) ?? lookup(DICTS.en, key) ?? fallback, vars, locale);
  t.locale = locale;
  return t;
}

export function useT(): T {
  const locale = useLocale();
  return useMemo(() => makeT(locale), [locale]);
}

/** Translated label of a pipeline step (STEPS / AD_STEPS in src/lib/types.ts). */
export function stepLabel(t: T, step: { key: string; label: string }): string {
  return t.dyn(`common.steps.${step.label === "Brief & Script" ? "adScript" : step.key}`, step.label);
}

/** Translated label of an Autopilot step (AUTO_STEP_LABELS in src/lib/channel.ts). */
export function autoStepLabel(t: T, key: string, fallback: string): string {
  return t.dyn(`common.autoSteps.${key}`, fallback);
}
