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

  it("index dispatches to a 200 with no body when no template resolver is configured", async () => {
    class WelcomeControllerTest extends ActionController.TestCase {}
    WelcomeControllerTest.tests(WelcomeController);
    const t = new WelcomeControllerTest(WelcomeController);
    await t.get("index");
    expect(t.controller.status).toBe(200);
    expect(t.responseBody).toBe("");
  });
});
