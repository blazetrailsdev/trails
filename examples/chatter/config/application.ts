import "./boot.ts";

import { Bundler, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

import "@blazetrails/trailties/all";
import type {} from "@blazetrails/activestorage/engine";
import type {} from "@blazetrails/actionmailbox/engine";
import type {} from "@blazetrails/actiontext/engine";
import type {} from "@blazetrails/actioncable/engine";

// Require the gem ports listed in package.json, including any ports
// you've limited to :test, :development, or :production.
await Bundler.require(...Trails.groups());

export const Chatter = constSet(TopLevel, "Chatter", {});

export class Application extends Trails.Application {
  static {
    constSet(Chatter, "Application", this);
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
