// App UI language (Settings → App language). Shared by the server (root layout) and the browser.
// The language of a channel's videos is separate: see src/lib/languages.ts.

export const UI_LOCALES = ["en", "vi"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export function toUiLocale(v: string | null | undefined): UiLocale {
  return v === "vi" ? "vi" : "en";
}

/** A nested message tree: every leaf is a string. */
export type Messages = { [key: string]: string | Messages };

/** Same keys as `T`, every leaf a string: the Vietnamese file must cover every English key. */
export type Translation<T> = { [K in keyof T]: T[K] extends string ? string : Translation<T[K]> };

/** "a.b.c" paths to every leaf string of `T`. */
export type MessageKey<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${MessageKey<T[K]>}`;
}[keyof T & string];

export type Vars = Record<string, string | number>;

export function lookup(tree: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Replace `{name}` with vars.name. Numbers use the locale's digit grouping. */
export function format(text: string, vars: Vars | undefined, locale: UiLocale): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = vars[k];
    if (v === undefined) return m;
    return typeof v === "number" ? v.toLocaleString(locale) : v;
  });
}
