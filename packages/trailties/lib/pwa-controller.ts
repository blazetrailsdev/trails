import "./constants.pwa-controller.generated.js";
import { ActionController } from "@blazetrails/actionpack";
import { ApplicationController } from "./application-controller.js";
import { Trails } from "./trails.js";

type PWARenderOptions = ActionController.RenderOptions & { template?: string };

export class PwaController extends ApplicationController {
  static override controllerPath(): string {
    return "trails/pwa";
  }

  static {
    this.skipForgeryProtection();
  }

  async serviceWorker(): Promise<void> {
    await this.render({ template: "pwa/service-worker", layout: false });
  }

  async manifest(): Promise<void> {
    await this.render({ template: "pwa/manifest", layout: false });
  }
}

Trails.PwaController = PwaController;
