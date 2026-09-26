import { useState } from "react";
import { SimErrorBoundary } from "../../sim/render/ErrorBoundary";
import SimView from "./SimView";

/** `/sim` route. The error boundary remounts the whole view (fresh engine) on Restart. */
export default function SimScreen() {
  const [mount, setMount] = useState(0);
  return (
    <SimErrorBoundary onRestart={() => setMount((m) => m + 1)}>
      <SimView key={mount} />
    </SimErrorBoundary>
  );
}
