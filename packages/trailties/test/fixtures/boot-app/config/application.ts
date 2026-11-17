import { Application } from "../../../../lib/application.js";

import "../../../../lib/all.js";

export class BootApp extends Application {
  static {
    Application.register(this, import.meta.dirname);

    this.config.x.boot.setting = "set at boot";
  }
}
