import { Application } from "@blazetrails/trailties";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/vite-trails";

export class TestApp extends Application {
  static {
    Application.register(this, import.meta.dirname);
  }
}
