import { onLoad, type Extended } from "@blazetrails/activesupport";
import { include, prepend, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { Reflection, type Base } from "@blazetrails/activerecord";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/active-job";
import "@blazetrails/trailties/trailties/active-record";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { ActiveStorage } from "./active-storage.js";
import { Model, type ClassMethods } from "./attached/model.js";
import type { Blob } from "./blob.js";
import { ActiveRecordExtensions, ReflectionExtension } from "./reflection.js";

/** @noRailsEquivalent PERMANENT */
function attachPreviewImage(this: typeof Blob): void {
  (this as unknown as Extended<typeof ClassMethods>).hasOneAttached("previewImage");
}

export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(ActiveStorage);

    this.initializer("active_storage.attached", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, Model);
      });
    });

    this.initializer("active_storage.reflection", async () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, ActiveRecordExtensions);
        prepend(rbObjSingletonClass(Reflection), ReflectionExtension);
      });
      onLoad("active_storage_blob", { runOnce: true }, attachPreviewImage);
      await import("./variant-record.js");
    });
  }
}
