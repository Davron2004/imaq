import type { VillageGeometry } from "../../shared/types";

/** Fictional "Demo village" map, metres. Houses are placed along these roads by the seed. */
export const DEMO_GEOMETRY: VillageGeometry = {
  width: 2000,
  height: 1400,
  roads: [
    { id: "main", name: "Main road", points: [[100, 700], [1900, 700]] },
    { id: "shore", name: "Shore road", points: [[300, 250], [1000, 220], [1700, 260]] },
    { id: "west", name: "West road", points: [[500, 250], [500, 1250]] },
    { id: "east", name: "East road", points: [[1300, 240], [1300, 1250]] },
  ],
  plant: { x: 150, y: 760 },
  garage: { x: 1850, y: 760 },
};
