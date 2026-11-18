import { TopLevel } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { Stimulus } from "./stimulus-trails.js";

export class Engine extends TrailsEngine {
  static readonly PRECOMPILE_ASSETS = Object.freeze([
    "stimulus.js",
    "stimulus.min.js",
    "stimulus.min.js.map",
  ]);

  static {
    Stimulus.Engine = this;

    TrailsEngine.register(this, import.meta.dirname);

    /** @inventedArm add — PERMANENT */
    this.config.paths().add("lib/tasks", {
      with: File.join(import.meta.dirname, "tasks"),
      glob: `*${File.extname(import.meta.filename)}`,
    });

    this.initializer("stimulus.assets", () => {
      const config = TopLevel.Trails!.application!.config as unknown as {
        isRespondTo(name: string): boolean;
        get(name: string): unknown;
      };
      if (config.isRespondTo("assets")) {
        const assets = config.get("assets") as { precompile: string[] };
        assets.precompile = [...assets.precompile, ...Engine.PRECOMPILE_ASSETS];
      }
    });
  }
}
