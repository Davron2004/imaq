import s from "./Stat.module.css";

/** A big number with a label under it. */
export function Stat({ value, label, size = "md" }: { value: string | number; label: string; size?: "md" | "lg" }) {
  return (
    <div className={`${s.stat} ${s[size]}`}>
      <span className={s.value}>{value}</span>
      <span className={s.label}>{label}</span>
    </div>
  );
}
