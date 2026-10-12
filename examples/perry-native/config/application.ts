import { Application } from "@blazetrails/trailties";

// Load the framework trailties this application uses.
import "@blazetrails/trailties/all";

export class PerryNative extends Application {
  static {
    // Initialize configuration defaults for originally generated trails version.
    this.config.loadDefaults("8.0");
  }

  // Configuration for the application, engines, and trailties goes here.
  //
  // These settings can be overridden in specific environments using the files
  // in config/environments, which are processed later.
  //
  // config.timeZone = "Central Time (US & Canada)";
  // config.eagerLoadPaths.push("extras");
}

Application.register(PerryNative, import.meta.dirname);
