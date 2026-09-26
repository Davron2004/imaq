import type { ReactNode } from "react";
import { useHub } from "../../data/hub";
import { useOffice } from "../../data/office";
import type { Snapshot } from "../../../../shared/types";
import HubView from "./HubView";

/** Reads the visitor's village snapshot (hero map, stat strip). Mounted only once the village exists. */
function WithSnapshot({ villageId, children }: { villageId: string; children: (snapshot: Snapshot | null) => ReactNode }) {
  const { snapshot } = useOffice(villageId);
  return <>{children(snapshot)}</>;
}

export default function HubScreen() {
  const { villageId, state, reset, qrHouses, myHouseToken } = useHub();
  const render = (snapshot: Snapshot | null) => (
    <HubView villageId={villageId} state={state} onReset={reset} qrHouses={qrHouses} myHouseToken={myHouseToken} snapshot={snapshot} />
  );
  // Don't poll a village that is still being created.
  if (state === "creating") return render(null);
  return (
    <WithSnapshot key={villageId} villageId={villageId}>
      {render}
    </WithSnapshot>
  );
}
