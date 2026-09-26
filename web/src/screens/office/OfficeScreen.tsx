import { useParams, useSearchParams } from "react-router";
import { useOffice, useDeliveryLookup, useWeekly } from "../../data/office";
import OfficeView from "./OfficeView";

export default function OfficeScreen() {
  const { villageId = "demo" } = useParams();
  const state = useOffice(villageId);
  const lookup = useDeliveryLookup(villageId);
  const weekly = useWeekly(villageId);
  // The live demo stage embeds the office in an iframe; there the site header would only take space.
  const [params] = useSearchParams();

  return (
    <OfficeView
      status={state.status}
      snapshot={state.snapshot}
      newFlagIds={state.newFlagIds}
      announcement={state.announcement}
      villageId={villageId}
      onAddRequest={state.addRequest}
      onCancelRequest={state.cancelRequest}
      onConfirmLog={state.confirmLog}
      onReset={state.reset}
      resetting={state.resetting}
      onRetry={state.retry}
      lookup={lookup}
      weekly={weekly}
      embedded={params.get("embed") === "1"}
    />
  );
}
