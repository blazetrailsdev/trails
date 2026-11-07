import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/active-job";
import "@blazetrails/trailties/trailties/active-record";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import "@blazetrails/activestorage/engine";
import { File } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "./action-mailbox.js";

export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(ActionMailbox);

    this.config.paths().add("lib/tasks", {
      with: File.join(import.meta.dirname, "tasks"),
      glob: `*${File.extname(import.meta.filename)}`,
    });
  }
}
