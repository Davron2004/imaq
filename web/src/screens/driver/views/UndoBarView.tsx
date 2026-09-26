import { t } from "../../../i18n";
import s from "../driver.module.css";

export function UndoBarView({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <div className={s.undo} role="status">
      <span>{text}</span>
      <button type="button" onClick={onUndo}>{t("driver.undo.undo")}</button>
    </div>
  );
}
