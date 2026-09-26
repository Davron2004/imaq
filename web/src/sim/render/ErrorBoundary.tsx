import { Component, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "../../ui";
import { t } from "../../i18n";
import s from "./sim.module.css";

/** Keeps a drawing error from blanking the demo: shows Restart, which remounts the simulation. */
export class SimErrorBoundary extends Component<{ children: ReactNode; onRestart: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("[sim]", err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={s.error} role="alert">
        <p className={s.simTag}>{t("common.simLabel")}</p>
        <h2>{t("sim.error.title")}</h2>
        <p>{t("sim.error.body")}</p>
        <Button
          size="hero"
          icon={<RotateCcw />}
          onClick={() => {
            this.setState({ failed: false });
            this.props.onRestart();
          }}
        >
          {t("sim.restart")}
        </Button>
      </div>
    );
  }
}
