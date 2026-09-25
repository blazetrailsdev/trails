import { Application } from "../src/application.js";

import "../src/all.js";

export class BlogApplication extends Application {
  static {
    this.config.loadDefaults("8.0");
  }
}
