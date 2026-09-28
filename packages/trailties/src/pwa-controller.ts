import { ActionController, controllerConstants } from "@blazetrails/actionpack";
import { ApplicationController } from "./application-controller.js";

type PWARenderOptions = ActionController.RenderOptions & { template?: string };

export class PWAController extends ApplicationController {
  static override controllerPath(): string {
    return "rails/pwa";
  }

  serviceWorker(): void {
    this.render({ template: "pwa/service-worker", layout: false } as PWARenderOptions);
  }

  manifest(): void {
    this.render({ template: "pwa/manifest", layout: false } as PWARenderOptions);
  }
}

PWAController.skipBeforeAction("verifyAuthenticityToken", { raise: false });

controllerConstants.set("rails/pwa", PWAController);
