import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { SolidCable } from "./solid-cable.js";

export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(SolidCable);

    this.initializer("solid_cable.config", () => SolidCable.loadCableConfig());
  }
}
