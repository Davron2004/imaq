import { useHub } from "../../data/hub";
import HubView from "./HubView";

export default function HubScreen() {
  const { villageId, state, reset, qrHouses, myHouseToken } = useHub();
  return <HubView villageId={villageId} state={state} onReset={reset} qrHouses={qrHouses} myHouseToken={myHouseToken} />;
}
