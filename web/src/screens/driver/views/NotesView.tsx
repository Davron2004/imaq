import { FileAudio } from "lucide-react";
import { Link } from "react-router";
import { t } from "../../../i18n";
import s from "../driver.module.css";

export interface NoteItemVm {
  id: string;
  title: string;
  stateText: string;
  openable: boolean;
  href: string;
}

/** A list of voice notes with their state chip. Used by the inbox and under the free recorder. */
export function NotesView({ title, items, emptyText }: { title: string; items: NoteItemVm[]; emptyText: string }) {
  return (
    <section className={s.stack} aria-labelledby="notes-h">
      <h2 id="notes-h" className={s.h2}>{title}</h2>
      {items.length === 0 && <p>{emptyText}</p>}
      <ul className={s.list}>
        {items.map((n) => (
          <li key={n.id} className={s.noteRow}>
            <span className={s.kind}><FileAudio aria-hidden="true" /> {n.title}</span>
            <span className={s.marker} data-testid="note-state">{n.stateText}</span>
            {n.openable && <Link className={s.linkBtn} to={n.href}>{t("driver.voice.open")}</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
