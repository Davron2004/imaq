/**
 * Voice note → draft log entry. Owned by the orchestrator (docs/build-plan.md §7).
 * Routes call this; it reads the note's audio from D1, transcribes, structures, validates,
 * stores the draft and returns the note. Idempotent: a note that already has a draft is returned as is.
 */
import type { VoiceNoteInfo } from "../../shared/types";

export async function processVoiceNote(env: Env, villageId: string, noteId: string): Promise<VoiceNoteInfo> {
  void env;
  void villageId;
  void noteId;
  throw new Error("processVoiceNote not implemented yet");
}
