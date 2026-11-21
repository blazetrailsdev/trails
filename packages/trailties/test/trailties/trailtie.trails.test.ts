import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { Trailtie, resetTrailtieRegistry } from "../../lib/trailtie.js";
import { Configuration } from "../../lib/trailtie/configuration.js";
import { sealAgainstInheritance } from "../../lib/trailtie/configurable.js";

describe("Trailtie (trails-only)", () => {
  let restoreRegistry: () => void;

  beforeEach(() => {
    restoreRegistry = resetTrailtieRegistry();
  });

  afterEach(() => {
    restoreRegistry();
  });

  it("non-rake block defined in superclass of railtie is also executed", async () => {
    const ran: string[] = [];
    class P extends Trailtie {}
    Trailtie.register(P);
    P.console(() => ran.push("p"));
    class C extends P {}
    Trailtie.register(C);
    await C.instance().runConsoleBlocks({});
    expect(ran).toEqual(["p"]);
  });

  const HOOKS = [
    ["beforeConfiguration", "before_configuration"],
    ["beforeInitialize", "before_initialize"],
    ["beforeEagerLoad", "before_eager_load"],
    ["afterInitialize", "after_initialize"],
    ["afterRoutesLoaded", "after_routes_loaded"],
  ] as const;
  afterEach(() => {
    resetLoadHooks();
  });

  for (const [hook, rubyName] of HOOKS) {
    it(`Configuration#${hook} block runs when ${hook} hook fires`, () => {
      const seen: unknown[] = [];
      new Configuration()[hook]((arg) => seen.push(arg));
      runLoadHooks(rubyName, "marker");
      expect(seen).toContain("marker");
    });
  }

  it("Configurable seal sees through an anonymous intermediate class", () => {
    class AnonSealed extends Trailtie {}
    sealAgainstInheritance(AnonSealed);
    const Anon = class extends AnonSealed {};
    class Grand extends Anon {}
    expect(() => Trailtie.register(Grand)).toThrow(
      "You cannot inherit from a Trails::Railtie child",
    );
  });

  it("Configurable seals a class — single and multi-level inheritance", () => {
    class SealedTie extends Trailtie {}
    sealAgainstInheritance(SealedTie);
    class Direct extends SealedTie {}
    class Mid extends SealedTie {}
    class Deep extends Mid {}
    expect(() => Trailtie.register(Direct)).toThrow(
      "You cannot inherit from a Trails::Railtie child",
    );
    expect(() => Trailtie.register(Deep)).toThrow(
      "You cannot inherit from a Trails::Railtie child",
    );
  });

  it("returns registered subclasses sorted by load order, excluding abstract entries", () => {
    class Early extends Trailtie {}
    Trailtie.register(Early);
    class Late extends Trailtie {}
    Trailtie.register(Late);
    const list = Trailtie.subclasses();
    expect(list.indexOf(Late)).toBeGreaterThan(list.indexOf(Early));
    expect(list.every((s) => !s.isAbstractRailtie())).toBe(true);
  });
});
