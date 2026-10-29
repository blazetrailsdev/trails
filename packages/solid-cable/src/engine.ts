import { isPresent, onLoad } from "@blazetrails/activesupport";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import type { Record } from "./record.js";
import { SolidCable } from "./solid-cable.js";

/** @inventedArm onLoad — PERMANENT */
export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(SolidCable);

    this.initializer("solid_cable.config", async () => {
      await SolidCable.loadCableConfig();

      onLoad("solid_cable_record", { runOnce: true }, function (this: typeof Record): void {
        if (isPresent(SolidCable.connectsTo())) this.connectsTo(SolidCable.connectsTo());
      });
    });
  }
}
