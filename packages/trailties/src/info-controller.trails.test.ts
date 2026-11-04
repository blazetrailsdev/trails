import { describe, expect, it } from "vitest";
import { ApplicationController } from "./application-controller.js";
import { InfoController } from "./info-controller.js";

describe("Trails::InfoController", () => {
  it("derives from Trails::ApplicationController under the trails/info path", () => {
    expect(Object.getPrototypeOf(InfoController)).toBe(ApplicationController);
    expect(InfoController.controllerPath()).toBe("trails/info");
  });

  it("drops the layout for an xhr request and uses application otherwise", () => {
    const layout = InfoController._layout as (this: unknown) => string | false;
    expect(layout.call({ request: { xhr: true } })).toBe(false);
    expect(layout.call({ request: { xhr: false } })).toBe("application");
  });
});
