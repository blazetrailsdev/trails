import { describe, it, expect } from "vitest";
import { ActionMailer } from "@blazetrails/actionmailer";
import { Trailtie as BaseTrailtie } from "../../lib/trailtie.js";
import { Trailtie } from "../../lib/trailties/action-mailer.js";

describe("ActionMailer::Railtie class body", () => {
  it("pushes ActionMailer onto the shared eager-load namespace list", () => {
    expect(Trailtie.config.eagerLoadNamespaces).toContain(ActionMailer);
  });

  it("ActionMailer::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("starts config.action_mailer with empty preview paths", () => {
    expect(Trailtie.config.actionMailer.previewPaths).toEqual([]);
  });

  it("declares the action_mailer initializers in Rails order", () => {
    expect([...Trailtie.initializers].map((i) => i.name)).toEqual([
      "action_mailer.deprecator",
      "action_mailer.logger",
      "action_mailer.set_configs",
      "action_mailer.set_autoload_paths",
      "action_mailer.compile_config_methods",
      "action_mailer.base",
    ]);
  });
});
