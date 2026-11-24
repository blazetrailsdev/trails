import "./boot.ts";

import { Bundler, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

// Pick the frameworks you want:
import "@blazetrails/trailties/trailties/active-record";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/action-view";
import "@blazetrails/trailties/test-unit/trailtie";
import "@blazetrails/actioncable/engine";
import "@blazetrails/turbo/engine";

// Require the gem ports listed in package.json, including any ports
// you've limited to :test, :development, or :production.
await Bundler.require(...Trails.groups());

export const ReadingList = constSet(TopLevel, "ReadingList", {});

export class Application extends Trails.Application {
  static {
    constSet(ReadingList, "Application", this);
    Trails.Application.register(this, import.meta.dirname);

    // Initialize configuration defaults for originally generated trails version.
    this.config.loadDefaults("8.0");

    // Please, add to the `ignore` list any other `lib` subdirectories that do
    // not contain `.ts` files, or that should not be reloaded or eager loaded.
    // Common ones are `templates`, `generators`, or `middleware`, for example.
    this.config.autoloadLib({ ignore: ["assets", "tasks"] });

    // Configuration for the application, engines, and trailties goes here.
    //
    // These settings can be overridden in specific environments using the files
    // in config/environments, which are processed later.
    //
    // config.timeZone = "Central Time (US & Canada)";
    // config.eagerLoadPaths.push("extras");
  }
}

declare module "@blazetrails/trailties" {
  interface ApplicationRegistry {
    application: Application;
  }
}
