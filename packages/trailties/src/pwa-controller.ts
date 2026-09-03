import { ActionController } from "@blazetrails/actionpack";

type PWARenderOptions = ActionController.RenderOptions & { template?: string };

export class PWAController extends ActionController.Base {
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

PWAController.skipBeforeAction("verifyAuthenticityToken");
