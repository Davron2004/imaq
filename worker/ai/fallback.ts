/**
 * Stored results for the three pre-recorded demo samples (public/demo-audio/), used only when the
 * AI service is unreachable or too slow during a demo. The draft is marked source = "fallback" and
 * the confirmation card shows that. Fields use labels; process.ts maps them to this village's ids.
 */
export interface StoredDraft {
  fields: { truck: string | null; house: string | null; type: string; category: string | null; severity: string | null; summary: string };
  transcript: string;
  language: string;
  confidence: number;
  needsHuman: boolean;
}

export const FALLBACK_DRAFTS: Record<string, StoredDraft> = {
  "heater-truck2": {
    fields: {
      truck: "Truck 2",
      house: null,
      type: "truck_problem",
      category: "heater",
      severity: "care",
      summary: "Heater grinding again, barely blowing warm; still drivable",
    },
    transcript:
      "Uh, yeah, it's truck 2 again, the heater's making that noise, like a grinding, same as last week. It's still blowing warm but only barely. I can drive it but, you know, somebody should look at it. Okay.",
    language: "en",
    confidence: 0.9,
    needsHuman: false,
  },
  "road-blocked-22": {
    fields: {
      truck: null,
      house: "House 22",
      type: "road_blocked",
      category: null,
      severity: null,
      summary: "Road past House 22 blocked by a drift; couldn't reach 22 or 23",
    },
    transcript:
      "The road past house 22 is blocked, there's a big drift, c'est complètement bloqué, I couldn't get to 22 or 23. Going around the other way.",
    language: "en",
    confidence: 0.85,
    needsHuman: false,
  },
  unclear: {
    fields: { truck: null, house: null, type: "other", category: null, severity: null, summary: "Unclear note" },
    transcript: "Yeah the thing's doing it again, I don't know, whatever, I'll tell him later.",
    language: "en",
    confidence: 0.2,
    needsHuman: true,
  },
};
