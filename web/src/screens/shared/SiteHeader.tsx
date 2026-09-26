/**
 * Header for the desktop surfaces (hub, office, simulation, QR, stage): wordmark, a small
 * "Community water · Fictional demo village" label, and the role navigation.
 */
import { Link, NavLink } from "react-router";
import { t } from "../../i18n";
import { Logo } from "../../ui";
import { currentVillageId } from "../../data/village";
import s from "./SiteHeader.module.css";

export function SiteHeader() {
  const v = currentVillageId();
  const items: [string, string][] = [
    ["/", t("header.overview")],
    ["/resident", t("header.resident")],
    [`/v/${v}/driver`, t("header.driver")],
    [`/v/${v}/office`, t("header.office")],
    ["/sim", t("header.simulation")],
    [`/v/${v}/stage`, t("header.stage")],
  ];
  return (
    <header className={s.header}>
      <div className={s.left}>
        <Link to="/" className={s.brand} aria-label={t("header.home")}>
          <Logo />
        </Link>
        <div className={s.label}>
          <span>{t("header.kicker")}</span>
          <small>{t("header.demo")}</small>
        </div>
      </div>
      <nav aria-label={t("header.navLabel")} className={s.nav}>
        {items.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? `${s.link} ${s.active}` : s.link)}>
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

/** Compact header for the phone apps (resident, driver): wordmark plus the role, linking back to the overview. */
export function PhoneHeader({ role }: { role: string }) {
  return (
    <div className={s.phoneTop}>
      <Link to="/" className={s.brand} aria-label={t("header.home")}>
        <Logo size="sm" />
      </Link>
      <Link to="/" className={s.role}>
        {role}
      </Link>
    </div>
  );
}
