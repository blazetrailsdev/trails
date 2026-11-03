export { Trails } from "./rails.js";
export type { ApplicationRegistry } from "./rails.js";
export { Application } from "./application.js";
export { Engine } from "./engine.js";
export { Trailtie } from "./trailtie.js";

import "./constants.generated.js";
import { TopLevel } from "@blazetrails/ruby-compat";
import { HealthController } from "./health-controller.js";
import { InfoController } from "./info-controller.js";
import { PwaController } from "./pwa-controller.js";
import { Trails } from "./rails.js";
import { WelcomeController } from "./welcome-controller.js";
export { ZeitwerkChecker } from "./zeitwerk-checker.js";

Trails.HealthController = HealthController;
Trails.InfoController = InfoController;
Trails.PwaController = PwaController;
Trails.WelcomeController = WelcomeController;
TopLevel.Rails = Trails;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Rails?: typeof Trails;
  }
}
