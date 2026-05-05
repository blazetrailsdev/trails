import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trailtie } from "./trailtie.js";
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

  it("ActiveRecord::Railtie is registered in the global subclasses list", () => {
    expect(BaseRailtie.subclasses).toContain(Trailtie);
  });

  it("runInitializers registers the ActiveRecord deprecator", () => {
    Trailtie.runInitializers();
    expect(deprecators["activeRecord"]).toBe(deprecator());
  });
});
