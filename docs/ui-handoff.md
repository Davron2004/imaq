# Imaq UI handoff

This is for the session designing Imaq's interface. The full product brief is `imaq-build-brief.md` at the repo root. You don't need all of it, but section 1 (the problem) is worth five minutes.

How to read this document. Anything marked **must** is a hard constraint. Those come from accessibility, from honesty, or from how the product gets used in the field, and they aren't negotiable. Everything else is yours: layout, visual identity, colour, type, icons, motion, navigation, the exact wording. When I describe a component, I'm describing the job it does and the information it carries, not how it looks or where it sits. If you find a better way to do the job, do it that way. If you think a constraint is wrong, say so rather than quietly breaking it.

A working first version of every screen is being built in parallel. It will be functional and plain on purpose, and your design replaces its look (see the appendix for how the two fit together).

---

## 1. What Imaq is

Most Inuit communities in Nunavik (northern Quebec) have no water pipes. A truck fills a tank of about 1,200 L in each house, and a second truck empties the sewage tank. A full tank lasts 2.5 days at most. When a household needs water, they turn on a light by the door. A driver drives the whole village to see which lights are on, goes back, works out how much water to load, fills up at the plant, then drives the village again to deliver. Trucks break a lot (the presenter's village had 2 of its 3 trucks down for two weeks this summer), blizzards stop deliveries, and nobody keeps a record of who got water. The water office is a couple of staff and a mayor who carries everything else too.

Every home, the garage and the water plant have Wi-Fi. Outside, there's no signal at all.

Imaq does four things:

1. A household scans a QR code on their door and their phone becomes the door light: four big buttons for Need water soon, Out of water, Emergency and Sewage full.
2. Drivers get an app that works with gloves and with no connection. It shows who needs water before they load, records each stop in one tap, and turns rambling voice notes into log entries that the driver confirms.
3. The water office gets one screen: which trucks are running, who's waiting, what drivers reported, and "which homes got water between these dates?" (for when a bad water sample comes back from the lab in Montreal).
4. A simulation, for the pitch, runs the same village side by side with and without Imaq through a week with breakdowns and a blizzard.

The door light keeps working. If Imaq goes down, the village does exactly what it does today. That should set the tone for everything: Imaq is a helper bolted onto a system that already works (badly), not a replacement people have to depend on.

Context for the design: this is a hackathon build (Hack for Humanity Ottawa 2026). Accessibility is 25% of the judging. The demo is a 3-minute pitch on a projector, and judges will also open the public URL on their own phones and laptops, alone, with nobody explaining anything.

## 2. How it should feel

Direction, not a mood board.

- **A public utility, not a startup.** Calm, sturdy and plain. Something a mayor trusts and an elder uses without help. No marketing gloss, no gamification, no celebration animations.
- **Honest.** It never claims to know what it doesn't. It says "1 of 3 water trucks running today", never "your water arrives at 3:40". The simulation always says it's a simulation. AI output always looks like a suggestion waiting for a person, never like a fact.
- **Built for the North.** Gloved hands, glare off snow, a dark truck cab in December, slow Wi-Fi on a cheap Android phone, and a driver who has about four seconds to spare.
- **Respectful.** This is for Inuit communities. Stay away from clichés: igloos, inuksuit, northern-lights wallpaper, "tribal" patterns. Don't use Inuktitut syllabics as decoration. The name Imaq (ᐃᒪᖅ, "water") hasn't been confirmed with the community yet, so treat the wordmark as provisional and make it work with or without the syllabics.

Each surface has its own character within that:

- The **resident app** is almost nothing: one question ("what do you need?") and one reassurance ("we got it").
- The **driver app** is a tool, like a good flashlight. Few screens, huge targets, instant response, and it never makes the driver wait or wonder whether something was saved.
- The **office screen** is a status board you glance at between other jobs, not a dashboard you study. The important thing on it should be obvious from across the room.
- The **simulation** is an explainer for a room of strangers. They should get the point in one look from the back row and have it confirmed by the numbers.

## 3. Hard constraints for every surface

### Accessibility

- **Must** meet WCAG 2.2 AA at minimum. Text contrast at least 4.5:1 (3:1 for large text, 24 px regular or 18.66 px bold). Icons, control borders, focus rings and chart or map marks at least 3:1 against what's behind them. On the resident and driver apps, aim for 7:1 on primary text and all status, since they're used in glare.
- **Must** never show status by colour alone. Every status (request types, truck up or down, sync state, flags, AI states, house states in the simulation) carries an icon or shape and a word. Check every design in greyscale.
- **Must** have tap targets of at least 48 × 48 CSS px everywhere, with at least 8 px between neighbouring targets. On the driver app, primary actions are at least 64 px tall and full width or close to it, and the Delivered, Couldn't deliver and record buttons are bigger still. Gloves are fat and imprecise.
- **Must** use body text of at least 18 px on the resident and driver apps and 16 px on the office screen, sized in rem so the phone's own text-size setting scales everything. Layouts survive 200% text size without clipping or overlapping.
- **Must** work with a screen reader: every control has a name, headings are real headings, confirmations and sync changes are announced through live regions, focus is visible and moves in a sensible order.
- **Must not** require hover, precise dragging, pinching or multi-finger gestures. A swipe can be a shortcut but never the only way to do something.
- **Must** offer a no-hold way to record voice notes (tap to start, tap to stop) alongside hold-to-record, for screen-reader and switch users.
- **Must** respect `prefers-reduced-motion`. Movement in the simulation is the content and stays; decorative transitions go.

### Honesty

- **Must never** show a resident a delivery time, an ETA or a countdown. Show how many trucks are running and an approximate place in line.
- **Must** show truck-down history as a list of past durations ("Last 3 times down: 4, 9, 16 days"). No averages, no "expected back", no predicted repair time anywhere.
- **Must** frame AI output as "Here's what I understood", with the transcript one tap away and the original audio playable. Nothing looks final until a person confirms it. "Needs a human" is a normal, respectable state, not an error.
- **Must** keep a visible "Simulation · assumed numbers" label on every simulation view, including full screen and the end summary, with the assumptions one tap away.
- **Must not** present the demo village as a real place. It's a fictional layout. Don't label its map as Inukjuak.

### Field use

- **Must** make every driver action work offline and show sync state on every driver screen, in words ("Offline · 3 saved on phone", "All synced 11:05"). Nothing on the driver app waits on the network, and there are no blocking spinners.
- **Must** let the driver undo or correct every action: undo right after, fix later. Drivers asked for it to be fail-safe.
- **Must** keep typing near zero on the driver app. Litres come pre-filled and are adjusted with big steppers or presets. Houses are picked by tapping, not by typing names. Free text only where it's optional.
- **Must** stay readable in direct sun on snow and in a dark cab at night. How you get there is your call: light and dark themes, automatic switching, a toggle, or one theme that handles both.
- **Must** keep the resident page light, because it loads on slow Wi-Fi on cheap phones. No heavy web fonts, big images or animation libraries on that route. System fonts or one small subset font. Aim for under about 150 KB for the whole page.
- **Must** end every resident failure state with the old way that still works: "Couldn't send. Turn on your door light and the driver will still see it."

### Language and personal data

- **Must** keep all interface text in one strings file (English now; Inuktitut and French later). No text baked into images or SVG art.
- **Must** tolerate labels twice as long as the English, and syllabics script. Buttons wrap rather than truncate. The font stack needs Unified Canadian Aboriginal Syllabics coverage (Noto Sans Canadian Aboriginal works as a fallback) so a later translation doesn't render as boxes.
- **Must** show times in the village's local time. Use relative times for how long something has waited ("waiting 5 h") and clock times for when something happened ("Delivered 14:20").
- **Must not** collect or show residents' names. A house is a label ("House 14"). Emergency is a flag with no place for medical details, and none should be designed in.

### Screens and devices

| Surface | Main device | Must also work on |
|---|---|---|
| Resident | Phone, portrait, 360 × 640 | 320 px wide; tablet |
| Driver | Phone, portrait, 360 × 740, one hand, gloves | Tablet; landscape is nice to have |
| Office | Laptop, 1366 × 768 and 1920 × 1080; projector | Phone (judges): stacked |
| Simulation | Projector, 1920 × 1080 and 1280 × 720, landscape | Laptop; phone (judges): one side at a time or stacked |
| Hub, QR sheet | Anything | Print (QR sheet) |

The office screen and simulation will be projected. At 1280 × 720 the key numbers need to be readable from 10 m.

---

## 4. Surfaces and components

For each surface: who uses it, when, what they need to get done, and the components. A component entry says what it shows, what you can do with it, and which states need designing. The order in these lists is not a layout.

### 4.1 Demo hub (`/`)

**Who.** Judges and strangers opening the public URL; the presenter before the pitch.
**Jobs.** Understand Imaq in ten seconds, get into any role without an account, reset the demo.

- **Intro.** Two sentences at most on the problem and what Imaq does, with the scouting lap as the hook. A clear way into the simulation.
- **Role entry points.** Resident, Driver, Water office, Simulation. Each says in one line who it's for. The resident entry offers a demo house directly and a QR code to scan with a real phone.
- **Your demo village.** Every visitor gets a private copy of the demo village so two judges don't trip over each other. Show which village you're in and a Reset button that restores the starting state. States: creating, ready, resetting, failed.
- **Demo QR codes.** A few house QR codes big enough to scan off a laptop screen, plus a link to the print sheet.
- **Footer.** Open source with link, licence, "$0 to run", "fictional demo village".

### 4.2 Resident app (`/h/<qr-token>`)

**Who.** Anyone in the household, including elders, at home on Wi-Fi, often on a cheap phone. They get here by scanning the QR code on the door or tank, and after that from the home screen.
**Jobs.** Ask for water or a sewage pickup in one tap, know it was received, cancel it, see honest status.

- **House header.** "House 14" and the village name. No login, no profile, no settings.
- **Four request buttons.** Need water soon, Out of water, Emergency, Sewage full. Big, icon plus word, one tap each, except:
  - **Must:** Emergency takes one extra confirming tap ("Emergency puts you at the front of the line. Use it for health or safety."), because an accidental emergency pushes everyone else back.
  - A house can have one open water request and one open sewage request at a time. Tapping a different water level changes the existing request ("Change to Out of water?") rather than adding a second one. Moving up to Emergency puts it at the front.
- **Request received.** "Request received 10:42 · Out of water", a Cancel action, and it's still there after closing and reopening the app.
- **Honest status.** Trucks running ("1 of 3 water trucks running today"), approximate place in line ("About 6 homes ahead of you", "You're near the front"), last delivery ("Last water delivery: Tuesday 14:20"). **Must not** include any time estimate.
- **What happened to my request.** Delivered ("Delivered 14:20", shown for a while, then back to the four buttons). Driver came but couldn't deliver ("The driver came at 10:40 but the road was blocked. You're still in line."). Cancelled.
- **Emergency contact slot.** Text the village configures, for when someone is in danger. It's a slot, not a feature.
- **Failure and edge states.** Sending, couldn't send (offline or server down), with retry and the door-light fallback. Unknown or old QR code ("This code isn't linked to a house. Use your door light and let the water office know.").
- **Add to home screen hint.** Optional, dismissible, shown once.

### 4.3 Driver app (`/driver`)

**Who.** A driver in the truck cab, gloves on, mostly offline, phone in hand or mounted. Wi-Fi at the plant on every load, at the garage, and near homes.
**Jobs.** Start the shift with a truck check. See the day's list with total litres and truckloads before filling up. Record each stop in seconds. Add houses with a lit door. Mark the truck down or back. Talk instead of typing. Trust that nothing gets lost offline.

The rough flow is: pick truck, pre-trip check, then the day's list as home base, with a stop, a lit door, a voice note or truck status one tap away from it. How you structure navigation is up to you.

- **Sync status.** **Must** be visible on every driver screen. States: all synced (with time), offline with N saved on the phone, syncing, a sync problem that will be retried (calm wording, never alarming), and the demo "forced offline" switch when it's on. Tapping it shows what's waiting and a "Sync now" action. This is the thing that makes a driver trust the app with no signal, so it has to read at a glance.
- **Truck picker.** One card per truck in the village: label, water or sewage, up or down. Remembers the last choice. A down truck shows "Down since Tuesday" and can still be picked so it can be marked back up.
- **Pre-trip check.** Five items: Starts OK, Heater OK, Pump OK, Hoses OK, Other issue. A one-tap "All OK" path for the normal day. An optional voice note. If anything fails, confirm "This marks Truck 2 as down" before doing it. Each item's state reads without colour (OK with a check and the word, Problem with a cross and the word).
- **Today's list.** The home screen.
  - A summary at the top: total litres needed and what that means in truckloads ("About 18,400 L · 2 loads"), plus counts by type. The driver reads this at the plant before filling, so it needs to be the most prominent thing on the screen.
  - One row per open request: house label, request type (icon and word), how long it's been waiting, where it came from (resident app, lit door, office call), litres to deliver, and earlier attempts ("Tried 10:40 · road blocked").
  - **Must** keep the order the rules give: Emergency, then Out of water, then Need water soon, oldest first within each. You can group or annotate, but the priority order has to stay obvious.
  - Water trucks see water requests. The sewage truck sees Sewage full requests.
  - Empty state: "No open requests. Drive the route and add any lit doors." The old way still applies.
  - Always within reach: Lit door, Voice note, Truck status.
- **Stop.** Opened from a row. Two big actions:
  - **Delivered**, with litres pre-filled from the tank size and adjustable with big steppers or presets.
  - **Couldn't deliver**, with reason chips (Road blocked, No access, Frozen fill pipe, Truck problem, Other) and an optional voice note.
  - Afterwards, a few seconds of Undo, then the stop moves to Done today.
- **Done today.** This shift's stops with the sync state of each (saved on phone, uploaded). Any entry can be corrected or voided.
- **Lit door.** Adds a request for a house that isn't on the list because it doesn't use the app. Picking the house needs no keyboard: a big number pad, a tap on the map, a list of nearby houses, whatever works best, in three taps at most. The request type follows the truck (water or sewage). If the house already has an open request, say so instead of creating a duplicate. Works offline.
- **Truck status.** Truck down, one tap, with reason chips (Starting, Heater, Pump, Hose, Tires, Brakes, Other) and an optional voice note. Truck back, one tap. Shows since when it's been down.
- **Voice recorder.** Hold to record, plus the tap-to-toggle alternative. While recording it shows elapsed time and a level meter so the driver knows it's hearing them. Release to save. Maximum about 90 seconds. It can be attached to a stop, a truck check or a truck-down report, or stand alone. After saving, each note shows its state: saved on phone, uploading, understanding, ready to confirm. If microphone permission is denied, explain how to allow it and offer "Use a sample voice note" (in demo mode).
- **Confirmation card.** The one AI moment.
  - Header along the lines of "Here's what I understood".
  - Fields: About (a truck, a house, or nothing), Type (Truck problem, Couldn't deliver, House problem, Road blocked, Other), Category for truck problems (Starting, Heater, Pump, Hose, Tires, Brakes, Other), How bad (Fine to drive, Drive with care, Can't drive), a one-line summary in English, and the detected language.
  - Actions: Confirm, Edit (every field through chips; trucks and houses can only be picked from the village's real ones), and Needs a human.
  - The transcript expands in place and the original audio plays from the card.
  - When the AI isn't sure, the card opens as "Not sure what this was. Saved for a human to check", with the transcript. The driver can still fill in the fields and confirm, or leave it for the office.
  - Cards wait in an inbox when the driver is busy ("2 notes to confirm").
  - A small marker when the result came from a stored demo result rather than a live AI call.
- **Map (should).** Today's requests on the village map, same symbols as the office.
- **Driver identity.** Optional initials at most. No login.

### 4.4 Water office (`/office`)

**Who.** Water staff, the manager, the mayor. In the office on Wi-Fi, on a laptop, glancing over between other jobs. Not technical. Projected during the demo.
**Jobs.** See the day at a glance. Know which trucks are down and their history. Spot who has waited too long. See what drivers reported and act on flags. Answer "which homes got water between X and Y?". Weekly numbers and exports. **Must** need no regular upkeep: nothing on this screen asks staff to maintain it.

- **Header.** Village, date, a live indicator ("Updated 11:05"), exports, and demo reset in demo mode.
- **Trucks.** Each truck: label, type, up or down (icon and word), the latest check with its time. For a down truck: how long it's been down, the reason, and its history as past durations. No forecast.
- **Requests at a glance.** Open counts by type, the oldest waiting request, and homes out of water for more than 24 h called out loudly.
- **Open requests.** The same order drivers see: house, type, age, source, attempts. Staff can add a request for someone who phoned in ("office took a call") and cancel one.
- **Map.** The village map with open requests: a symbol per type plus the house label, homes waiting more than 24 h marked. Not colour alone.
- **Flags.** Each rule result carries its plain reason:
  - Check with mechanic: "Truck 2 · heater · reported 3 times in 7 days", with those three reports listed.
  - Snow clearing today: from road-blocked reports, with where.
  - House repair list: frozen fill pipe, leaking tank, and so on, per house.
  - A new flag has to be noticeable on a projector, because one appears live during the pitch.
- **Needs a human.** Voice notes the AI wasn't sure about or a driver left for review. Play the audio, read the transcript, fill in the fields, confirm.
- **Activity feed.** Confirmed log entries and stops, newest first: time, truck, house, what happened. Voice-note entries show the summary, with the audio and transcript available. New items arrive visibly; in the demo a resident's tap shows up here within seconds.
- **Water-sample lookup.** "Which homes got water between [date and time] and [date and time]?" with quick picks ("Since Tuesday", "Last 7 days"). Results: houses, delivery times, truck, litres, a count of homes, Copy list, Export CSV. This exists for the day a sample from Montreal comes back with E. coli and staff need an advisory and flush list for exactly the homes served from that load.
- **Weekly numbers.** This week and earlier weeks: deliveries made, couldn't-deliver count, homes that waited more than 24 h, truck-down days. CSV export. This is evidence for the mayor's pipeline funding case, so it should survive being screenshotted or printed.

### 4.5 Simulation (`/sim`)

**Who.** Judges and audience watching a projector for about 60 seconds while the presenter talks. Also judges alone on laptops and phones afterwards.
**Job.** Show what changes when requests are known before trucks leave, under the failures this community actually lives through, and be believable while doing it.

- **Simulation label.** "Simulation · assumed numbers", always visible, linking to the assumptions.
- **Two panes, same village, same events, in lockstep.** "Today" (door lights only) and "With Imaq". Each title says in plain words what's different, for example "Trucks drive the village to spot lit doors, go back to fill up, then deliver" against "Most homes ask from their phone. Trucks still spot lit doors for homes without the app."
- **Village map, one per pane.** Top-down and scaled down (48 homes, labelled as scaled down), with roads, the water plant and the garage.
  - Houses show tank level, door light on, dry (empty tank), and just delivered. On the Imaq side, whether the home uses the app, kept subtle.
  - Trucks move along the roads with their number. States: scouting (Today side only), going to the plant, filling, delivering, returning, broken down at the garage, and held by the blizzard.
  - Every state is distinguishable without colour. Dry houses and lit doors are the two that matter most and have to read from the back row.
- **Blizzard.** An overlay across both panes that says "Blizzard · no deliveries" in words.
- **Clock and timeline.** Day and time of day, and progress through the 7 days with markers for the scripted events: Truck 2 breaks, Truck 3 breaks, blizzard, trucks return. Jumping to a marker is a should.
- **Live counters, per pane, big.** Homes without water now, household-hours without water so far, kilometres driven, deliveries made, oldest waiting request. Same order on both sides and aligned, so the eye compares across.
- **Event ticker.** Simulated app activity on the Imaq side: residents tapping, lit doors being marked, a messy voice-note quote turning into a structured entry with a check mark, and the "third heater report this week: check with mechanic" flag appearing before Truck 2 breaks. It has to be readable at pitch speed, so key moments hold long enough to read.
- **Controls.** Play and pause, speed (including a pitch speed that fits the week into about 60 seconds), restart. Keyboard operable, with space for play and pause.
- **Legend.** Every symbol explained.
- **Assumptions panel.** Every parameter with its value and its source (study, presenter, or our assumption).
- **End summary.** Side-by-side totals, worded as "in this simulation, with these assumptions", plus Replay.
- **For screen readers.** A text summary updated once per simulated day, not every frame.
- **On a phone.** Panes stacked or switchable, and the counters still easy to compare.
- **Should, if time allows.** Editable parameters (app adoption, trucks, capacity, tank sizes, breakdown days, blizzard day), buttons to break a truck or start a blizzard by hand, and full screen for one pane.

### 4.6 QR sheet (`/qr`)

A printable page (Letter and A4) with one QR code per house, each with the house label and a short instruction ("Scan to ask for water"). Think of each one as the sticker that goes on a real door. It may also mention that the door light still works. Large codes, high contrast. In the demo, one of these gets taped to a cardboard "door" and scanned live.

### 4.7 Demo stage (`/stage`, should)

One projector screen showing the live loop at once: the resident phone, the driver phone and the office screen side by side, each a real running copy of the app, the two phones in simple frames. The driver frame has a visible offline switch as a fallback in case the venue network can't be trusted. The real phone in airplane mode stays the preferred way to show offline. Keep the framing minimal; the apps are the content.

---

## 5. Shared building blocks

These are likely needed across surfaces. Treat them as one system, with larger variants for the resident and driver apps.

Buttons (primary, secondary, destructive), big action tiles, selectable chips, OK/Problem toggle rows, status badges (icon and word), big-number stats, cards, bottom sheets or dialogs, list rows, the sync indicator, number steppers, timestamps and ages, the village map with house and truck symbols, audio player, recorder, undo bar, empty states, failure messages, date-range picker.

One symbol set, used the same way on the driver app, the office screen and the simulation:

- the four request types
- truck up, truck down
- house states: tank level, light on, dry, just delivered
- sync states
- the three flag types
- AI states: understanding, ready to confirm, needs a human, confirmed

## 6. Words

Keep these meanings and keep them consistent across surfaces. Improve the English if you can, but change it in the strings file so it changes everywhere.

- Request types: Need water soon, Out of water, Emergency, Sewage full
- Request sources: Resident app, Lit door, Office call
- Stop outcomes: Delivered, Couldn't deliver
- Couldn't-deliver reasons: Road blocked, No access, Frozen fill pipe, Truck problem, Other
- Truck: Up (running), Down, Truck back
- Voice notes: Saved on phone, Understanding, Ready to confirm, Needs a human, Confirmed
- Flags: Check with mechanic, Snow clearing, House repair

Tone: short, plain, present tense, for a reader of about age ten. Say what happened and what to do next. Never blame the user. Don't say "AI" on the driver app; the card speaks for itself ("Here's what I understood").

## 7. Data you can show

Design with this information. If a design needs data that isn't listed, flag it rather than assuming it exists.

- **Village.** Name, time zone, trucks running out of total, emergency contact text, rule thresholds.
- **House.** Label, position on the village map, tank size in litres, uses the app or not.
- **Request.** House, type, source, status (open, served, cancelled), when it was made, how long it has waited, earlier attempts with reasons, when it was closed.
- **Place in line** for a house: approximate.
- **Stop.** House, truck, driver initials, litres, outcome with reason, time, sync state (driver app only), attached voice note.
- **Truck.** Label, water or sewage, capacity, up or down, down since, reason, past down durations, last check with time and items.
- **Voice note.** Audio, length, transcript, detected language, the structured fields, needs-a-human or not, state, whether the result came from a stored demo result.
- **Log entry.** Time, truck or house it's about, type, category, how bad, summary, whether it came from a voice note or the office.
- **Flag.** Type, subject, the entries behind it, date.
- **Weekly numbers.** The four stats, per week.
- **Simulation.** Everything listed in 4.5, per pane, per simulated minute.

## 8. What's open

All of this is yours to decide: the visual identity and wordmark, palette, typography, the icon set (Lucide is in the starter, so replace it if you want), every screen's layout, navigation in the driver app, how the village map looks, the simulation's art direction, motion, empty states and any illustration (with the care from section 2), the light and dark approach, how Emergency looks, and the micro-copy.

## 9. Where to spend design effort

Time is short, so in this order:

1. Tokens and primitives (colour, type scale, spacing, the symbol set, buttons, badges). Everything else inherits them, and they're the fastest way to change how the whole product looks.
2. The simulation. It's the centrepiece of the pitch and gets looked at hardest.
3. Driver: today's list, stop, sync status, confirmation card.
4. Resident: the four buttons and request received.
5. Office: trucks, flags, activity feed, water-sample lookup.
6. Hub, QR sheet, stage.

Four moments in the pitch have to land on a projector:

1. A resident taps Out of water, and a new row shows up on the driver's list and the office screen within seconds.
2. The driver, offline, records a messy voice note, reconnects, the sync status goes from "3 saved on phone" to "All synced", the confirmation card appears, and the "check with mechanic" flag shows up on the office screen.
3. Staff ask "which homes got water since Tuesday?" and get a list.
4. In the simulation, after Truck 3 breaks, the two sides' counters pull apart.

---

## Appendix: working in the repo

Skip this if you're producing designs rather than code.

**Stack.** Vite, React and TypeScript. CSS Modules plus CSS custom properties. Lucide icons. SVG for the map and the simulation. No component kit.

**What you own:**

- `web/src/ui/tokens.css` holds every design token (colour, type, spacing, radius, shadow, motion) as CSS variables, for light and dark.
- `web/src/ui/` holds the primitives. Keep exported names and props stable, or update their call sites.
- `web/src/screens/<surface>/*View.tsx` is the presentation of each screen. Each View receives a view model and callbacks from a `use<Screen>()` hook. Restructure Views as much as you like.
- `web/src/sim/render/` is the simulation's drawing. The engine state it reads is typed in `web/src/sim/engine/types.ts`.
- `web/src/i18n/en.ts` is every string. Add and edit keys there, never inline text.

**What you don't touch:** `web/src/data/`, the `use<Screen>()` hooks, `web/src/sim/engine/`, `shared/`, `worker/`. If a View needs data the hook doesn't provide, leave a `// NEEDS:` comment and say so; the build session adds it.

**Git.** Work on the `ui` branch in your own worktree and merge into `main` early and often, tokens first. The build session merges `main` into its branches continuously, so small merges stay painless.
