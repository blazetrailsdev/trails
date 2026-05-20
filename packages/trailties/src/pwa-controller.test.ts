import { describe, it, expect, vi } from "vitest";
import { PWAController } from "./pwa-controller.js";

function captureRender(c: PWAController): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  vi.spyOn(c, "render").mockImplementation(spy);
  return spy;
}

describe("PWAController", () => {
  it("controllerPath mirrors Rails::PwaController (`rails/pwa`)", () => {
    expect(PWAController.controllerPath()).toBe("rails/pwa");
  });

  it("service_worker renders the pwa/service-worker template without a layout", () => {
    const c = new PWAController();
    const render = captureRender(c);
    c.serviceWorker();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ template: "pwa/service-worker", layout: false });
  });

  it("manifest renders the pwa/manifest template without a layout", () => {
    const c = new PWAController();
    const render = captureRender(c);
    c.manifest();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ template: "pwa/manifest", layout: false });
  });
});
