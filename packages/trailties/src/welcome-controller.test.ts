import { describe, it, expect } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { WelcomeController } from "./welcome-controller.js";

describe("WelcomeController", () => {
  it("controllerPath mirrors Rails::WelcomeController (`rails/welcome`)", () => {
    expect(WelcomeController.controllerPath()).toBe("rails/welcome");
  });

  it("disables the layout (mirrors Rails `layout false`)", () => {
    expect(WelcomeController.layout).toBe(false);
  });

  // Rails' `Rails::WelcomeController#index` is an empty method that relies on
  // implicit render finding `rails/welcome/index`. With no resolver configured
  // there is no template, and `ImplicitRender#default_render` raises for a
  // non-XHR HTML GET — `MissingExactTemplate`, per
  // vendor/rails/actionpack/lib/action_controller/metal/implicit_render.rb:46-48.
  // Before implicit render was wired up this returned an empty 200.
  it("index raises MissingExactTemplate when no template resolver is configured", async () => {
    class WelcomeControllerTest extends ActionController.TestCase {}
    WelcomeControllerTest.tests(WelcomeController);
    const t = new WelcomeControllerTest(WelcomeController);
    await expect(t.get("index")).rejects.toThrow(/is missing a template/);
  });
});
