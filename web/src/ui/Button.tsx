import type { ButtonHTMLAttributes, ReactNode } from "react";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "driver" | "hero";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon shown before the label. Every button has a visible text label too. */
  icon?: ReactNode;
  block?: boolean;
}

export function Button({ variant = "primary", size = "md", icon, block, className, children, ...rest }: ButtonProps) {
  const cls = [s.btn, s[variant], s[size], block ? s.block : "", className ?? ""].join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      {icon && <span className={s.icon} aria-hidden="true">{icon}</span>}
      <span className={s.label}>{children}</span>
    </button>
  );
}
