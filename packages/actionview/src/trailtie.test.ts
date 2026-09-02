import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Base } from "./base.js";
import { Trailtie, defaultActionViewConfig } from "./trailtie.js";
import { Trailtie as BaseTrailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

const { deprecators } = BaseTrailtie;

describe("RailtieTest", () => {
  let savedSubclasses: (typeof BaseTrailtie)[];

  beforeEach(() => {
    savedSubclasses = [...BaseTrailtie.subclasses];
  });

  const originalAnnotate = Base.annotateRenderedViewWithFilenames;

  afterEach(() => {
    BaseTrailtie.subclasses.length = 0;
    BaseTrailtie.subclasses.push(...savedSubclasses);
    for (const key of Object.keys(deprecators)) {
      delete deprecators[key];
    }
    Base.annotateRenderedViewWithFilenames = originalAnnotate;
    (
      Trailtie.config["actionView"] as ReturnType<typeof defaultActionViewConfig>
    ).annotateRenderedViewWithFilenames = false;
  });

  it("ActionView::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses).toContain(Trailtie);
  });

  it("seeds the actionView config slot with Rails-matching defaults", () => {
    expect(Trailtie.config["actionView"]).toEqual(defaultActionViewConfig());
  });

  it("runInitializers registers the ActionView deprecator", () => {
    Trailtie.runInitializers();
    expect(deprecators["actionView"]).toBe(deprecator());
  });

  it("runInitializers applies annotateRenderedViewWithFilenames config to Base", () => {
    (
      Trailtie.config["actionView"] as ReturnType<typeof defaultActionViewConfig>
    ).annotateRenderedViewWithFilenames = true;
    Trailtie.runInitializers();
    expect(Base.annotateRenderedViewWithFilenames).toBe(true);
  });
});
