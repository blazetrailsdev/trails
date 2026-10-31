import { onLoad } from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";
import type { Base } from "@blazetrails/activerecord";
import "@blazetrails/trailties/trailties/active-job";
import "@blazetrails/trailties/trailties/active-record";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { ActiveStorage } from "./active-storage.js";
import { Model } from "./attached/model.js";
import { ActiveRecordExtensions } from "./reflection.js";

export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(ActiveStorage as never);

    this.initializer("active_storage.attached", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, Model);
      });
    });

    this.initializer("active_storage.reflection", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, ActiveRecordExtensions);
      });
    });
  }
}
