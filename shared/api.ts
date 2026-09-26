/**
 * API routes (all JSON unless noted). Village-scoped routes live under /api/v/:villageId.
 *
 * Resident (QR token identifies house + village):
 *   GET  /api/h/:token                          → ResidentView            (404 = unknown code)
 *   POST /api/h/:token/requests                 ResidentRequestZ → ResidentView
 *   POST /api/h/:token/requests/:id/cancel      → ResidentView
 *   GET  /api/h/:token/manifest.webmanifest     → per-house web manifest (start_url /h/:token)
 *
 * Village:
 *   GET  /api/v/:villageId/snapshot             → Snapshot
 *   POST /api/v/:villageId/sync                 SyncRequestZ → SyncResponse
 *   POST /api/v/:villageId/requests             OfficeRequestZ → Snapshot
 *   POST /api/v/:villageId/requests/:id/cancel  → Snapshot
 *   POST /api/v/:villageId/log-entries          OfficeLogZ → Snapshot
 *   GET  /api/v/:villageId/deliveries?from=ms&to=ms[&format=csv] → DeliveryRow[] | text/csv
 *   GET  /api/v/:villageId/weekly[?format=csv]  → WeeklyRow[] (most recent first, 6 weeks) | text/csv
 *   GET  /api/v/:villageId/qr                   → { houseId, label, token }[] for the print sheet
 *
 * Voice notes (audio bytes stored in D1, max ~1.5 MB / 90 s):
 *   PUT  /api/v/:villageId/voice-notes/:noteId?context=&truckId=&houseId=&durationS=&createdAt=&sampleId=
 *        body = raw audio, Content-Type = the recorder's MIME type    → VoiceNoteInfo (idempotent)
 *   POST /api/v/:villageId/voice-notes/:noteId/process               → VoiceNoteInfo with draft (cached after first run)
 *   GET  /api/v/:villageId/voice-notes/:noteId                       → VoiceNoteInfo
 *   GET  /api/v/:villageId/voice-notes/:noteId/audio                 → audio bytes
 *
 * Demo:
 *   POST /api/demo/villages                     → { villageId } (fresh sandbox copy of the demo village)
 *   POST /api/v/:villageId/reset                → { ok } (sandbox: open; presenter village: header x-presenter-key)
 */
export {};
