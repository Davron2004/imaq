/**
 * Voice note → draft log entry (docs/build-plan.md §7).
 *
 * 1. Whisper: audio → transcript + detected language.
 * 2. An instruct model in JSON-schema mode: transcript → structured fields, choosing trucks and
 *    houses only from this village's real labels.
 * 3. Validation here, in plain code: unknown labels become blank and the note needs a human.
 *
 * The AI only proposes. Nothing reaches the log until a person confirms it (voice.confirm or the office).
 * Idempotent: a note that already has a draft is returned unchanged.
 */
import type { LogType, Severity, TruckCategory, VoiceDraft, VoiceNoteInfo, VoiceStatus, VoiceContext } from "../../shared/types";
import { LOG_TYPES, SEVERITIES, TRUCK_CATEGORIES } from "../../shared/types";
import { FALLBACK_DRAFTS } from "./fallback";

const WHISPER = "@cf/openai/whisper-large-v3-turbo";
const STRUCTURER = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const TIMEOUT_MS = 10_000;
const MIN_CONFIDENCE = 0.6;

interface NoteRow {
  id: string;
  village_id: string;
  truck_id: string | null;
  house_id: string | null;
  context: string;
  sample_id: string | null;
  audio: ArrayBuffer | number[] | null;
  mime: string;
  duration_s: number;
  draft: string | null;
  status: VoiceStatus;
  created_at: number;
}

interface Label {
  id: string;
  label: string;
}

export async function processVoiceNote(env: Env, villageId: string, noteId: string): Promise<VoiceNoteInfo> {
  const row = await env.DB.prepare(
    "SELECT id, village_id, truck_id, house_id, context, sample_id, audio, mime, duration_s, draft, status, created_at FROM voice_notes WHERE id = ? AND village_id = ?",
  )
    .bind(noteId, villageId)
    .first<NoteRow>();
  if (!row) throw new Error("voice note not found");
  if (row.draft) return toInfo(row, JSON.parse(row.draft) as VoiceDraft);

  const [trucks, houses] = await Promise.all([
    env.DB.prepare("SELECT id, label FROM trucks WHERE village_id = ? ORDER BY label").bind(villageId).all<Label>(),
    env.DB.prepare("SELECT id, label FROM houses WHERE village_id = ?").bind(villageId).all<Label>(),
  ]);
  const truckList = trucks.results;
  const houseList = houses.results.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));

  let transcript = "";
  let language: string | null = null;
  let draft: VoiceDraft;
  try {
    const heard = await withTimeout(transcribe(env, row.audio), TIMEOUT_MS);
    transcript = heard.text;
    language = heard.language;
    draft = transcript.trim()
      ? await withTimeout(structure(env, transcript, language, truckList, houseList), TIMEOUT_MS)
      : unsure("", language, "Nothing could be heard in this note.");
  } catch (err) {
    console.error("voice processing failed", noteId, err);
    const stored = row.sample_id ? FALLBACK_DRAFTS[row.sample_id] : undefined;
    draft = stored
      ? fromFallback(stored, transcript, language, truckList, houseList)
      : unsure(transcript, language, "Couldn't process this note automatically.");
  }

  const status: VoiceStatus = draft.needsHuman ? "needs_human" : "ready";
  // Only write if nobody processed it in the meantime (keeps concurrent /process calls idempotent).
  await env.DB.prepare(
    "UPDATE voice_notes SET transcript = ?, language = ?, draft = ?, draft_source = ?, status = ?, processed_at = ? WHERE id = ? AND draft IS NULL",
  )
    .bind(draft.transcript, draft.language, JSON.stringify(draft), draft.source, status, Date.now(), noteId)
    .run();
  const fresh = await env.DB.prepare("SELECT draft, status FROM voice_notes WHERE id = ?")
    .bind(noteId)
    .first<{ draft: string; status: VoiceStatus }>();
  return toInfo({ ...row, status: fresh?.status ?? status }, fresh?.draft ? (JSON.parse(fresh.draft) as VoiceDraft) : draft);
}

async function transcribe(env: Env, audio: NoteRow["audio"]): Promise<{ text: string; language: string | null }> {
  if (!audio) return { text: "", language: null };
  const bytes = audio instanceof ArrayBuffer ? new Uint8Array(audio) : Uint8Array.from(audio);
  const out = (await env.AI.run(WHISPER as keyof AiModels, { audio: toBase64(bytes) } as never)) as {
    text?: string;
    transcription_info?: { language?: string };
  };
  return { text: (out.text ?? "").trim(), language: out.transcription_info?.language ?? null };
}

const SYSTEM_PROMPT = (trucks: Label[], houses: Label[]) =>
  [
    "You turn a water-truck driver's voice note into one structured log entry for the village water office.",
    "Extract only what the driver actually said. Never give repair advice, never estimate repair time or parts, never decide priorities.",
    `Trucks in this village (use the exact label or null): ${trucks.map((t) => t.label).join(", ")}.`,
    `Houses in this village (use the exact label or null): ${houses.map((h) => h.label).join(", ")}.`,
    "Spoken numbers count: 'truck two' is Truck 2, 'house twenty two' or '22' is House 22.",
    "type: truck_problem (something wrong with a truck), couldnt_deliver (a delivery didn't happen), house_problem (tank, fill pipe or house fault), road_blocked (road or access blocked), other.",
    "category (only for truck_problem, else null): starting, heater, pump, hose, tires, brakes, other.",
    "severity (only for truck_problem, else null): fine = driver says it's fine; care = the driver can still drive it but something is wrong or someone should look at it; cant_drive = the driver says the truck can't be driven or is stopped.",
    "summary: one short line in plain English, no more than 15 words, even if the note is in another language.",
    "confidence: 0 to 1, how sure you are about type and what the note is about.",
    "needs_human: true if the note is unclear, doesn't say what is wrong, or you had to guess.",
  ].join("\n");

async function structure(env: Env, transcript: string, language: string | null, trucks: Label[], houses: Label[]): Promise<VoiceDraft> {
  const schema = {
    type: "object",
    properties: {
      truck: { type: ["string", "null"], enum: [...trucks.map((t) => t.label), null] },
      house: { type: ["string", "null"], enum: [...houses.map((h) => h.label), null] },
      type: { type: "string", enum: LOG_TYPES },
      category: { type: ["string", "null"], enum: [...TRUCK_CATEGORIES, null] },
      severity: { type: ["string", "null"], enum: [...SEVERITIES, null] },
      summary: { type: "string" },
      confidence: { type: "number" },
      needs_human: { type: "boolean" },
    },
    required: ["truck", "house", "type", "category", "severity", "summary", "confidence", "needs_human"],
  };
  const out = (await env.AI.run(STRUCTURER as keyof AiModels, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT(trucks, houses) },
      { role: "user", content: `Transcript (detected language: ${language ?? "unknown"}):\n${transcript}` },
    ],
    temperature: 0,
    max_tokens: 300,
    response_format: { type: "json_schema", json_schema: schema },
  } as never)) as { response?: unknown; choices?: { message?: { content?: string } }[] };

  const raw = out.response ?? out.choices?.[0]?.message?.content;
  const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
  return validate(parsed, transcript, language, trucks, houses, "ai");
}

/** Plain-code validation of whatever the model returned. Anything that doesn't match the village becomes blank + needs a human. */
function validate(
  p: Record<string, unknown>,
  transcript: string,
  language: string | null,
  trucks: Label[],
  houses: Label[],
  source: VoiceDraft["source"],
): VoiceDraft {
  let needsHuman = p.needs_human === true;
  const truck = typeof p.truck === "string" ? trucks.find((t) => t.label.toLowerCase() === p.truck!.toString().toLowerCase()) : undefined;
  const house = typeof p.house === "string" ? houses.find((h) => h.label.toLowerCase() === p.house!.toString().toLowerCase()) : undefined;
  if (typeof p.truck === "string" && !truck) needsHuman = true;
  if (typeof p.house === "string" && !house) needsHuman = true;

  const type = (LOG_TYPES as string[]).includes(p.type as string) ? (p.type as LogType) : "other";
  let category = (TRUCK_CATEGORIES as string[]).includes(p.category as string) ? (p.category as TruckCategory) : null;
  let severity = (SEVERITIES as string[]).includes(p.severity as string) ? (p.severity as Severity) : null;
  if (type !== "truck_problem") {
    category = null;
    severity = null;
  }
  const confidence = typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0;
  if (confidence < MIN_CONFIDENCE) needsHuman = true;
  if (type === "truck_problem" && !truck) needsHuman = true;

  const summary = typeof p.summary === "string" && p.summary.trim() ? p.summary.trim().slice(0, 200) : "Unclear voice note";
  return {
    aboutTruckId: truck?.id ?? null,
    aboutHouseId: house?.id ?? null,
    type,
    category,
    severity,
    summary: summary.charAt(0).toUpperCase() + summary.slice(1),
    transcript,
    language,
    confidence,
    needsHuman,
    source,
  };
}

function fromFallback(
  stored: (typeof FALLBACK_DRAFTS)[string],
  transcript: string,
  language: string | null,
  trucks: Label[],
  houses: Label[],
): VoiceDraft {
  return validate(
    { ...stored.fields, confidence: stored.confidence, needs_human: stored.needsHuman },
    transcript || stored.transcript,
    language ?? stored.language,
    trucks,
    houses,
    "fallback",
  );
}

function unsure(transcript: string, language: string | null, summary: string): VoiceDraft {
  return {
    aboutTruckId: null,
    aboutHouseId: null,
    type: "other",
    category: null,
    severity: null,
    summary,
    transcript,
    language,
    confidence: 0,
    needsHuman: true,
    source: "none",
  };
}

function toInfo(row: NoteRow, draft: VoiceDraft | null): VoiceNoteInfo {
  return {
    id: row.id,
    status: row.status,
    context: row.context as VoiceContext,
    truckId: row.truck_id,
    houseId: row.house_id,
    durationS: row.duration_s,
    mime: row.mime,
    createdAt: row.created_at,
    draft,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
