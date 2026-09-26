import { en } from "./en";

export type StringKey = keyof typeof en;
type Vars = Record<string, string | number>;

const plural = new Intl.PluralRules("en");

/**
 * Look up an interface string. `{name}` placeholders are filled from `vars`.
 * Keys ending in `_one` / `_other` are picked with `vars.count`: t("x", {count: 2}) reads "x_other".
 */
export function t(key: string, vars?: Vars): string {
  let template: string | undefined;
  if (vars && typeof vars.count === "number") {
    template = (en as Record<string, string>)[`${key}_${plural.select(vars.count)}`];
  }
  template ??= (en as Record<string, string>)[key];
  if (template === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return vars ? template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : template;
}

const timeFmt = new Intl.DateTimeFormat("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Toronto" });
const dayFmt = new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "America/Toronto" });
const dateFmt = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" });

/** Clock time in village time, e.g. "14:20". */
export const formatTime = (ms: number) => timeFmt.format(ms);
/** "Tuesday" */
export const formatDay = (ms: number) => dayFmt.format(ms);
/** "Tue, Sep 22" */
export const formatDate = (ms: number) => dateFmt.format(ms);

/** How long something has waited, e.g. "5 min", "3 h", "2 days". */
export function formatAge(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return t("time.minutes", { count: min });
  const h = Math.floor(min / 60);
  if (h < 48) return t("time.hours", { count: h });
  return t("time.days", { count: Math.floor(h / 24) });
}
