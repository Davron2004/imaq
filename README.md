# Imaq

Water delivery for truck-served communities in Nunavik. Built at Hack for Humanity Ottawa 2026 for the "Water in Canada's North" challenge.

**Live demo:** https://imaq.davron-jabborov.workers.dev (no account needed; each visitor gets a private copy of a fictional demo village)

In most Nunavik villages, water comes by truck to a tank in each house. To ask for water, a household turns on a light by the door. A driver drives the whole village to see which lights are on, goes back, fills up at the plant, then drives the village again to deliver. Imaq removes that scouting lap:

- **Residents** scan a QR code on their door and tap Need water soon, Out of water, Emergency or Sewage full. No account, no app store.
- **Drivers** get an offline-first app: today's list with total litres and truckloads before they fill, one-tap Delivered / Couldn't deliver, lit doors for homes without the app, truck checks and breakdowns, and voice notes that become log entries after the driver confirms them.
- **The water office** gets one screen: trucks up and down with their history, who's waiting, flags from plain rules, and "which homes got water between these dates?" for when a water sample comes back bad.
- **A simulation** runs the same village side by side, with and without Imaq, through a week with breakdowns and a blizzard. It's labelled as a simulation with assumed numbers, and every assumption is listed with its source.

The door light keeps working. If Imaq is down, the village works exactly as it does today.

## How it's built

| Part | What |
|---|---|
| Web app | Vite, React, TypeScript; one installable PWA with routes for hub, resident, driver, office, simulation |
| Offline | Service worker app shell; IndexedDB (Dexie) outbox with ids generated on the phone, so re-sent batches never duplicate |
| API | Cloudflare Worker (Hono) serving the app and `/api` |
| Data | Cloudflare D1 (SQLite); every record belongs to a village |
| AI | Workers AI: Whisper large v3 turbo for speech, Llama 3.3 70B in JSON-schema mode to structure the note. Server-side only. A person confirms every result; the original audio and transcript are kept. |
| Rules | `shared/rules.ts`: plain functions (queue order, loads, waiting too long, recurring truck problem, snow clearing, house repairs) |
| Simulation | `web/src/sim/engine`: seeded, deterministic, runs entirely in the browser |

Everything runs on free tiers. $0.

## Run it locally

```sh
npm install
npx wrangler d1 migrations apply imaq --local
npm run dev          # http://localhost:5173
npm test             # unit tests (rules, sync idempotency, simulation determinism)
npm run e2e          # Playwright, against the dev server
```

The Workers AI binding needs a Cloudflare login (`npx wrangler login`); without it, voice notes fall back to "needs a human" (or the stored results for the demo samples).

## Docs

- `imaq-build-brief.md`: the problem, the principles, and what the product must do
- `docs/build-plan.md`: architecture and build plan
- `docs/ui-handoff.md`: what the interface must do and its hard constraints

## Licence

MIT
