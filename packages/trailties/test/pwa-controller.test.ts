import { describe, it, expect, vi } from "vitest";
import { PwaController } from "../lib/pwa-controller.js";

function captureRender(c: PwaController): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  vi.spyOn(c, "render").mockImplementation(spy);
  return spy;
}

describe("PWAController", () => {
  it("controllerPath mirrors Trails::PwaController (`trails/pwa`)", () => {
    expect(PwaController.controllerPath()).toBe("trails/pwa");
  });

  it("service_worker renders the pwa/service-worker template without a layout", () => {
    const c = new PwaController();
    const render = captureRender(c);
    c.serviceWorker();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ template: "pwa/service-worker", layout: false });
  });

  it("manifest renders the pwa/manifest template without a layout", () => {
    const c = new PwaController();
    const render = captureRender(c);
    c.manifest();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ template: "pwa/manifest", layout: false });
  });
});

describe("skip_forgery_protection", () => {
  it.each([
    ["./pwa-controller.js", "PwaController"],
    ["./welcome-controller.js", "WelcomeController"],
  ])("%s calls skipForgeryProtection in its class body", async (file, name) => {
    vi.resetModules();
    const { ActionController } = await import("@blazetrails/actionpack");
    const spy = vi.spyOn(ActionController.Base, "skipForgeryProtection");
    try {
      const mod = (await import(file)) as Record<string, unknown>;
      expect(spy.mock.contexts).toContain(mod[name]);
    } finally {
      spy.mockRestore();
    }
  });
});
