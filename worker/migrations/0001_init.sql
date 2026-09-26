-- Imaq schema. Every row carries village_id. Ids created on a phone are UUIDs from the phone,
-- so INSERT OR IGNORE makes re-sent batches no-ops.

CREATE TABLE villages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  config TEXT NOT NULL,              -- JSON VillageConfig
  is_sandbox INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE houses (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  tank_litres INTEGER NOT NULL DEFAULT 1200,
  uses_app INTEGER NOT NULL DEFAULT 1,
  qr_token TEXT NOT NULL UNIQUE
);
CREATE INDEX houses_village ON houses(village_id);

CREATE TABLE trucks (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('water','sewage')),
  capacity_litres INTEGER NOT NULL DEFAULT 13600,
  status TEXT NOT NULL DEFAULT 'up' CHECK (status IN ('up','down'))
);
CREATE INDEX trucks_village ON trucks(village_id);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('soon','out','emergency','sewage')),
  source TEXT NOT NULL CHECK (source IN ('resident','lit_door','office')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','served','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX requests_village_status ON requests(village_id, status);
CREATE INDEX requests_house ON requests(house_id, status);

CREATE TABLE stops (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  truck_id TEXT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  request_id TEXT,
  driver_initials TEXT,
  litres INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL CHECK (outcome IN ('delivered','failed')),
  reason TEXT,
  voice_note_id TEXT,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  voided_at INTEGER
);
CREATE INDEX stops_village_time ON stops(village_id, occurred_at);

CREATE TABLE truck_checks (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  truck_id TEXT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  items TEXT NOT NULL,               -- JSON { starts: bool, ... } true = OK
  passed INTEGER NOT NULL,
  voice_note_id TEXT,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX truck_checks_truck ON truck_checks(truck_id, occurred_at);

CREATE TABLE truck_status_events (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  truck_id TEXT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('down','back')),
  reason TEXT,
  voice_note_id TEXT,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX truck_status_truck ON truck_status_events(truck_id, occurred_at);

CREATE TABLE voice_notes (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  truck_id TEXT,
  house_id TEXT,
  context TEXT NOT NULL DEFAULT 'free',
  sample_id TEXT,                    -- set for the pre-recorded demo samples (enables stored fallback)
  audio BLOB,
  mime TEXT NOT NULL,
  duration_s REAL NOT NULL DEFAULT 0,
  transcript TEXT,
  language TEXT,
  draft TEXT,                        -- JSON VoiceDraft
  draft_source TEXT,                 -- 'ai' | 'fallback' | 'none'
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','ready','needs_human','confirmed')),
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE INDEX voice_notes_village ON voice_notes(village_id, created_at);

CREATE TABLE log_entries (
  id TEXT PRIMARY KEY,               -- = voice_note_id when it came from a voice note
  village_id TEXT NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  voice_note_id TEXT,
  about_truck_id TEXT,
  about_house_id TEXT,
  type TEXT NOT NULL,
  category TEXT,
  severity TEXT,
  summary TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('voice','office')),
  occurred_at INTEGER NOT NULL,
  confirmed_at INTEGER NOT NULL
);
CREATE INDEX log_entries_village_time ON log_entries(village_id, occurred_at);
