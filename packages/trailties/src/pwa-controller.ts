import { ActionController, registerController } from "@blazetrails/actionpack";
import { ApplicationController } from "./application-controller.js";

type PWARenderOptions = ActionController.RenderOptions & { template?: string };

export class PwaController extends ApplicationController {
  static override controllerPath(): string {
    return "rails/pwa";
  }

  async serviceWorker(): Promise<void> {
    await this.render({ template: "pwa/service-worker", layout: false } as PWARenderOptions);
  }

  async manifest(): Promise<void> {
    await this.render({ template: "pwa/manifest", layout: false } as PWARenderOptions);
  }
}

PwaController.skipBeforeAction("verifyAuthenticityToken", { raise: false });

registerController("Rails::PwaController", PwaController);
