/** Provisional wordmark: a water drop with a wave, then "Imaq". No syllabics until the community confirms the name. */
export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const w = size === "sm" ? 28 : 36;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
      <svg width={w} height={(w * 40) / 36} viewBox="0 0 36 40" aria-hidden="true" style={{ flex: "none" }}>
        <path d="M18 2C12 10 5 18 5 25a13 13 0 0 0 26 0C31 18 24 10 18 2Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M7 25c5-5 9 5 14 0s7-2 9 0" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      <strong style={{ fontSize: size === "sm" ? "1.5rem" : "1.75rem", letterSpacing: "-0.07em", fontWeight: 730 }}>Imaq</strong>
    </span>
  );
}
