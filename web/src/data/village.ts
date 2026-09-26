/**
 * Which village this browser is working in. The presenter village is "demo";
 * the hub creates a private sandbox copy per visitor and stores its id here.
 */
const KEY = "imaq.villageId";
export const PRESENTER_VILLAGE_ID = "demo";

export function currentVillageId(): string {
  try {
    return localStorage.getItem(KEY) || PRESENTER_VILLAGE_ID;
  } catch {
    return PRESENTER_VILLAGE_ID;
  }
}

export function setCurrentVillageId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode: stays on the presenter village */
  }
}
