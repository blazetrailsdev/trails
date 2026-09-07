import { describe, it, expect } from "vitest";
import { include, initialize } from "@blazetrails/activesupport";

import { Model } from "./model.js";

type DynProps = Record<string, unknown>;

describe("ActiveModel::API#initialize seats included modules", () => {
  it("runs an included module's initialize at the api.rb:83 super", () => {
    class Person extends Model {}
    include(Person, {
      [initialize](this: DynProps) {
        this.dbRuntime = null;
      },
    });

    const person = new Person();
    expect(Object.hasOwn(person, "dbRuntime")).toBe(true);
    expect((person as unknown as DynProps).dbRuntime).toBe(null);
  });
});
