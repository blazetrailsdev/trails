import { Application } from "@blazetrails/trailties";

import "@blazetrails/trailties/all";

export class BootApp extends Application {
  static {
    Application.register(this, import.meta.dirname);

    this.config.x.boot.setting = "set at boot";
  }
}
