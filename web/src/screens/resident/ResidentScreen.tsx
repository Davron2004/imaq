import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useResident } from "../../data/resident";
import ResidentView from "./ResidentView";

const ADD_HOME_KEY = "imaq.residentAddHomeDismissed";

export default function ResidentScreen() {
  const { token = "" } = useParams();
  const state = useResident(token);
  const [showAddHome, setShowAddHome] = useState(false);

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    const prevHref = link.href;
    link.href = `/api/h/${token}/manifest.webmanifest`;
    return () => {
      if (link) link.href = prevHref;
    };
  }, [token]);

  useEffect(() => {
    if (state.status !== "ready") return;
    try {
      if (!localStorage.getItem(ADD_HOME_KEY)) setShowAddHome(true);
    } catch {
      /* private mode */
    }
  }, [state.status]);

  const dismissAddHome = () => {
    setShowAddHome(false);
    try {
      localStorage.setItem(ADD_HOME_KEY, "1");
    } catch {
      /* private mode */
    }
  };

  return (
    <ResidentView
      status={state.status}
      view={state.view}
      sendingTrack={state.sendingTrack}
      sendError={state.sendError}
      pending={state.pending}
      showAddHome={showAddHome}
      onRequestKind={state.requestKind}
      onConfirmPending={state.confirmPending}
      onCancelPendingConfirm={state.cancelPendingConfirm}
      onCancelRequest={state.cancelRequest}
      onRetry={state.retry}
      onDismissAddHome={dismissAddHome}
    />
  );
}
