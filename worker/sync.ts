/**
 * Driver outbox → database. Every event is one atomic D1 batch of idempotent statements:
 * INSERT OR IGNORE keyed on the event id, and updates guarded on the current state.
 * Re-sending an event (or the same batch concurrently) leaves the data unchanged.
 */
import type { OutboxEvent } from "../shared/schemas";
import { sameQueueSql, type Db } from "./db";

type Result = { ok: true } | { ok: false; error: string };

/** Truck status follows its latest event by occurred_at, so out-of-order offline events settle correctly. */
const truckStatusSql = `UPDATE trucks SET status = COALESCE((
    SELECT CASE kind WHEN 'down' THEN 'down' ELSE 'up' END FROM truck_status_events
    WHERE truck_id = ?1 ORDER BY occurred_at DESC, id DESC LIMIT 1), status)
  WHERE id = ?1`;

export async function applyEvent(db: Db, villageId: string, ev: OutboxEvent, now: number): Promise<Result> {
  const q = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args);
  const one = <T>(sql: string, ...args: unknown[]) => q(sql, ...args).first<T>();
  const truck = (id: string) => one<{ id: string; kind: "water" | "sewage" }>("SELECT id, kind FROM trucks WHERE id = ? AND village_id = ?", id, villageId);
  const house = (id: string) => one<{ id: string }>("SELECT id FROM houses WHERE id = ? AND village_id = ?", id, villageId);
  const note = (id: string) => one<{ id: string; created_at: number }>("SELECT id, created_at FROM voice_notes WHERE id = ? AND village_id = ?", id, villageId);
  /** An id that already exists in another village: never ack it as applied here. */
  const foreign = async (table: string, id: string) => {
    const r = await one<{ village_id: string }>(`SELECT village_id FROM ${table} WHERE id = ?`, id);
    return !!r && r.village_id !== villageId;
  };

  switch (ev.type) {
    case "stop.delivered":
    case "stop.failed": {
      const p = ev.payload;
      const [h, t] = await Promise.all([house(p.houseId), truck(p.truckId)]);
      if (!h) return { ok: false, error: "unknown house" };
      if (!t) return { ok: false, error: "unknown truck" };
      const existing = await one<{ village_id: string }>("SELECT village_id FROM stops WHERE id = ?", ev.id);
      if (existing) return existing.village_id === villageId ? { ok: true } : { ok: false, error: "id conflict" };
      // Which request this stop is for: the one named (if it's in this village), else the house's open request for this truck kind.
      let requestId: string | null = null;
      if (p.requestId) {
        const r = await one<{ id: string }>("SELECT id FROM requests WHERE id = ? AND village_id = ?", p.requestId, villageId);
        requestId = r?.id ?? null;
      }
      if (!requestId) {
        const r = await one<{ id: string }>(
          `SELECT id FROM requests WHERE house_id = ? AND village_id = ? AND status = 'open' AND ${t.kind === "sewage" ? "kind = 'sewage'" : "kind != 'sewage'"}
           ORDER BY created_at LIMIT 1`,
          p.houseId,
          villageId,
        );
        requestId = r?.id ?? null;
      }
      const delivered = ev.type === "stop.delivered";
      const stmts = [
        q(
          `INSERT OR IGNORE INTO stops (id, village_id, house_id, truck_id, request_id, driver_initials, litres, outcome, reason, voice_note_id, occurred_at, received_at, voided_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          ev.id,
          villageId,
          p.houseId,
          p.truckId,
          requestId,
          p.driverInitials ?? null,
          delivered ? (ev as Extract<OutboxEvent, { type: "stop.delivered" }>).payload.litres : 0,
          delivered ? "delivered" : "failed",
          delivered ? null : (ev as Extract<OutboxEvent, { type: "stop.failed" }>).payload.reason,
          p.voiceNoteId ?? null,
          ev.occurredAt,
          now,
        ),
      ];
      if (delivered && requestId) {
        stmts.push(
          q(
            `UPDATE requests SET status = 'served', closed_at = ?1, updated_at = ?1
             WHERE id = ?2 AND status = 'open'
               AND EXISTS (SELECT 1 FROM stops WHERE id = ?3 AND request_id = ?2 AND outcome = 'delivered' AND voided_at IS NULL)`,
            ev.occurredAt,
            requestId,
            ev.id,
          ),
        );
      }
      await db.batch(stmts);
      return { ok: true };
    }

    case "stop.void": {
      const s = await one<{ id: string; request_id: string | null }>("SELECT id, request_id FROM stops WHERE id = ? AND village_id = ?", ev.payload.stopId, villageId);
      if (!s) return { ok: false, error: "unknown stop" };
      await db.batch([
        q("UPDATE stops SET voided_at = ? WHERE id = ? AND village_id = ? AND voided_at IS NULL", ev.occurredAt, s.id, villageId),
        // Reopen the request it served, unless another live delivery served it or the house has since opened another one in the same queue.
        q(
          `UPDATE requests SET status = 'open', closed_at = NULL, updated_at = ?1
           WHERE id = (SELECT request_id FROM stops WHERE id = ?2) AND status = 'served'
             AND NOT EXISTS (SELECT 1 FROM stops s2 WHERE s2.request_id = requests.id AND s2.outcome = 'delivered' AND s2.voided_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM requests r2 WHERE r2.house_id = requests.house_id AND r2.status = 'open' AND r2.id != requests.id
                             AND ${sameQueueSql("r2.kind", "requests.kind")})`,
          ev.occurredAt,
          s.id,
        ),
      ]);
      return { ok: true };
    }

    case "truck.check": {
      const p = ev.payload;
      if (!(await truck(p.truckId))) return { ok: false, error: "unknown truck" };
      if (await foreign("truck_checks", ev.id)) return { ok: false, error: "id conflict" };
      const failed = Object.entries(p.items).filter(([, ok]) => !ok).map(([k]) => k);
      const stmts = [
        q(
          `INSERT OR IGNORE INTO truck_checks (id, village_id, truck_id, items, passed, voice_note_id, occurred_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ev.id,
          villageId,
          p.truckId,
          JSON.stringify(p.items),
          failed.length ? 0 : 1,
          p.voiceNoteId ?? null,
          ev.occurredAt,
          now,
        ),
      ];
      if (failed.length) {
        stmts.push(
          q(
            `INSERT OR IGNORE INTO truck_status_events (id, village_id, truck_id, kind, reason, voice_note_id, occurred_at, received_at) VALUES (?, ?, ?, 'down', ?, ?, ?, ?)`,
            `${ev.id}:down`,
            villageId,
            p.truckId,
            `check: ${failed.join(", ")}`,
            p.voiceNoteId ?? null,
            ev.occurredAt,
            now,
          ),
          q(truckStatusSql, p.truckId),
        );
      }
      await db.batch(stmts);
      return { ok: true };
    }

    case "truck.down":
    case "truck.back": {
      const p = ev.payload;
      if (!(await truck(p.truckId))) return { ok: false, error: "unknown truck" };
      if (await foreign("truck_status_events", ev.id)) return { ok: false, error: "id conflict" };
      const down = ev.type === "truck.down";
      const dp = down ? (ev as Extract<OutboxEvent, { type: "truck.down" }>).payload : null;
      await db.batch([
        q(
          `INSERT OR IGNORE INTO truck_status_events (id, village_id, truck_id, kind, reason, voice_note_id, occurred_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ev.id,
          villageId,
          p.truckId,
          down ? "down" : "back",
          dp?.reason ?? null,
          dp?.voiceNoteId ?? null,
          ev.occurredAt,
          now,
        ),
        q(truckStatusSql, p.truckId),
      ]);
      return { ok: true };
    }

    case "request.litDoor": {
      const p = ev.payload;
      const [h, t] = await Promise.all([house(p.houseId), truck(p.truckId)]);
      if (!h) return { ok: false, error: "unknown house" };
      if (!t) return { ok: false, error: "unknown truck" };
      if (await foreign("requests", ev.id)) return { ok: false, error: "id conflict" };
      await db.batch([
        q(
          `INSERT OR IGNORE INTO requests (id, village_id, house_id, kind, source, status, created_at, updated_at, closed_at)
           SELECT ?1, ?2, ?3, ?4, 'lit_door', 'open', ?5, ?5, NULL
           WHERE NOT EXISTS (SELECT 1 FROM requests WHERE house_id = ?3 AND status = 'open' AND ${sameQueueSql("kind", "?4")})`,
          ev.id,
          villageId,
          p.houseId,
          p.kind,
          ev.occurredAt,
        ),
      ]);
      return { ok: true };
    }

    case "voice.confirm": {
      const p = ev.payload;
      const n = await note(p.voiceNoteId);
      if (!n) return { ok: false, error: "unknown voice note" };
      if (p.fields.aboutTruckId && !(await truck(p.fields.aboutTruckId))) return { ok: false, error: "unknown truck" };
      if (p.fields.aboutHouseId && !(await house(p.fields.aboutHouseId))) return { ok: false, error: "unknown house" };
      await db.batch([
        q(
          `INSERT OR IGNORE INTO log_entries (id, village_id, voice_note_id, about_truck_id, about_house_id, type, category, severity, summary, source, occurred_at, confirmed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'voice', ?, ?)`,
          n.id,
          villageId,
          n.id,
          p.fields.aboutTruckId,
          p.fields.aboutHouseId,
          p.fields.type,
          p.fields.category,
          p.fields.severity,
          p.fields.summary,
          n.created_at,
          ev.occurredAt,
        ),
        q("UPDATE voice_notes SET status = 'confirmed' WHERE id = ? AND village_id = ? AND status != 'confirmed'", n.id, villageId),
      ]);
      return { ok: true };
    }

    case "voice.needsHuman": {
      const n = await note(ev.payload.voiceNoteId);
      if (!n) return { ok: false, error: "unknown voice note" };
      await db.batch([q("UPDATE voice_notes SET status = 'needs_human' WHERE id = ? AND village_id = ? AND status != 'confirmed'", n.id, villageId)]);
      return { ok: true };
    }
  }
}

export async function applyEvents(db: Db, villageId: string, events: OutboxEvent[], now = Date.now()) {
  const acked: string[] = [];
  const rejected: { id: string; error: string }[] = [];
  for (const ev of events) {
    const r = await applyEvent(db, villageId, ev, now);
    if (r.ok) acked.push(ev.id);
    else rejected.push({ id: ev.id, error: r.error });
  }
  return { acked, rejected };
}
