import type { HTMLAttributes } from "react";
import s from "./Card.module.css";

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={`${s.card} ${className ?? ""}`} {...rest} />;
}
