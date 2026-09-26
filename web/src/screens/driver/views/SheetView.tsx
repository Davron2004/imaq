import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { t } from "../../../i18n";
import s from "../driver.module.css";

/**
 * Bottom sheet on a native modal <dialog>: focus is trapped while open, Escape cancels,
 * and focus returns to whatever opened it when it closes.
 */
export function SheetView({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      d.querySelector<HTMLElement>("h2")?.focus();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
      opener.current = null;
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div className={s.sheetBody}>
          <div className={s.sheetHead}>
            <h2 id="sheet-title" className={s.h1} tabIndex={-1}>{title}</h2>
            <button type="button" className={s.linkBtn} onClick={onClose}>
              <X aria-hidden="true" /> {t("driver.close")}
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
