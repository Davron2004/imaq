import type { ReactNode } from "react";
import s from "./StatusBadge.module.css";

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "emergency";

/** Status is never colour alone: always an icon and a word. */
export function StatusBadge({ tone = "neutral", icon, children }: { tone?: Tone; icon: ReactNode; children: ReactNode }) {
  return (
    <span className={`${s.badge} ${s[tone]}`}>
      <span className={s.icon} aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </span>
  );
}
