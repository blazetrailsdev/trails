import { describe, it, expect } from "vitest";
import { RouteSet } from "@blazetrails/actionpack";
import { TestCase } from "@blazetrails/actionpack/testing";
import { WelcomeController } from "../lib/welcome-controller.js";

describe("WelcomeController", () => {
  it("controllerPath mirrors Trails::WelcomeController (`trails/welcome`)", () => {
    expect(WelcomeController.controllerPath()).toBe("trails/welcome");
  });

  it("disables the layout (mirrors Rails `layout false`)", () => {
    expect(WelcomeController._layout).toBe(false);
  });

  it("index renders the shipped welcome page", async ({ task }) => {
    class WelcomeControllerTest extends TestCase {}
    WelcomeControllerTest.tests(WelcomeController);
    const t = new WelcomeControllerTest(task.name);
    await t.beforeSetup();
    t.routes = new RouteSet();
    t.routes.draw(function () {
      this.root({ to: "trails/welcome#index" });
    });
    await t.get("index");
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("<title>Trails");
  });
});
