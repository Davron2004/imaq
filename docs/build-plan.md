# Imaq build plan

Written 14:25, Saturday 26 September 2026. The brief puts the submission deadline at **15:30 today**, which leaves about an hour of build time. Everything below is scheduled against that. If the deadline turns out to be later, the order stays the same and the extra time goes to SHOULD items and polish.

Companion documents: `imaq-build-brief.md` (why and what) and `docs/ui-handoff.md` (for the parallel UI design session).

---

## 1. Strategy

1. **One repo, one deploy.** A single Cloudflare Worker serves the web app and the API. A public URL exists within the first 20 minutes and gets redeployed continuously from then on, so there's never a "deploy at the end" risk.
2. **The simulation stands alone.** It's the centrepiece of the pitch and runs entirely in the browser with no backend, so nothing else breaking can take it down.
3. **Parallel work on disjoint paths.** Four builder agents plus the design session, each owning separate directories. I own the contracts between them, the AI pipeline, integration, deploys and end-to-end testing.
4. **Contracts before code.** Shared types, API shapes, screen hooks and the simulation engine's state type land in phase 0, before anyone builds against them. This is what makes 30 minutes of parallel building merge cleanly.
5. **Hard freeze at 15:18.** After that it's fixes, deploy and the submission form only.

## 2. Stack

The brief leaves these to the builder. My picks:

| Concern | Choice | Why |
|---|---|---|
| Hosting and API | Cloudflare Worker with Hono, static assets served by the same Worker | Free, no cold starts during the pitch, one deploy covers app and API |
| Database | Cloudflare D1 (SQLite) | Free tier is far beyond what we need. Plain SQL means staff logic can be checked by hand. Audio blobs up to 2 MB fit in a row. |
| AI | Workers AI: `whisper-large-v3-turbo` for transcript and language, then an instruct model in JSON-schema mode (Llama 3.3 70B) for the structured entry | Same Cloudflare account, no second API key, free daily allocation, runs server-side only. The provider sits behind one interface, so switching to Groq or Gemini's free tier is one file and one secret. |
| Frontend | Vite, React, TypeScript; one SPA with lazy-loaded routes per surface | Code splitting keeps the resident page small |
| Offline | `vite-plugin-pwa` (Workbox precache of the app shell) and Dexie over IndexedDB for the outbox and cached snapshot | The driver app cold-starts and works with no network |
| Styling | CSS Modules and CSS custom properties; Lucide icons | The design session can own tokens and Views without touching logic |
| Maps and simulation | Hand-built SVG from the village's own geometry (x/y in metres) | Works offline, looks the same in the simulation, driver app and office, needs no tile server |
| Live updates | TanStack Query polling every 3 s, paused while the tab is hidden | Simple and resilient on bad Wi-Fi, well inside the free request quota |
| Tests | Vitest for rules, sync idempotency and simulation determinism; Playwright for the demo loop including offline | |
| Licence | MIT | |

**Spike in phase 0 (first 10 minutes):** confirm Workers AI Whisper accepts browser-recorded audio (webm/opus from Chrome and Android, mp4/aac from iOS Safari) on the free plan, and that JSON-schema mode returns valid output. If either fails, switch to Groq's free tier (Whisper large v3 plus a Llama model), key stored as a Worker secret.

## 3. Repo layout and ownership

```
imaq/
  LICENSE  README.md  package.json  wrangler.jsonc  vite.config.ts  tsconfig.json
  shared/            types, zod schemas, rules.ts, village config defaults        (A)
  worker/            index.ts (Hono), routes/, db.ts, seed/, migrations/            (A)
  worker/ai/         provider.ts, workersAi.ts, fallback.ts, prompt.ts              (me)
  web/src/app/       router, providers                                             (me)
  web/src/data/      api client, driver store (Dexie), sync engine, use<Screen>() hooks  (B for driver, D for the rest)
  web/src/screens/   hub/ resident/ office/ qr/ stage/                             (D, Views restyled by design)
  web/src/screens/driver/                                                          (B, Views restyled by design)
  web/src/sim/engine/  pure TS, no DOM, seeded                                     (C)
  web/src/sim/render/  SVG renderer, counters, ticker, panels                      (C, restyled by design)
  web/src/ui/        tokens.css and primitives                                     (design session; I seed a plain v0)
  web/src/i18n/en.ts every string                                                  (shared, append-only)
  web/public/demo-audio/  pre-recorded voice notes
  e2e/               Playwright specs                                              (me)
  docs/
```

Each builder works in its own git worktree on its own branch and merges to `main` when its acceptance tests pass. `i18n/en.ts` is append-only by convention (namespaced keys per surface) so parallel edits don't conflict.

## 4. Data model (D1)

Every row carries `village_id`. Anything a phone creates uses a UUID generated on the phone as its primary key.

| Table | Key columns |
|---|---|
| `villages` | id, name, timezone (`America/Toronto` for Nunavik), config JSON (thresholds, capacity, emergency contact text), is_sandbox, created_at |
| `houses` | id, label, x, y, tank_litres (default 1200), uses_app, qr_token (unique) |
| `trucks` | id, label, kind (`water` / `sewage`), capacity_litres (default 13,600), status (`up` / `down`) |
| `requests` | id, house_id, kind (`soon` / `out` / `emergency` / `sewage`), source (`resident` / `lit_door` / `office`), status (`open` / `served` / `cancelled`), created_at, updated_at, closed_at |
| `stops` | id, house_id, truck_id, request_id, driver_initials, litres, outcome (`delivered` / `failed`), reason, voice_note_id, occurred_at, received_at, voided_at |
| `truck_checks` | id, truck_id, items JSON, passed, voice_note_id, occurred_at, received_at |
| `truck_status_events` | id, truck_id, kind (`down` / `back`), reason, voice_note_id, occurred_at, received_at |
| `voice_notes` | id, truck_id, house_id, context (`free` / `stop` / `check` / `down`), audio BLOB, mime, duration_s, transcript, language, draft JSON, draft_source (`ai` / `fallback`), status (`uploaded` / `ready` / `needs_human` / `confirmed`), created_at |
| `log_entries` | id (= voice_note_id when from a note), about_truck_id, about_house_id, type, category, severity, summary, source (`voice` / `office`), occurred_at, confirmed_at |

Decisions worth knowing:

- **Couldn't deliver keeps the request open.** The house still needs water, so the failed attempt is a stop record and the request stays in the queue showing "Tried 10:40 · road blocked". This departs from the brief's request status list, and I think it's the right call: otherwise the resident would have to ask again after every failed attempt. Staff can cancel a request by hand if it's genuinely finished.
- **One open water request and one open sewage request per house.** A new water request from the resident app changes the level of the existing one and keeps its original time, so upgrading doesn't cost a household its place in line.
- **Flags are computed when read**, from confirmed log entries. They can't go stale, and the query that produces a flag is also its explanation.
- **Truck down durations come from pairing** `down` and `back` events.

## 5. API

All under `/api`. Village-scoped routes are `/api/v/:villageId/...`.

| Route | Purpose |
|---|---|
| `GET /h/:token` | Resident view: house, open requests, trucks running, approximate place in line, last delivery |
| `POST /h/:token/requests` | Create or change a request (client-generated id) |
| `POST /h/:token/requests/:id/cancel` | Cancel |
| `GET /h/:token/manifest.webmanifest` | Per-house manifest so "add to home screen" reopens the right house |
| `GET /v/:id/snapshot` | Houses, trucks with down history, ordered open requests, flags, recent feed, counts. Used by the office and cached by the driver app. |
| `POST /v/:id/sync` | Driver outbox batch in, acked ids and a fresh snapshot out |
| `PUT /v/:id/voice-notes/:noteId` | Upload audio (idempotent) |
| `POST /v/:id/voice-notes/:noteId/process` | Transcribe and structure; returns the draft (cached after the first call) |
| `POST /v/:id/requests` | Office takes a call |
| `POST /v/:id/log-entries` | Office resolves a needs-a-human note |
| `GET /v/:id/deliveries?from&to[&format=csv]` | The water-sample lookup |
| `GET /v/:id/weekly[?format=csv]` | Weekly numbers |
| `POST /demo/villages` | Create a sandbox copy of the demo village |
| `POST /v/:id/reset` | Restore seed state. Open for sandboxes; the presenter village needs `PRESENTER_KEY`. |

Request bodies are validated with zod schemas from `shared/`, so the client and server can't drift apart.

## 6. Offline sync

- **Outbox events** look like `{ id, type, villageId, occurredAt, payload }`. Types: `truck.check`, `truck.down`, `truck.back`, `stop.delivered`, `stop.failed`, `stop.void`, `request.litDoor`, `voice.confirm`, `voice.needsHuman`.
- **The server applies every event with idempotent SQL**: `INSERT OR IGNORE` keyed on the client id, and guarded updates such as `UPDATE requests SET status='served' WHERE id=? AND status='open'`. Sending the same batch twice, or two copies at once, changes nothing the second time. The response lists acked ids and the client deletes them from the outbox.
- **Voice audio travels separately**: upload with PUT (same id, same result), then process. Confirming a note is an ordinary outbox event, so it also works offline once the draft has arrived.
- **Sync runs** on the browser's `online` event, when the app regains focus, every 15 s while the outbox isn't empty, and on "Sync now". "Online" means the last request succeeded, not `navigator.onLine`, which can't be trusted. Every fetch has a 5 s timeout.
- **What the driver sees** is the cached snapshot with pending outbox events applied on top, so a stop marked offline leaves the list immediately.
- **Cold start offline**: the service worker serves the app shell and Dexie holds the last snapshot.
- **The demo offline switch** makes the sync engine refuse the network, and the sync status says it's on. It's the fallback for the stage; a real phone in airplane mode is the main plan.

## 7. Voice note pipeline (mine)

1. Whisper returns the transcript and detected language.
2. The instruct model gets the transcript, the village's real truck and house labels as enums, and the fixed output schema, at temperature 0. The prompt tells it to extract only, never advise, never estimate repair time or parts, and to mark itself unsure rather than guess.
3. The server validates the result: truck and house must exist in the village, and every field must be a valid enum value. Anything invalid becomes blank and the note is flagged needs-a-human.
4. The note goes to **needs a human** when the model says so, confidence is below 0.6, a named truck or house doesn't exist, the transcript is empty, or the AI errors or takes more than 10 s.
5. **Demo fallback.** The three sample recordings have known ids. Their results are captured once from a real run and stored. If the AI is unreachable or slow, the server returns the stored result with `draft_source = fallback`, which the card shows as a small marker.
6. **Limits.** 90 s of audio per note and 60 notes per village per day, which protects the free allocation from a public URL.

## 8. Rules (`shared/rules.ts`, pure functions, unit tested)

All thresholds live in village config.

- `orderQueue`: Emergency, then Out of water, then Need water soon; oldest first within each.
- `queueFor(truckKind)`: water trucks get water requests; the sewage truck gets Sewage full.
- `loadsNeeded`: `ceil(litres / capacity)`, with capacity defaulting to 13,600 L.
- `waitingTooLong`: Out of water open for more than 24 h.
- `recurringTruckProblem`: the same truck and category confirmed 3 times within 7 days gives "Check with mechanic".
- `snowClearing`: road-blocked entries confirmed today.
- `houseRepairs`: confirmed house problems (frozen fill pipe, leaking tank and so on).
- `downHistory`: past down-to-back durations. No averages.
- `placeInLine`: count of open requests ahead in `orderQueue`, shown to residents as an approximate phrase.
- `weekly`: deliveries, couldn't-deliver count, homes that waited more than 24 h, truck-down days.

## 9. Simulation (builder C)

### Engine

- Lives in `web/src/sim/engine`, has no DOM access, and is seeded (mulberry32). The same seed gives the same run, byte for byte.
- Advances in fixed 1-minute steps. The renderer interpolates between steps and chooses how many steps per frame from the speed setting.
- Holds two worlds, **Today** and **Imaq**, built from one shared setup: houses, tanks, water use, the adoption set, the breakdown and blizzard script, and emergencies. Each world has its own policy and metrics.
- Exposes `createSim(params, seed)`, `step(n)`, `state` (typed in `types.ts`, the contract the renderer reads), and an event log that drives the ticker.

### Village

48 houses on a seeded, fixed road graph of roughly 2 × 1.4 km, with a water plant and a garage. Houses are split into three contiguous zones, one per truck. When trucks are down, the trucks still running take over the missing zones. Both worlds use the same zones.

### Houses

- Tank from 900 to 2,000 L, centred on 1,200.
- Daily use set so a full tank lasts 1 to 2.5 days, drawn evenly over waking hours (07:00 to 23:00).
- The door light comes on at 25%. The house counts as dry at 0.
- In the Imaq world, app users request at the same 25% ("Need water soon") and upgrade to "Out of water" at 0. The trigger is the same in both worlds, so only the information channel differs.
- Two scripted households declare an emergency during the week.

### Today policy

1. Scouting lap of the zone.
2. Back to base, then fill at the plant with what the lit doors need, up to capacity.
3. Deliver in route order, emergencies first once a driver has seen them.
4. Refill and continue if water runs out. Then start the next cycle with a new lap.

To keep the Today side believable rather than a straw man, drivers also serve lit doors they pass during delivery if they still have water on board.

### Imaq policy

1. At the plant, take this zone's requests in `orderQueue` order up to capacity and fill exactly that.
2. Deliver in nearest-neighbour order within each priority band.
3. On the way, mark lit doors of houses without the app, which adds them to the queue.
4. With an empty queue, drive a sweep lap looking for lit doors from non-app houses, then wait at the garage.

### Shared settings

Service 08:00 to 17:00 every day, which is kinder than the real 5 to 6 days a week and helps both sides equally. Truck speed about 20 km/h. A stop takes 5 minutes to hook up plus litres at 200 L/min. A full fill takes 25 minutes. All three are labelled as assumptions.

### Scenario (7 days)

| Day | Event |
|---|---|
| 1 | Normal, 3 trucks. Heater report 1 for Truck 2. |
| 2 | Heater reports 2 and 3, then the "check with mechanic" flag. Truck 2 breaks in the afternoon. |
| 3 | Truck 3 breaks. One truck left. |
| 4 | One truck. |
| 5 | Blizzard. No deliveries in either world. |
| 6 | Truck 2 back. |
| 7 | Truck 3 back. |

### Metrics, per world

Homes without water now, household-hours without water, km driven, deliveries made, and oldest waiting request. "Waiting" is measured from the moment the light comes on in both worlds, so the numbers compare fairly.

### Calibration targets (default seed)

- Day 1: both worlds have at most 2 dry homes at any moment.
- From day 3: the Today side's dry homes climb visibly while the Imaq side stays lower.
- Day 5: both get worse.
- Days 6 and 7: Imaq recovers faster.
- End: Imaq cuts household-hours without water by a clear margin. **If the margin goes past about 80%, the Today side is probably unfair**, so re-check the policy before touching parameters.
- Only tune parameters within plausible ranges, and publish the final values in the assumptions panel.
- The assumptions panel also says, in plain words, that this map has fewer homes per truck than the real village, so normal days look calmer than reality and the comparison is conservative.

### Rendering and performance

SVG, two panes. Trucks update every frame and house levels about 5 times a second. Target 60 fps on a mid-range laptop and never below 30. At 1× a day takes about 25 s. Pitch speed fits the whole week into about 60 s.

### Tests and tooling

- A determinism test: same seed gives the same final-state hash.
- A full-week run on seeds 1 to 20 asserting no NaN, no negative tanks, no truck stuck in one place for more than 3 simulated hours during service, and no exceptions.
- `npm run sim:report` prints per-day metrics for both worlds, used for calibration.

## 10. Demo tooling

- **Seed.** A fictional "Demo village": 48 houses, Trucks 1 to 3 (water, 13,600 L), Truck 4 (sewage).
  - History generated relative to reset time: 14 days of deliveries (so "since Tuesday" returns a real list and weekly numbers aren't empty), and past down periods of 4, 9 and 16 days.
  - **Two confirmed Truck 2 heater reports in the last 5 days**, so the voice note recorded live in the pitch is the third and raises the "check with mechanic" flag on stage.
  - 8 open requests, including one emergency, one lit door, one office call and one Out of water waiting more than 24 h.
- **Sandboxes.** The hub creates a private copy of the demo village per visitor, so judges don't collide with each other or with the pitch. Sandboxes older than 3 days are deleted whenever a new one is created. The presenter's village has a fixed id and its reset needs `PRESENTER_KEY`.
- **Sample voice notes.** Three phone recordings made by a teammate (scripts in appendix A). Their stored results are captured once from a real AI run.
- **QR sheet** at `/qr` and the **demo stage** at `/stage`, both described in the UI handoff.

## 11. Schedule

### Phase 0: 14:30 to 14:45 (me, plus you)

You:

1. `! npx wrangler login` (a free Cloudflare account is enough).
2. `! gh auth status`, and tell me the account the public repo should live under.
3. Start the UI design session with `docs/ui-handoff.md`. It can begin on direction and tokens before the repo exists.
4. Get a teammate to record the three voice notes from appendix A on a phone and drop them in the repo folder.

Me:

1. `git init`, scaffold the layout in section 3, MIT licence.
2. Write the contracts: shared types and zod schemas, the D1 migration, API route stubs, `use<Screen>()` hook signatures with view-model types, the simulation `types.ts`, and plain v0 tokens and primitives.
3. Create the D1 database, deploy hello-world, and confirm the public URL works.
4. Run the Workers AI spike.
5. Push the public repo.

### Phase 1: 14:45 to 15:08 (four builders in parallel, plus the design session)

| Builder | Agent type, model, effort | Scope | Done when |
|---|---|---|---|
| A: server | builder-critical, Opus, high | D1 queries, every API route except the AI step, sync apply with idempotency, `rules.ts`, seed, reset, sandboxes, CSV | Rules unit tests pass; the same sync batch sent twice leaves an identical database; seed plus reset round-trips |
| B: driver | builder-hard, Opus, high | Dexie store, outbox, sync engine, service worker, every driver screen as a functional View, recorder, confirmation card, undo | Playwright: offline check, stop, lit door, truck down and voice note, then online, then exactly one server row each |
| C: simulation | builder-hard, Opus, high | Engine, renderer, counters, ticker, clock and timeline, legend, assumptions, end summary, controls | Determinism and 20-seed tests pass; calibration targets met; runs unattended start to finish |
| D: other surfaces | builder-hard, Sonnet, high | Resident, office, hub, QR sheet, stage, against the section 5 contract | Resident request appears in office in the right order; lookup returns the seeded Tuesday deliveries |

Me in this phase: the AI pipeline (section 7), merging branches as they go green, deploying `main` every time it's green, and running the live loop on the public URL as soon as pieces exist.

Design session: tokens first (merged by about 14:55 so the builders' Views pick them up), then the simulation's look, then driver Views.

### Phase 2: 15:08 to 15:18 (integration)

1. Merge everything, including the `ui` branch.
2. Deploy.
3. Walk the whole acceptance checklist (section 13) on the public URL: a real phone for resident and driver (scan QR, airplane mode), a laptop for office and simulation, using the ego-browser skill for the desktop side.
4. Fix only what blocks a checklist item or looks broken on a projector.

### Phase 3: 15:18 to 15:27 (freeze and submit)

1. README: what it is, the demo URL, how to run it, the architecture in one diagram, the licence, "$0".
2. Final deploy.
3. Reset the presenter village.
4. Fill in the form (250, 700, 700 and 700 characters; I'll draft these during phase 1).
5. Submit by 15:27.

### After submission

Rehearse the 3-minute pitch twice on the stage view, then reset the presenter village.

## 12. Cut line

If we fall behind, cut from the bottom of this list first. Everything above the line is protected.

1. Public URL and public MIT repo
2. Simulation, the full MUST list
3. Resident request appearing on the driver list and the office screen
4. Driver offline outbox and sync with no duplicates
5. Voice note, confirmation card, log entry, flag, with the stored fallback
6. Office: trucks and history, flags, feed, water-sample lookup, weekly numbers
7. One-click demo reset

---- line ----

8. Per-visitor sandboxes (fallback: one shared public demo village plus the key-protected presenter village)
9. CSV exports
10. QR print sheet (fallback: QR codes on the hub)
11. Demo stage
12. Driver map view
13. Simulation SHOULDs: parameter editor, manual breakdown and blizzard, single-pane full screen

## 13. Acceptance checklist and how each item gets checked

| Brief checklist item | Check |
|---|---|
| QR opens resident app linked to the right house | Real phone camera on a printed code |
| Request appears on driver list and office in priority order | Playwright, plus live on the public URL |
| Offline driver actions sync once with no duplicates | Playwright `setOffline`, plus a real phone in airplane mode; count rows on the server |
| Messy note becomes a card; confirm creates an entry; unclear note becomes needs-a-human | The three sample notes, both with the live AI and with the AI forced to fail |
| Three heater reports in 7 days raise the flag | Rules unit test, plus the live demo path on the seed |
| Truck-down history shown as past durations only | Visual check, and grep the office View for any average |
| "Which houses got water between two dates" is correct and exportable | Compare against a SQL query on the seed; open the CSV |
| Simulation runs unattended with scripted events, counters, summary, assumptions and label, and works with no internet | Run it with the network disabled in the browser |
| No colour-only status; large text; glove-sized targets | axe-core in Playwright, a greyscale screenshot of every surface, a manual 200% text check |
| Public URL works for a stranger; public repo with licence; $0 | Private window on a phone that isn't logged in to anything; check the repo page; Cloudflare dashboard shows free plan |
| One-click reset restores the starting state | Reset, then compare the snapshot with a fresh seed |

## 14. Risks

| Risk | Mitigation |
|---|---|
| Venue Wi-Fi fails during the pitch | The simulation needs no network. The live loop can run over a phone hotspot. The stage has the offline switch. Sample notes have stored results. |
| Workers AI rejects the audio format or the free allocation runs out | Phase 0 spike. Groq as a drop-in. 90 s cap and a per-village daily cap. |
| iOS Safari records mp4 and handles PWAs differently | Store the MIME type with the audio and pass it through. iOS only needs to run the resident page and optionally the driver app. The demo driver phone should be Android if we have one. |
| Two sessions editing one repo | Disjoint directories, separate worktrees and branches, small frequent merges. |
| Judges collide in the shared demo | Per-visitor sandboxes; the presenter village's reset is key-protected. |
| The simulation's Today side looks rigged | Same trigger in both worlds, Today drivers serve lit doors on the way, the 80% sanity check, everything listed in the assumptions panel. |
| Out of time | The cut line above; freeze at 15:18 no matter what. |

## 15. What I need from you

1. Cloudflare login (`! npx wrangler login`) and the GitHub account for the public repo.
2. Three voice-note recordings by about 14:50.
3. Before going on stage, a check with Amenda about using the name Imaq and the syllabics.
4. Team name and member list for the form.
5. A yes or no on "couldn't deliver keeps the request open" (section 4). I'm building it that way unless you say otherwise.

---

## Appendix A: voice-note scripts

Record on a phone in a normal room, talking the way a tired driver would. Don't clean them up; the mess is the point.

1. **Heater, Truck 2 (the live-demo note).** "Uh, yeah, it's Truck 2 again, the heater's making that noise, like a grinding, same as last week. It's still blowing warm but only barely. I can drive it but, you know, somebody should look at it. Okay."
2. **Road blocked, some French.** "The road past House 22 is blocked, there's a big drift, c'est complètement bloqué, I couldn't get to 22 or 23. Going around the other way."
3. **Unclear, should become needs a human.** Mumble something short and ambiguous with engine noise, no truck or house named: "…yeah the thing's doing it again, I don't know, whatever, I'll tell him later."

## Appendix B: pitch run sheet

| Time | On screen | What happens |
|---|---|---|
| 0:00 | Hub, then the simulation | Problem hook: the scouting lap, 2.5 days per tank |
| 0:20 | Simulation at pitch speed | Narrate the Truck 3 breakdown and the blizzard; point at the counters pulling apart and the heater flag in the ticker |
| 1:20 | Stage, or real phones plus the projected office | Scan the QR on the cardboard door, tap Out of water; it appears on the driver list and the office |
| 1:40 | Driver phone in airplane mode | Record the heater note, turn airplane mode off; "3 saved on phone" becomes "All synced"; the card appears; confirm; the "check with mechanic" flag appears on the office screen |
| 2:20 | Office | "Which homes got water since Tuesday?" gives the list and the CSV |
| 2:40 | Hub | Close: works offline, never worse than today, $0, builds the record the pipeline case needs |
