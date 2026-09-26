/**
 * Every interface string lives here. Keys are namespaced by surface
 * (app., time., hub., resident., driver., office., sim., qr., stage., common.).
 * Append-only while several people are editing: add keys at the end of your
 * surface's block rather than reordering.
 */
export const en = {
  // app
  "app.name": "Imaq",
  "app.comingSoon": "This screen is being built.",

  // time
  "time.minutes_one": "{count} min",
  "time.minutes_other": "{count} min",
  "time.hours_one": "{count} h",
  "time.hours_other": "{count} h",
  "time.days_one": "{count} day",
  "time.days_other": "{count} days",

  // common: request types, sources, outcomes (canonical words, see docs/ui-handoff.md §6)
  "common.request.soon": "Need water soon",
  "common.request.out": "Out of water",
  "common.request.emergency": "Emergency",
  "common.request.sewage": "Sewage full",
  "common.source.resident": "Resident app",
  "common.source.lit_door": "Lit door",
  "common.source.office": "Office call",
  "common.outcome.delivered": "Delivered",
  "common.outcome.failed": "Couldn't deliver",
  "common.reason.road_blocked": "Road blocked",
  "common.reason.no_access": "No access",
  "common.reason.frozen_pipe": "Frozen fill pipe",
  "common.reason.truck_problem": "Truck problem",
  "common.reason.other": "Other",
  "common.truck.up": "Running",
  "common.truck.down": "Down",
  "common.truck.water": "Water",
  "common.truck.sewage": "Sewage",
  "common.flag.mechanic": "Check with mechanic",
  "common.flag.snow": "Snow clearing",
  "common.flag.repair": "House repair",
  "common.logType.truck_problem": "Truck problem",
  "common.logType.couldnt_deliver": "Couldn't deliver",
  "common.logType.house_problem": "House problem",
  "common.logType.road_blocked": "Road blocked",
  "common.logType.other": "Other",
  "common.category.starting": "Starting",
  "common.category.heater": "Heater",
  "common.category.pump": "Pump",
  "common.category.hose": "Hose",
  "common.category.tires": "Tires",
  "common.category.brakes": "Brakes",
  "common.category.other": "Other",
  "common.severity.fine": "Fine to drive",
  "common.severity.care": "Drive with care",
  "common.severity.cant_drive": "Can't drive",
  "common.voice.saved": "Saved on phone",
  "common.voice.understanding": "Understanding",
  "common.voice.ready": "Ready to confirm",
  "common.voice.needs_human": "Needs a human",
  "common.voice.confirmed": "Confirmed",
  "common.simLabel": "Simulation · assumed numbers",
} as const;
