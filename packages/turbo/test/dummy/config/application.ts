import { Application } from "@blazetrails/trailties";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/active-job";
import "@blazetrails/trailties/trailties/active-record";

export class Dummy extends Application {
  static {
    Application.register(this, import.meta.dirname);

    this.config.loadDefaults("7.1");
  }
}
