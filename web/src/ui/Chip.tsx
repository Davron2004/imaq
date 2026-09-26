import type { ReactNode } from "react";
import s from "./Chip.module.css";

/** A selectable chip (reason, category, and so on). Selection shows a check mark, not only colour. */
export function Chip({ selected, onClick, icon, children }: { selected?: boolean; onClick?: () => void; icon?: ReactNode; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={!!selected} className={`${s.chip} ${selected ? s.on : ""}`} onClick={onClick}>
      {(selected || icon) && <span aria-hidden="true" className={s.mark}>{selected ? "✓" : icon}</span>}
      <span>{children}</span>
    </button>
  );
}
