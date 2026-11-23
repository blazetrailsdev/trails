import { Application } from "@blazetrails/trailties";
import "@blazetrails/trailties/trails";
import "@blazetrails/trailties/trailties/active-record";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/action-view";

export class BrowserApp extends Application {
  static {
    Application.register(this, import.meta.dirname);
    this.config.loadDefaults("8.0");
    this.config.eagerLoad = false;
    this.config.considerAllRequestsLocal = true;
  }
}

declare module "@blazetrails/trailties" {
  interface ApplicationRegistry {
    application: BrowserApp;
  }
}
