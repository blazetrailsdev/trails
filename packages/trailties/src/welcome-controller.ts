// Rails source: railties/lib/rails/welcome_controller.rb
//
// Default landing page shown by `bin/rails server` on a fresh app. Renders
// `templates/rails/welcome/index.tse` with no layout.
//
// Like PWAController, this extends ActionController.Base directly until
// PR 1.7 ports Rails::ApplicationController.

import { ActionController } from "@blazetrails/actionpack";

export class WelcomeController extends ActionController.Base {
  // Rails: Rails::WelcomeController.controller_path == "rails/welcome",
  // which aligns LookupContext with the shipped template path at
  // packages/trailties/src/templates/rails/welcome/index.tse.
  static override controllerPath(): string {
    return "rails/welcome";
  }

  static override layout: string | false = false;

  index(): void {}
}

WelcomeController.skipBeforeAction("verifyAuthenticityToken");
