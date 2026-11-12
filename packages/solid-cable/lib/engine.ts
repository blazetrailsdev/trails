import { isPresent } from "@blazetrails/activesupport";
import { LOAD_PATH } from "@blazetrails/ruby-compat";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { Record } from "./record.js";
import { SolidCable } from "./solid-cable.js";

if (!LOAD_PATH.includes(import.meta.dirname)) LOAD_PATH.push(import.meta.dirname);

/** @inventedArm connectsTo — PERMANENT */
export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(SolidCable);

    this.initializer("solid_cable.config", async () => {
      await SolidCable.loadCableConfig();

      const connectsTo = SolidCable.connectsTo();
      if (isPresent(connectsTo)) await Record.connectsTo(connectsTo);
    });
  }
}
