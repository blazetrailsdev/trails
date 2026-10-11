import { describe, it, expect } from "vitest";
import { rbClassInheritedP, rbClassSuperclass } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import * as models from "./test-helpers/models/index.js";

describe("canonical model seats", () => {
  it("puts every canonical model in its superclass's subclasses", () => {
    const klasses = Object.values(models).filter(
      (klass): klass is typeof Base =>
        typeof klass === "function" && rbClassInheritedP(klass as never, Base) === true,
    );
    const unseated = klasses.filter(
      (klass) => !(rbClassSuperclass(klass) as typeof Base).subclasses.includes(klass),
    );

    expect(klasses.length).toBeGreaterThan(0);
    expect(unseated.map((klass) => klass.name)).toEqual([]);
  });
});
