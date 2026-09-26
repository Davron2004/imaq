# Imaq — Build Brief

Hack for Humanity Ottawa 2026 · Challenge: Water in Canada's North
Working name: **Imaq** (Inuktitut for "water"; syllabics ᐃᒪᖅ — confirm with the challenge presenter before using it on stage)

This document says **why** we are building Imaq and **what** it must do. It deliberately leaves most technical choices (framework, database, hosting, map library, styling, exact AI model) to the builder. The few decisions already made are in section 10, because they are load-bearing or depend on context the builder does not have.

---

## 1. The problem

Most Inuit communities in Nunavik (northern Quebec) have no water pipes. Water is trucked from a treatment plant to a tank in each home, and sewage is trucked away from a second tank.

**What the published research says** (Kangiqsualujjuaq, a nearby Nunavik village on the same system):
- A household tank holds about **1,200 L**. A full tank lasts **2.5 days at most**.
- Delivery is supposed to be daily but actually happens **5–6 times a week**.
- **33% of households ran short of water in a single week**; about 25% had tanks lasting a day or less.
- 77% use other water sources (public tap, lakes and rivers); 37% don't drink their tap water.

**What goes wrong:** trucks break (built for southern highways, driven on Arctic gravel at −40°C), parts come from far away, blizzards stop deliveries. In one village all three water trucks broke at once and residents hauled water in their own pickups. The long-term fix is a pipeline, which is Inukjuak's only infrastructure priority but is about ten years away.

**What we learned from the challenge presenter (Amenda, from Inukjuak), Q&A today:**
- **Requesting water = a light on the door.** There is no schedule. A truck first drives its route to see which lights are on, goes back to base, works out how much water it needs, fills up at the plant, then drives the route again to deliver. **Every request costs a scouting lap of the village.**
- **Drivers decide the order** themselves. **There is no record of deliveries.** Drivers would welcome a way to record them if it is easy, intuitive and fail-safe.
- **Connectivity:** every home, the garage/base and the water plant have Wi-Fi. Outside, there is basically no connection (satellite is unreliable). Drivers have smartphones and talk to each other by walkie-talkie.
- Her community has **3 water trucks**. This summer **2 of 3 broke for about two weeks** waiting for parts; her sister helped run the one working truck.
- **Blizzards** stop deliveries when trucks can't get through.
- **A full sewage tank stops the water working in the house.**
- **Emergencies** (a household declaring one) get water first.
- **Announcements go out on Facebook groups**; elders use phones and Facebook too.
- **Water samples go to Montreal about 8 times a month** for E. coli testing; results take days.
- **Governance is thin:** a mayor carrying almost everything, and a few local staff running water. There are no departments. Anything we build must run itself with near-zero admin work.

We build for **small, truck-served communities like hers**, not only for Inukjuak.

## 2. What we are building

Imaq gives every household a way to request water from their phone (opened by scanning a QR code on their door), gives drivers a glove-friendly app that works offline and records every stop, and gives the water office one screen showing what is happening. Because requests are known **before** trucks load, the scouting lap disappears, which matters most exactly when two of three trucks are down. Every stop becomes the village's first delivery record. The one AI feature turns drivers' rambling voice notes, in any language, into clean, confirmed log entries.

**Pitch line:** "Today, to find out who needs water, a truck drives the whole village looking for lights on doors, then goes back, fills up, and drives the whole village again. Every one of those homes has Wi-Fi."

**Why it's not hype:**
- It removes a real, observed waste (the scouting lap) with plain logic, no AI guessing.
- The door light keeps working. If Imaq fails, the village does exactly what it does today.
- AI only turns speech into records, a human confirms each one, and the original audio is always kept.
- It creates data that does not exist today: deliveries, missed stops, truck downtime. That data is also evidence for the pipeline funding the mayor is already seeking.

**Why it's different from what exists:** Kiujik (Kativik Regional Government + Code for Canada, piloting in Kuujjuaq) and GovTec handle requests and dispatch. Neither records drivers' field knowledge by voice, removes the scouting lap in light-on-door villages, or traces a bad lab result to the exact homes served. Neither publishes an API or code.

## 3. Non-negotiable principles

1. **$0.** Free tiers only. No paid APIs, no paid hosting, no hardware. The repo must be public under **MIT or Apache 2.0**.
2. **Never worse than today.** The door light and walkie-talkies keep working. If any part of Imaq is down, drivers can still work the old way.
3. **The driver app works fully offline.** Everything is stored on the phone and syncs when it reaches Wi-Fi (at the plant every load, at base, near homes).
4. **AI only turns messy speech into structured records.** It never decides who gets water, never gives repair advice, never estimates repair times. A human confirms every AI output. The original audio and transcript are always kept.
5. **Everything else is plain, explainable rules** that a staff member could check by hand.
6. **Built for cold hands and busy people.** Big tap targets, icons plus words, almost no typing. It must work with gloves.
7. **Accessibility is shown, not claimed** (it's 25% of the judging): high contrast, large text, status never shown by colour alone, labels for screen readers, large tap targets.
8. **Multi-village from day one.** Every record belongs to a village.
9. **English first, translation-ready.** All interface text lives in one place so Inuktitut and French can be added.
10. **Minimal personal data.** "Emergency" is a flag, never a medical detail. No names needed beyond a house label.

## 4. Who uses it

| Role | Where they are | What they need |
|---|---|---|
| **Resident** | At home, on Wi-Fi, on their own phone | Ask for water without waiting for a truck to spot a light; know the request was received |
| **Driver** | In the truck, mostly offline; Wi-Fi at plant/base | Know who needs water before loading; record stops in seconds; report truck problems by talking |
| **Water office** (water staff, manager, mayor) | Office, on Wi-Fi | See the day at a glance; know which trucks are down and for how long historically; answer "which homes got water since X?"; weekly numbers |
| **Judges / audience** | Demo | See the difference in a simulation they understand in 60 seconds |

## 5. Components and requirements

Priority: **MUST** (demo breaks without it) · **SHOULD** (build if time) · **WON'T** (future slide).

### 5.1 Server — the single source of truth

- **MUST** store: villages, houses, trucks, requests, stop events (delivered / couldn't deliver), truck checks, truck down/back events, voice notes (audio, transcript, structured result, confirmed or not), and flags produced by rules.
- **MUST** accept batches from offline phones **without creating duplicates** when the same batch is sent twice (see section 10).
- **MUST** compute the request queue and flags using the rules in 5.6.
- **MUST** have a "reset demo data" action that restores the seeded demo village.
- **SHOULD** export deliveries and weekly numbers as CSV.

**Core records (fields are a starting point, not a schema mandate):**
- **House:** village, label or address, position on the map, tank size (optional; default 1,200 L), linked to the app yes/no, QR token.
- **Request:** house, type (`need water soon` / `out of water` / `emergency` / `sewage full`), source (`resident app` / `driver saw lit door` / `office took a call`), status (`open` / `served` / `couldn't deliver` / `cancelled`), timestamps.
- **Stop event:** house, truck, driver, litres, outcome (`delivered` / `couldn't deliver` + reason), time.
- **Truck:** id, type (water / sewage), status (up / down), latest check.
- **Truck down/back event:** truck, reason (short), time down, time back.
- **Voice note → log entry:** see 5.4.

### 5.2 Resident web app (opened by QR code)

- **MUST** open by scanning a QR code on the door or tank, which links the phone to that house. No typing IDs, no account creation.
- **MUST** show four large buttons: **Need water soon · Out of water · Emergency · Sewage full**.
- **MUST** show a clear confirmation ("Request received 10:42") and allow cancelling.
- **MUST** show honest status: how many trucks are running today (e.g. "1 of 3 trucks running") and approximate place in the queue. It **must never promise a delivery time** it can't know.
- **MUST** work on cheap phones and slow Wi-Fi; no install needed (can be added to the home screen).
- **SHOULD** show the date of the last delivery.
- **WON'T** do chat, push notifications or Facebook integration.

### 5.3 Driver app (offline-first)

- **MUST** work with no connection at all, queue everything locally, and sync automatically when online. It **must** always show sync state clearly (e.g. "3 entries waiting to upload" / "All synced 11:05").
- **Start of shift — MUST:** pick your truck, then a pre-trip check of a few big toggles (starts OK, heater OK, pump OK, hoses OK, other issue) plus an optional voice note. A failed check marks the truck **down**.
- **Today's list — MUST:** open requests for this truck type (water trucks see water requests; sewage trucks see sewage-full requests), ordered by the rules in 5.6. Show the **total litres needed and how many truckloads** that means.
- **Each stop — MUST:** one tap **Delivered** (litres pre-filled from the tank size, editable) or **Couldn't deliver** with reason chips (road blocked, no access, frozen fill pipe, truck problem, other) plus an optional voice note.
- **Lit door — MUST:** a button to add a request for a house that isn't using the app but has its light on. This keeps non-app houses in the same list.
- **Truck down / truck back — MUST:** one tap each, with an optional voice note.
- **Voice note — MUST:** hold to record, saved offline, processed after sync, then shown back as a confirmation card (see 5.4).
- **SHOULD:** map view of today's requests.

### 5.4 The one AI feature: voice note → log entry

**Why AI here:** drivers ramble, mix languages, and won't type in the cold. Turning that into a clean shared record is something plain code can't do and a form won't get used for.

- **Input:** audio of any length, any language, rambling allowed.
- **Output:** a fixed structure:
  - **About:** truck (must be one of the village's real trucks) and/or house (must be a real house), or blank.
  - **Type:** `truck problem` / `couldn't deliver` / `house problem` / `road blocked` / `other`.
  - **Category** (truck problems): `starting` / `heater` / `pump` / `hose` / `tires` / `brakes` / `other`.
  - **How bad:** `fine to drive` / `drive with care` / `can't drive`.
  - **One-line summary** in English.
  - **Transcript** (original words) and **detected language**.
  - **Confidence** or a `needs a human` marker.
- **MUST:** the driver sees "Here's what I understood: Truck 2, heater, drive with care" and taps ✓ or edits. **Nothing enters the log unconfirmed.**
- **MUST:** keep the original audio and transcript forever. If the AI isn't sure, save it as **"needs a human"** rather than guessing.
- **MUST NOT:** invent trucks or houses, give repair advice, estimate repair times or parts, or decide priorities.
- **MUST run server-side** (API key never in the app) on a **free tier**.
- **Honesty note:** speech recognition for Inuktitut is weak. Demo in English (or English/French) and say so. Keeping the original audio means nothing is lost when the AI can't understand.
- **Demo safety:** have at least one pre-recorded messy voice note that is known to work, plus a stored fallback result if the AI service is unreachable during the pitch.

### 5.5 Water office screen

- **MUST** show today at a glance:
  - trucks up/down; for each down truck, how long it has been down, plus its **history** ("Last 3 times down: 4, 9, 16 days"). This is a record, **not a prediction**;
  - open requests by type, the oldest waiting request, homes waiting more than 24 h;
  - a map of open requests;
  - **flags** from the rules (recurring truck problem, road blocked, house repair needed);
  - a feed of confirmed log entries from voice notes and stops.
- **MUST** answer **"Which houses got water between [date] and [date]?"** as a list the staff can copy or export. This is how a bad lab result from Montreal becomes a targeted advisory and flush list.
- **MUST** show weekly numbers: deliveries made, couldn't-deliver count, homes that waited more than 24 h, truck-down days.
- **SHOULD** export everything as CSV (evidence for the mayor and pipeline funding requests).
- **WON'T** auto-post to Facebook or draft posts with AI.

### 5.6 Rules (plain logic, no AI)

All thresholds configurable per village.
- **Queue order:** Emergency → Out of water → Need water soon; within the same level, oldest request first. (SHOULD: group nearby houses to cut driving.)
- **Sewage full** requests go to the sewage truck's list.
- **Loads needed** = litres requested ÷ truck capacity (default **13,600 L**).
- **Waiting too long:** "out of water" open more than 24 h → highlighted.
- **Recurring truck problem:** same truck + same category confirmed **3 times within 7 days** → flag "check with mechanic".
- **Road blocked:** any confirmed "road blocked" entry → appears on a snow-clearing list for that day.
- **House problem:** confirmed "frozen fill pipe", "leaking tank" etc. → house repair list.
- **Truck-down history:** list of past down→back durations. No averages presented as forecasts.

## 6. The simulation — demo centrepiece

**Purpose:** show judges, in about 60 seconds, what changes when requests are known before trucks leave, under the failures this community actually lives through.

### 6.1 Must-have criteria

- **Runs by itself** once started, as a time-lapse (roughly 20–30 seconds per simulated day), with pause, play and speed controls.
- **Side by side, same village, same events:**
  - **Left: "Today."** Door lights only. Each cycle, a truck does a scouting lap of its route, returns to base, fills at the plant, then delivers. Emergencies are served first *once a driver has seen them*.
  - **Right: "With Imaq."** Requests reach drivers instantly from the app. A share of houses don't use the app (adoption default **80%**), and those are only discovered when a truck passes and the driver marks the lit door. No scouting lap. Queue order follows 5.6.
- **A fair comparison.** Both sides use the same truck speed, capacity, fill time, time per stop, tank sizes, water use, breakdowns and blizzard. The "Today" side must be believable, not a straw man.
- **The village:** a scaled-down, top-down map (about 40–60 houses, labelled as scaled down; Inukjuak has about 2,000 people), roads, a water plant, a base/garage, **3 water trucks**.
- **Houses:** each has a tank (default 1,200 L, varied roughly 900–2,000 L) and a household size that sets daily use, so a full tank lasts about 1–2.5 days. The tank drains over time, the door light turns on at a low level (assumption: ~25%), and the house shows as **dry** when empty.
- **Scripted scenario, based on Amenda's summer.** About 7 simulated days: Day 1 normal with 3 trucks → Truck 2 breaks → Truck 3 breaks (one truck left) → a **blizzard day** with no deliveries on either side → trucks return near the end.
- **Live counters for each side, in big numbers:** homes without water right now, cumulative household-hours without water, kilometres driven, deliveries made, oldest waiting request. **End-of-run summary** comparing the two sides.
- **Visuals:** trucks moving along roads, tank level on each house, door lights glowing, dry houses clearly marked, a blizzard overlay, a truck-down icon, and a clear legend. Readable from the back of a room.
- **Event ticker** showing simulated app activity, for example:
  - resident taps: "House 14: Out of water"
  - drivers marking lit doors
  - a voice note becoming a log entry: *"uh the heater's making that noise again, truck two…"* → Truck 2 · heater · drive with care ✓
  - the "third heater report this week → check with mechanic" flag appearing before Truck 2 breaks.
- **Honest labelling:** a visible "Simulation — assumed numbers" tag and an **assumptions panel** listing every parameter and where it came from.
- **Reproducible and demo-proof:** the same seed gives the same run. It runs entirely in the browser with **no network needed**, and it must not crash or stall.
- **Accessible:** dry houses, lit doors and trucks are distinguishable without colour (icons or patterns), with large text.

### 6.2 Should-have

- Editable parameters: app adoption %, number of trucks, truck capacity, tank size range, breakdown days, blizzard day.
- Buttons to trigger a breakdown or blizzard manually.
- A full-screen single-side view and a replay button.

### 6.3 Default assumptions (show them in the assumptions panel)

| Parameter | Default | Source |
|---|---|---|
| Household tank | 1,200 L (vary 900–2,000) | Kangiqsualujjuaq study |
| Full tank lasts | ≤ 2.5 days | Kangiqsualujjuaq study |
| Water trucks | 3 | Amenda |
| Truck capacity | 13,600 L | APTN (Puvirnituq) |
| Breakdown scenario | 2 of 3 trucks down for an extended period | Amenda (summer: ~2 weeks) |
| Blizzard | 1 day with no deliveries | Amenda |
| Door light turns on at | ~25% tank | Assumption |
| App adoption | 80% | Assumption |
| Truck speed, fill time, time per stop | Reasonable values, labelled as assumptions | Assumption |

**Never present the simulation's improvement as a measured real-world result.** Say "in this simulation, with these assumptions."

## 7. Demo flow the build must support (3-minute finalist pitch)

1. **Problem hook** (~20 s): the scouting lap, and 2.5 days per tank.
2. **Simulation** (~60 s): the summer scenario, side by side.
3. **Live app loop** (~60 s):
   - a phone scans a QR code → taps "Out of water" → it appears on the driver app and the office screen;
   - the driver app, offline, records a messy voice note → reconnects → confirmation card → the log entry and flag appear on the office screen;
   - the office screen answers "which houses got water since Tuesday?"
4. **Close** (~20 s): works offline, never worse than today, $0, builds the record the pipeline case needs.

The build **must** have a one-click demo reset, and the live loop must survive flaky venue Wi-Fi (fallbacks in 5.4).

## 8. Hard submission requirements (deadline 3:30 PM)

- A **public, working prototype URL** judges can open without creating accounts (use a demo village and pre-linked demo QR codes).
- A **public repo** under **MIT or Apache 2.0**.
- **$0 spent.** All code written after the 12:00 start.
- Web form: team name and members; description (**250 characters**); how it addresses the problem (**700**); social impact (**700**); unique value (**700**).

## 9. Out of scope (for a "what's next" slide)

- Clip-on sensor for the existing door light (only useful if the light is automatic and a house never adopts the app)
- Predicting which homes run dry before a forecast blizzard
- Learning which storm levels actually stop deliveries
- Repair-time and parts estimates (the mechanic's call, not ours)
- Integration with Kiujik / GovTec, Facebook posting, push notifications
- Better Inuktitut speech recognition

## 10. Technical decisions already made (load-bearing)

1. **Web apps, not app-store apps,** for residents and drivers (installable to the home screen). Judges need a link, residents get in by QR, and there's no store review.
2. **The driver app is offline-first:** a local queue with **IDs generated on the phone**, so a re-sent batch never creates duplicates. Sync is automatic on reconnect.
3. **One shared backend** is the source of truth for all apps, **multi-village** by village ID, on a free tier.
4. **AI runs only on the server** (key never shipped to phones), on a free tier that accepts audio and returns structured output. There is a stored fallback result for the demo.
5. **The simulation runs entirely in the browser** with a fixed seed and no network dependency.
6. **Rules are separate from AI:** AI output only enters the system after a human confirms it; every rule works on confirmed data.

**Left to the builder:** framework, database, hosting, map/graphics library, styling, which model and provider.

## 11. Acceptance checklist

- [ ] Scanning a demo QR code opens the resident app linked to the right house, with no typing.
- [ ] A resident request appears in the driver list and on the office screen, in the correct priority order.
- [ ] With the network off, the driver can check the truck, mark stops, mark a lit door, mark a truck down and record a voice note; all of it syncs once, with no duplicates, when back online.
- [ ] A messy voice note becomes a confirmation card; confirming creates a log entry; an unclear note is saved as "needs a human".
- [ ] Three confirmed heater reports for one truck within 7 days raise the "check with mechanic" flag.
- [ ] The office screen shows truck-down history as past durations, with no prediction.
- [ ] "Which houses got water between two dates" returns a correct, exportable list.
- [ ] The simulation runs start to finish unattended, side by side, with the scripted breakdowns and blizzard, live counters, an end summary, an assumptions panel and a "simulated" label; it works with no internet.
- [ ] Status is never shown by colour alone; text is large; buttons work with gloves (large targets).
- [ ] The public URL works for a stranger; the repo is public with an MIT or Apache 2.0 licence; nothing costs money.
- [ ] A one-click demo reset restores the starting state.

## 12. Sources

- Challenge guide and slides, Hack for Humanity Ottawa 2026 (presenter: Amenda Amidlak-Soucy, Inukjuak)
- Q&A with the presenter, 26 Sept 2026 (notes above)
- Inukjuak municipal documents: feasibility study request, 2025 progress report, Nunavik joint call to action
- Journal of Water and Health (2024), *Domestic access to water in a decentralized truck-to-cistern system: Kangiqsualujjuaq, Nunavik* — https://iwaponline.com/jwh/article/22/5/797/101774/Domestic-access-to-water-in-a-decentralized-truck
- APTN Investigates, *Pipe Dreams: The water crisis in Nunavik* — https://www.aptnnews.ca/investigates/pipe-dreams-the-water-crisis-in-nunavik/
- CBC, *All 3 water trucks in Kangiqsualujjuaq broke down* — https://www.cbc.ca/news/canada/north/kangiqsualujjuaq-water-trucks-broken-1.6137931
- Nunatsiaq News, *New app for water, sewage service being tested in Kuujjuaq* (Kiujik) — https://nunatsiaq.com/stories/article/new-app-for-water-sewage-service-being-tested-in-kuujjuaq/
- GovTec Essential Services Tracking App — https://govtec.ca/app.html
- Institut nordique du Québec, *Monitoring water reservoirs* — https://inq.ulaval.ca/en/Monitoring-water-reservoirs
