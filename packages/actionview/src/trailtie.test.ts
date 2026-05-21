import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trailtie, defaultActionViewConfig } from "./trailtie.js";
import { Railtie as BaseRailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

const { deprecators } = BaseRailtie;

describe("RailtieTest", () => {
  let savedSubclasses: (typeof BaseRailtie)[];

  beforeEach(() => {
    savedSubclasses = [...BaseRailtie.subclasses];
  });

  afterEach(() => {
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).length = 0;
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).push(...savedSubclasses);
    for (const key of Object.keys(deprecators)) {
      delete deprecators[key];
    }
  });

  it("ActionView::Railtie is registered in the global subclasses list", () => {
    expect(BaseRailtie.subclasses).toContain(Trailtie);
  });

  it("seeds the actionView config slot with Rails-matching defaults", () => {
    expect(Trailtie.config["actionView"]).toEqual(defaultActionViewConfig());
  });

  it("runInitializers registers the ActionView deprecator", () => {
    Trailtie.runInitializers();
    expect(deprecators["actionView"]).toBe(deprecator());
  });
});
