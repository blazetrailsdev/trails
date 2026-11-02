import {
  OrderedOptions,
  InheritableOptions,
  onLoad,
  runLoadHooks,
} from "@blazetrails/activesupport";
import { File, include, prepend, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { Reflection, type Base } from "@blazetrails/activerecord";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/active-job";
import "@blazetrails/trailties/trailties/active-record";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { ActiveStorage } from "./active-storage.js";
import { Model } from "./attached/model.js";
import { ActiveRecordExtensions, ReflectionExtension } from "./reflection.js";

export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(ActiveStorage);

    this.config.paths().add("config/routes.ts", {
      with: File.join(import.meta.dirname, "config", `routes${File.extname(import.meta.filename)}`),
    });

    const activeStorage = new OrderedOptions() as unknown as { [k: string]: unknown };
    this.config.set("activeStorage", activeStorage);
    activeStorage.paths = new OrderedOptions();
    activeStorage.queues = new InheritableOptions();
    activeStorage.precompileAssets = true;

    this.initializer("active_storage.attached", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, Model);
      });
    });

    this.initializer("active_storage.reflection", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, ActiveRecordExtensions);
        prepend(rbObjSingletonClass(Reflection), ReflectionExtension);
        runLoadHooks("active_storage_reflection", Reflection);
      });
    });
  }
}
