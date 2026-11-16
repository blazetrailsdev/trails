import { ActionController } from "@blazetrails/actionpack";
import { onLoad, TopLevel } from "@blazetrails/activesupport";
import { constDefined, include, Pathname } from "@blazetrails/ruby-compat";
import type { Application } from "@blazetrails/trailties";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { ViteAssets } from "@blazetrails/vite-assets";
import { TagHelpers } from "./tag-helpers.js";
import { ViteTrails } from "./vite-trails.js";

export class Engine extends TrailsEngine {
  static {
    ViteTrails.Engine = this;

    TrailsEngine.register(this, decodeURIComponent(new URL(".", import.meta.url).pathname));

    this.initializer("vite_trails.helper", () => {
      onLoad("action_controller", () => {
        ActionController.Base.helper(TagHelpers);
      });

      onLoad("action_view", function (this: abstract new (...args: never[]) => unknown) {
        include(this, TagHelpers);
      });
    });

    this.initializer("vite_trails.logger", () => {
      this.config.afterInitialize(() => {
        ViteAssets.instance().logger = TopLevel.Trails!.logger!;
      });
    });

    /**
     * @missingRailsCall require — PERMANENT
     * @missingRailsCall after_fork — PERMANENT
     * @missingRailsCall watch — PERMANENT
     */
    this.initializer("vite_trails.bootstrap", async () => {
      if (constDefined(TopLevel, "Trails::Server") || constDefined(TopLevel, "Trails::Console")) {
        await ViteAssets.bootstrap();
      }
    });

    this.initializer("vite_trails.set_source", async (app: Application) => {
      const config = await ViteAssets.config();
      const sourceDir = config.root.join(config.sourceCodeDir);
      app.config.javascriptPath = sourceDir
        .relativePathFrom(new Pathname(TopLevel.Trails!.root()!).join("app"))
        .toString();
    });
  }
}
