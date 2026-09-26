import { Check, Pencil, UserRound, HelpCircle, Sparkles, Archive } from "lucide-react";
import { LOG_TYPES, SEVERITIES, TRUCK_CATEGORIES, type LogFields } from "../../../../../shared/types";
import { Button, Chip } from "../../../ui";
import { t } from "../../../i18n";
import s from "../driver.module.css";

export interface VoiceCardVm {
  unsure: boolean;
  fallback: boolean;
  editing: boolean;
  fields: LogFields;
  aboutText: string;
  languageText: string;
  transcript: string;
  audioUrl: string | null;
  trucks: { id: string; label: string }[];
  houses: { id: string; label: string }[];
  resolvedText: string | null;
}

export function VoiceCardView({ vm, onEdit, onField, onConfirm, onNeedsHuman }: {
  vm: VoiceCardVm;
  onEdit: (on: boolean) => void;
  onField: (patch: Partial<LogFields>) => void;
  onConfirm: () => void;
  onNeedsHuman: () => void;
}) {
  const f = vm.fields;
  const none = t("driver.card.none");
  return (
    <article className={s.stack} aria-labelledby="card-h">
      <h1 id="card-h" className={`${s.h1} ${s.kind}`} tabIndex={-1}>
        {vm.unsure ? <HelpCircle aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
        {vm.unsure ? t("driver.card.unsure") : t("driver.card.title")}
      </h1>
      {vm.fallback && <span className={s.marker}><Archive aria-hidden="true" size="1em" /> {t("driver.card.fallback")}</span>}

      <details open={vm.unsure}>
        <summary className={s.linkBtn}>{t("driver.card.transcript")}</summary>
        <p>{vm.transcript || t("driver.card.noTranscript")}</p>
      </details>
      {vm.audioUrl && (
        <label className={s.stack}>
          <span className={s.fieldLabel}>{t("driver.card.audio")}</span>
          <audio controls src={vm.audioUrl} preload="metadata" />
        </label>
      )}

      {!vm.editing ? (
        <dl className={s.stack} style={{ margin: 0 }}>
          <div className={s.field}><dt className={s.fieldLabel}>{t("driver.card.about")}</dt><dd className={s.fieldValue} style={{ margin: 0 }}>{vm.aboutText}</dd></div>
          <div className={s.field}><dt className={s.fieldLabel}>{t("driver.card.type")}</dt><dd className={s.fieldValue} style={{ margin: 0 }}>{t(`common.logType.${f.type}`)}</dd></div>
          {f.type === "truck_problem" && (
            <div className={s.field}><dt className={s.fieldLabel}>{t("driver.card.category")}</dt><dd className={s.fieldValue} style={{ margin: 0 }}>{f.category ? t(`common.category.${f.category}`) : none}</dd></div>
          )}
          <div className={s.field}><dt className={s.fieldLabel}>{t("driver.card.severity")}</dt><dd className={s.fieldValue} style={{ margin: 0 }}>{f.severity ? t(`common.severity.${f.severity}`) : none}</dd></div>
          <div className={s.field}><dt className={s.fieldLabel}>{t("driver.card.summary")}</dt><dd className={s.fieldValue} style={{ margin: 0 }}>{f.summary || none}</dd></div>
          <div className={s.field}><dt className={s.fieldLabel}>{t("driver.card.language")}</dt><dd className={s.fieldValue} style={{ margin: 0 }}>{vm.languageText}</dd></div>
        </dl>
      ) : (
        <div className={s.stack}>
          <fieldset className={s.field}>
            <legend className={s.fieldLabel}>{t("driver.card.about")}</legend>
            <div className={s.chips}>
              <Chip selected={!f.aboutTruckId && !f.aboutHouseId} onClick={() => onField({ aboutTruckId: null, aboutHouseId: null })}>{t("driver.card.nothing")}</Chip>
            </div>
            <span className={s.fieldLabel}>{t("driver.card.trucks")}</span>
            <div className={s.chips}>
              {vm.trucks.map((tr) => (
                <Chip key={tr.id} selected={f.aboutTruckId === tr.id} onClick={() => onField({ aboutTruckId: tr.id, aboutHouseId: null })}>{tr.label}</Chip>
              ))}
            </div>
            <span className={s.fieldLabel}>{t("driver.card.houses")}</span>
            <div className={s.chips}>
              {vm.houses.map((h) => (
                <Chip key={h.id} selected={f.aboutHouseId === h.id} onClick={() => onField({ aboutHouseId: h.id, aboutTruckId: null })}>{h.label}</Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className={s.field}>
            <legend className={s.fieldLabel}>{t("driver.card.type")}</legend>
            <div className={s.chips}>
              {LOG_TYPES.map((x) => (
                <Chip key={x} selected={f.type === x} onClick={() => onField({ type: x, category: x === "truck_problem" ? f.category : null })}>{t(`common.logType.${x}`)}</Chip>
              ))}
            </div>
          </fieldset>
          {f.type === "truck_problem" && (
            <fieldset className={s.field}>
              <legend className={s.fieldLabel}>{t("driver.card.category")}</legend>
              <div className={s.chips}>
                {TRUCK_CATEGORIES.map((x) => (
                  <Chip key={x} selected={f.category === x} onClick={() => onField({ category: x })}>{t(`common.category.${x}`)}</Chip>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className={s.field}>
            <legend className={s.fieldLabel}>{t("driver.card.severity")}</legend>
            <div className={s.chips}>
              {SEVERITIES.map((x) => (
                <Chip key={x} selected={f.severity === x} onClick={() => onField({ severity: x })}>{t(`common.severity.${x}`)}</Chip>
              ))}
            </div>
          </fieldset>
          <label className={s.field}>
            <span className={s.fieldLabel}>{t("driver.card.summary")}</span>
            <input className={s.input} value={f.summary} maxLength={200} onChange={(e) => onField({ summary: e.target.value })} />
          </label>
        </div>
      )}

      {vm.resolvedText ? (
        <p role="status" className={`${s.kind} ${s.h2}`}><Check aria-hidden="true" /> {vm.resolvedText}</p>
      ) : (
        <div className={s.stack}>
          <Button size="hero" block icon={<Check />} onClick={onConfirm}>{t("driver.card.confirm")}</Button>
          <Button size="driver" variant="secondary" block icon={<Pencil />} onClick={() => onEdit(!vm.editing)}>
            {vm.editing ? t("driver.card.doneEditing") : t("driver.card.edit")}
          </Button>
          <Button size="driver" variant="secondary" block icon={<UserRound />} onClick={onNeedsHuman}>{t("driver.card.needsHuman")}</Button>
        </div>
      )}
    </article>
  );
}
