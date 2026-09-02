import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Base } from "./base.js";
import { Trailtie, defaultActionViewConfig } from "./trailtie.js";
import { Deprecators, Trailtie as BaseTrailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

async function runInitializers(app?: unknown): Promise<void> {
  for (const initializer of Trailtie.instance().initializers) await initializer.run(app);
}


let deprecators: Deprecators;
let app: { deprecators: Deprecators };

describe("RailtieTest", () => {

  beforeEach(() => {
    deprecators = new Deprecators();
    app = { deprecators };
  });

  const originalAnnotate = Base.annotateRenderedViewWithFilenames;

  afterEach(() => {
    Base.annotateRenderedViewWithFilenames = originalAnnotate;
    (
      Trailtie.config.get("actionView") as ReturnType<typeof defaultActionViewConfig>
    ).annotateRenderedViewWithFilenames = false;
  });

  it("ActionView::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("seeds the actionView config slot with Rails-matching defaults", () => {
    expect(Trailtie.config.get("actionView")).toEqual(defaultActionViewConfig());
  });

  it("runInitializers registers the ActionView deprecator", async () => {
    await runInitializers(app);
    expect(deprecators.get("actionView")).toBe(deprecator());
  });

  it("runInitializers applies annotateRenderedViewWithFilenames config to Base", async () => {
    (
      Trailtie.config.get("actionView") as ReturnType<typeof defaultActionViewConfig>
    ).annotateRenderedViewWithFilenames = true;
    await runInitializers(app);
    expect(Base.annotateRenderedViewWithFilenames).toBe(true);
  });
});
