import { Hono, type Context } from "hono";
import type { z } from "zod";
import { OfficeLogZ, OfficeRequestZ, ResidentRequestZ, SyncRequestZ } from "../shared/schemas";
import { formatLocal, weekly, type StatusEventLite } from "../shared/rules";
import type { DeliveryRow, RequestKind, VoiceContext } from "../shared/types";
import type { SyncResponse } from "../shared/schemas";
import { buildResidentView, buildSnapshot, getVillage, houseByToken, toVoiceNote, upsertRequest, VOICE_SELECT, type Db } from "./db";
import { applyEvents } from "./sync";
import { deleteOldSandboxes, randomToken, resetVillage, seedVillage } from "./seed";
import { processVoiceNote } from "./ai/process";

export type AppEnv = { Bindings: Env & { PRESENTER_KEY?: string } };
type C = Context<AppEnv>;

const app = new Hono<AppEnv>().basePath("/api");
const DAY = 86_400_000;
const MAX_AUDIO_BYTES = 1_900_000;
const VOICE_CONTEXTS: VoiceContext[] = ["free", "stop", "check", "down"];

const presenterId = (c: C) => c.env.PRESENTER_VILLAGE_ID || "demo";
const err = (c: C, status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500, error: string) => c.json({ error }, status);

async function parse<T extends z.ZodType>(c: C, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, res: err(c, 400, "invalid JSON body") };
  }
  const r = schema.safeParse(body);
  if (!r.success) return { ok: false, res: err(c, 400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")) };
  return { ok: true, data: r.data };
}

/** Seed the presenter village on first use. Concurrent first requests: one batch wins, the other fails on the village PK and is ignored. */
async function ensurePresenter(db: Db, id: string) {
  if (await getVillage(db, id)) return;
  try {
    await seedVillage(db, id, { name: "Demo village", isSandbox: false, now: Date.now() });
  } catch (e) {
    if (!(await getVillage(db, id))) throw e;
  }
}

app.use("/v/:villageId/*", async (c, next) => {
  if (c.req.param("villageId") === presenterId(c)) await ensurePresenter(c.env.DB, presenterId(c));
  await next();
});
app.use("/h/:token/*", async (c, next) => {
  if (c.req.param("token").startsWith(`${presenterId(c)}-h`)) await ensurePresenter(c.env.DB, presenterId(c));
  await next();
});
app.use("/h/:token", async (c, next) => {
  if (c.req.param("token").startsWith(`${presenterId(c)}-h`)) await ensurePresenter(c.env.DB, presenterId(c));
  await next();
});

app.get("/health", (c) => c.json({ ok: true, time: Date.now() }));

// ───────────── resident ─────────────

app.get("/h/:token", async (c) => {
  const ctx = await houseByToken(c.env.DB, c.req.param("token"));
  if (!ctx) return err(c, 404, "unknown code");
  return c.json(await buildResidentView(c.env.DB, ctx));
});

app.post("/h/:token/requests", async (c) => {
  const ctx = await houseByToken(c.env.DB, c.req.param("token"));
  if (!ctx) return err(c, 404, "unknown code");
  const body = await parse(c, ResidentRequestZ);
  if (!body.ok) return body.res;
  await upsertRequest(c.env.DB, { villageId: ctx.villageId, houseId: ctx.houseId, id: body.data.id, kind: body.data.kind, source: "resident", at: Date.now() });
  return c.json(await buildResidentView(c.env.DB, ctx));
});

app.post("/h/:token/requests/:id/cancel", async (c) => {
  const ctx = await houseByToken(c.env.DB, c.req.param("token"));
  if (!ctx) return err(c, 404, "unknown code");
  const id = c.req.param("id");
  const r = await c.env.DB.prepare("SELECT id FROM requests WHERE id = ? AND house_id = ?").bind(id, ctx.houseId).first();
  if (!r) return err(c, 404, "unknown request");
  const now = Date.now();
  await c.env.DB.prepare("UPDATE requests SET status = 'cancelled', closed_at = ?1, updated_at = ?1 WHERE id = ?2 AND house_id = ?3 AND status = 'open'")
    .bind(now, id, ctx.houseId)
    .run();
  return c.json(await buildResidentView(c.env.DB, ctx));
});

app.get("/h/:token/manifest.webmanifest", async (c) => {
  const token = c.req.param("token");
  const ctx = await houseByToken(c.env.DB, token);
  if (!ctx) return err(c, 404, "unknown code");
  const manifest = {
    name: `Imaq · ${ctx.label}`,
    short_name: ctx.label,
    start_url: `/h/${encodeURIComponent(token)}`,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b3d5c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
  return c.body(JSON.stringify(manifest), 200, { "Content-Type": "application/manifest+json; charset=utf-8" });
});

// ───────────── village ─────────────

async function snapshotOr404(c: C, villageId: string) {
  const s = await buildSnapshot(c.env.DB, villageId);
  return s ? c.json(s) : err(c, 404, "unknown village");
}

app.get("/v/:villageId/snapshot", (c) => snapshotOr404(c, c.req.param("villageId")));

app.post("/v/:villageId/sync", async (c) => {
  const villageId = c.req.param("villageId");
  if (!(await getVillage(c.env.DB, villageId))) return err(c, 404, "unknown village");
  const body = await parse(c, SyncRequestZ);
  if (!body.ok) return body.res;
  const { acked, rejected } = await applyEvents(c.env.DB, villageId, body.data.events);
  const snapshot = await buildSnapshot(c.env.DB, villageId);
  if (!snapshot) return err(c, 404, "unknown village");
  return c.json({ acked, rejected, snapshot } satisfies SyncResponse);
});

app.post("/v/:villageId/requests", async (c) => {
  const villageId = c.req.param("villageId");
  if (!(await getVillage(c.env.DB, villageId))) return err(c, 404, "unknown village");
  const body = await parse(c, OfficeRequestZ);
  if (!body.ok) return body.res;
  const h = await c.env.DB.prepare("SELECT id FROM houses WHERE id = ? AND village_id = ?").bind(body.data.houseId, villageId).first();
  if (!h) return err(c, 400, "unknown house");
  await upsertRequest(c.env.DB, { villageId, houseId: body.data.houseId, id: body.data.id, kind: body.data.kind as RequestKind, source: "office", at: Date.now() });
  return snapshotOr404(c, villageId);
});

app.post("/v/:villageId/requests/:id/cancel", async (c) => {
  const villageId = c.req.param("villageId");
  if (!(await getVillage(c.env.DB, villageId))) return err(c, 404, "unknown village");
  const id = c.req.param("id");
  const r = await c.env.DB.prepare("SELECT id FROM requests WHERE id = ? AND village_id = ?").bind(id, villageId).first();
  if (!r) return err(c, 404, "unknown request");
  const now = Date.now();
  await c.env.DB.prepare("UPDATE requests SET status = 'cancelled', closed_at = ?1, updated_at = ?1 WHERE id = ?2 AND village_id = ?3 AND status = 'open'")
    .bind(now, id, villageId)
    .run();
  return snapshotOr404(c, villageId);
});

app.post("/v/:villageId/log-entries", async (c) => {
  const villageId = c.req.param("villageId");
  const db = c.env.DB;
  if (!(await getVillage(db, villageId))) return err(c, 404, "unknown village");
  const body = await parse(c, OfficeLogZ);
  if (!body.ok) return body.res;
  const { id, voiceNoteId, fields } = body.data;
  if (fields.aboutTruckId && !(await db.prepare("SELECT id FROM trucks WHERE id = ? AND village_id = ?").bind(fields.aboutTruckId, villageId).first()))
    return err(c, 400, "unknown truck");
  if (fields.aboutHouseId && !(await db.prepare("SELECT id FROM houses WHERE id = ? AND village_id = ?").bind(fields.aboutHouseId, villageId).first()))
    return err(c, 400, "unknown house");
  const now = Date.now();
  let entryId = id;
  let occurredAt = now;
  if (voiceNoteId) {
    const n = await db.prepare("SELECT id, created_at FROM voice_notes WHERE id = ? AND village_id = ?").bind(voiceNoteId, villageId).first<{ id: string; created_at: number }>();
    if (!n) return err(c, 404, "unknown voice note");
    entryId = n.id;
    occurredAt = n.created_at;
  }
  const existing = await db.prepare("SELECT village_id FROM log_entries WHERE id = ?").bind(entryId).first<{ village_id: string }>();
  if (existing && existing.village_id !== villageId) return err(c, 409, "id conflict");
  const stmts = [
    db
      .prepare(
        `INSERT OR IGNORE INTO log_entries (id, village_id, voice_note_id, about_truck_id, about_house_id, type, category, severity, summary, source, occurred_at, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(entryId, villageId, voiceNoteId, fields.aboutTruckId, fields.aboutHouseId, fields.type, fields.category, fields.severity, fields.summary, voiceNoteId ? "voice" : "office", occurredAt, now),
  ];
  if (voiceNoteId) stmts.push(db.prepare("UPDATE voice_notes SET status = 'confirmed' WHERE id = ? AND village_id = ?").bind(voiceNoteId, villageId));
  await db.batch(stmts);
  return snapshotOr404(c, villageId);
});

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (c: C, filename: string, header: string[], rows: (string | number)[][]) =>
  c.body([header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });

app.get("/v/:villageId/deliveries", async (c) => {
  const villageId = c.req.param("villageId");
  const village = await getVillage(c.env.DB, villageId);
  if (!village) return err(c, 404, "unknown village");
  const from = Number(c.req.query("from") ?? 0);
  const to = Number(c.req.query("to") ?? Date.now());
  if (!Number.isFinite(from) || !Number.isFinite(to)) return err(c, 400, "from/to must be epoch milliseconds");
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.house_id, h.label AS house_label, t.label AS truck_label, s.litres, s.occurred_at
     FROM stops s JOIN houses h ON h.id = s.house_id JOIN trucks t ON t.id = s.truck_id
     WHERE s.village_id = ? AND s.outcome = 'delivered' AND s.voided_at IS NULL AND s.occurred_at >= ? AND s.occurred_at <= ?
     ORDER BY s.occurred_at, s.id`,
  )
    .bind(villageId, from, to)
    .all<{ id: string; house_id: string; house_label: string; truck_label: string; litres: number; occurred_at: number }>();
  const rows: DeliveryRow[] = results.map((r) => ({ stopId: r.id, houseId: r.house_id, houseLabel: r.house_label, truckLabel: r.truck_label, litres: r.litres, at: r.occurred_at }));
  if (c.req.query("format") === "csv")
    return csv(c, "deliveries.csv", ["house", "delivered_at_local", "truck", "litres"], rows.map((r) => [r.houseLabel, formatLocal(r.at, village.timezone), r.truckLabel, r.litres]));
  return c.json(rows);
});

app.get("/v/:villageId/weekly", async (c) => {
  const villageId = c.req.param("villageId");
  const db = c.env.DB;
  const village = await getVillage(db, villageId);
  if (!village) return err(c, 404, "unknown village");
  const now = Date.now();
  const since = now - 7 * 7 * DAY;
  const [stops, requests, events] = await db.batch([
    db.prepare("SELECT house_id, outcome, occurred_at, voided_at FROM stops WHERE village_id = ? AND occurred_at >= ?").bind(villageId, since),
    db.prepare("SELECT house_id, kind, created_at, closed_at FROM requests WHERE village_id = ? AND (closed_at IS NULL OR closed_at >= ?)").bind(villageId, since - 2 * DAY),
    db.prepare("SELECT id, truck_id, kind, reason, occurred_at FROM truck_status_events WHERE village_id = ? ORDER BY occurred_at").bind(villageId),
  ]);
  type R = Record<string, unknown>;
  const byTruck = new Map<string, StatusEventLite[]>();
  for (const e of (events!.results ?? []) as R[]) {
    const l = byTruck.get(e.truck_id as string) ?? [];
    l.push({ id: e.id as string, kind: e.kind as "down" | "back", reason: (e.reason as string) ?? null, occurredAt: e.occurred_at as number });
    byTruck.set(e.truck_id as string, l);
  }
  const rows = weekly(
    {
      stops: ((stops!.results ?? []) as R[]).map((s) => ({ houseId: s.house_id as string, outcome: s.outcome as "delivered" | "failed", occurredAt: s.occurred_at as number, voided: s.voided_at != null })),
      requests: ((requests!.results ?? []) as R[]).map((r) => ({ houseId: r.house_id as string, kind: r.kind as RequestKind, createdAt: r.created_at as number, closedAt: (r.closed_at as number | null) ?? null })),
      truckEvents: [...byTruck.values()],
    },
    village.config,
    village.timezone,
    now,
  );
  if (c.req.query("format") === "csv")
    return csv(
      c,
      "weekly.csv",
      ["week_start", "deliveries", "couldnt_deliver", "homes_waited_over_24h", "truck_down_days"],
      rows.map((r) => [formatLocal(r.weekStart, village.timezone).slice(0, 10), r.deliveries, r.couldntDeliver, r.homesWaitedOver24h, r.truckDownDays]),
    );
  return c.json(rows);
});

app.get("/v/:villageId/qr", async (c) => {
  const villageId = c.req.param("villageId");
  if (!(await getVillage(c.env.DB, villageId))) return err(c, 404, "unknown village");
  const { results } = await c.env.DB.prepare("SELECT id, label, qr_token FROM houses WHERE village_id = ?").bind(villageId).all<{ id: string; label: string; qr_token: string }>();
  return c.json(
    results
      .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }))
      .map((h) => ({ houseId: h.id, label: h.label, token: h.qr_token })),
  );
});

// ───────────── voice notes ─────────────

const getNote = (db: Db, villageId: string, id: string) =>
  db.prepare(`${VOICE_SELECT} WHERE id = ? AND village_id = ?`).bind(id, villageId).first<Record<string, unknown>>();

app.put("/v/:villageId/voice-notes/:noteId", async (c) => {
  const villageId = c.req.param("villageId");
  const noteId = c.req.param("noteId");
  const db = c.env.DB;
  const village = await getVillage(db, villageId);
  if (!village) return err(c, 404, "unknown village");
  if (noteId.length < 8 || noteId.length > 64) return err(c, 400, "noteId must be 8–64 characters");
  const existing = await getNote(db, villageId, noteId);
  if (existing) return c.json(toVoiceNote(existing));
  if (await db.prepare("SELECT id FROM voice_notes WHERE id = ?").bind(noteId).first()) return err(c, 409, "id conflict");
  const len = Number(c.req.header("content-length") ?? 0);
  if (len > MAX_AUDIO_BYTES) return err(c, 413, "voice note too large");
  const audio = await c.req.arrayBuffer();
  if (audio.byteLength > MAX_AUDIO_BYTES) return err(c, 413, "voice note too large");
  if (audio.byteLength === 0) return err(c, 400, "empty body");
  const now = Date.now();
  const count = await db.prepare("SELECT COUNT(*) AS n FROM voice_notes WHERE village_id = ? AND created_at >= ?").bind(villageId, now - DAY).first<{ n: number }>();
  if ((count?.n ?? 0) >= village.config.maxVoiceNotesPerDay) return err(c, 429, "daily voice note limit reached");
  const qp = (k: string) => c.req.query(k) || null;
  const context = (qp("context") ?? "free") as VoiceContext;
  if (!VOICE_CONTEXTS.includes(context)) return err(c, 400, "invalid context");
  const createdAtQ = Number(qp("createdAt"));
  const createdAt = Number.isFinite(createdAtQ) && createdAtQ > 0 ? Math.min(Math.floor(createdAtQ), now) : now;
  const durationS = Math.max(0, Number(qp("durationS")) || 0);
  const mime = (c.req.header("content-type") ?? "application/octet-stream").slice(0, 100);
  await db
    .prepare(
      `INSERT OR IGNORE INTO voice_notes (id, village_id, truck_id, house_id, context, sample_id, audio, mime, duration_s, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?)`,
    )
    .bind(noteId, villageId, qp("truckId"), qp("houseId"), context, qp("sampleId"), new Uint8Array(audio), mime, durationS, createdAt)
    .run();
  const row = await getNote(db, villageId, noteId);
  if (!row) return err(c, 409, "id conflict");
  return c.json(toVoiceNote(row));
});

app.get("/v/:villageId/voice-notes/:noteId", async (c) => {
  const row = await getNote(c.env.DB, c.req.param("villageId"), c.req.param("noteId"));
  return row ? c.json(toVoiceNote(row)) : err(c, 404, "unknown voice note");
});

app.get("/v/:villageId/voice-notes/:noteId/audio", async (c) => {
  const row = await c.env.DB.prepare("SELECT audio, mime FROM voice_notes WHERE id = ? AND village_id = ?")
    .bind(c.req.param("noteId"), c.req.param("villageId"))
    .first<{ audio: ArrayBuffer | number[] | Uint8Array | null; mime: string }>();
  if (!row) return err(c, 404, "unknown voice note");
  if (!row.audio) return err(c, 404, "no audio stored");
  const src = row.audio instanceof Uint8Array ? row.audio : new Uint8Array(row.audio as ArrayBuffer);
  const bytes = new Uint8Array(src.byteLength);
  bytes.set(src);
  return c.body(bytes.buffer, 200, { "Content-Type": row.mime, "Cache-Control": "private, max-age=86400" });
});

app.post("/v/:villageId/voice-notes/:noteId/process", async (c) => {
  const villageId = c.req.param("villageId");
  const noteId = c.req.param("noteId");
  const row = await getNote(c.env.DB, villageId, noteId);
  if (!row) return err(c, 404, "unknown voice note");
  try {
    return c.json(await processVoiceNote(c.env, villageId, noteId));
  } catch (e) {
    console.error("processVoiceNote failed", e);
    const again = await getNote(c.env.DB, villageId, noteId);
    return c.json(toVoiceNote(again ?? row));
  }
});

// ───────────── demo ─────────────

app.post("/demo/villages", async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  await deleteOldSandboxes(db, now - 3 * DAY);
  for (let i = 0; i < 3; i++) {
    const id = `sb-${randomToken(6)}`;
    if (await getVillage(db, id)) continue;
    await seedVillage(db, id, { name: "Demo village", isSandbox: true, now });
    return c.json({ villageId: id });
  }
  return err(c, 500, "could not allocate a sandbox id");
});

app.post("/v/:villageId/reset", async (c) => {
  const villageId = c.req.param("villageId");
  const village = await getVillage(c.env.DB, villageId);
  if (!village) return err(c, 404, "unknown village");
  if (!village.isSandbox) {
    const key = c.env.PRESENTER_KEY;
    if (key && c.req.header("x-presenter-key") !== key) return err(c, 403, "presenter key required");
  }
  const { results } = await c.env.DB.prepare("SELECT id, qr_token FROM houses WHERE village_id = ?").bind(villageId).all<{ id: string; qr_token: string }>();
  const tokens = Object.fromEntries(results.map((h) => [h.id, h.qr_token]));
  await resetVillage(c.env.DB, villageId, { name: village.name, isSandbox: village.isSandbox, now: Date.now(), tokens });
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((e, c) => {
  console.error(e);
  return c.json({ error: e instanceof Error ? e.message : "internal error" }, 500);
});

export { app };
export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
