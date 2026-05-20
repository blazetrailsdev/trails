// Rails source: railties/lib/rails/pwa_controller.rb
//
// Serves /service-worker.js and /manifest.webmanifest by rendering the
// app-provided `pwa/service-worker` and `pwa/manifest` templates.
//
// In Rails this extends `Rails::ApplicationController`. That class is
// deferred to PR 1.7 (InfoController), so PWAController extends
// ActionController.Base directly and applies `skipBeforeAction` for the
// CSRF check inline (mirrors `skip_forgery_protection`).
//
// NOTE: Base.render() doesn't yet honor the `template:` option — the
// option is forwarded for Rails-faithful intent, but actual template
// lookup needs `lookupContext` wiring (Phase 2.x).

import { ActionController } from "@blazetrails/actionpack";

type PWARenderOptions = ActionController.RenderOptions & { template?: string };

export class PWAController extends ActionController.Base {
  // Rails: Rails::PwaController.controller_path == "rails/pwa".
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
