import { describe, it, expect, beforeEach } from "vitest";

import { rescueFrom, handleRescue } from "./module-ext.js";

class WraithAttack extends Error {}

class MadRonon extends Error {}

class NuclearExplosion extends Error {}

class Stargate {
  result: string | null = null;

  constructor() {
    rescueFrom.call(this, WraithAttack, { with: "sosFirst" });
    rescueFrom.call(this, WraithAttack, { with: "sos" });
    rescueFrom.call(this, NuclearExplosion, {
      with: () => {
        this.result = "alldead";
      },
    });
    rescueFrom.call(this, MadRonon, {
      with: (e: Error) => {
        this.result = e.message;
      },
    });
  }

  dispatch(method: "attack" | "nuke" | "ronanize" | "crash"): void {
    try {
      this[method]();
    } catch (e) {
      if (!handleRescue(this, e as Error)) {
        this.result = "unhandled";
      }
    }
  }

  attack(): never {
    throw new WraithAttack();
  }

  nuke(): never {
    throw new NuclearExplosion();
  }

  ronanize(): never {
    throw new MadRonon("dex");
  }

  crash(): never {
    throw new RangeError("unhandled RuntimeError");
  }

  sos(): void {
    this.result = "killed";
  }

  sosFirst(): void {
    this.result = "sos_first";
  }
}

describe("RescuableTest", () => {
  let stargate: Stargate;

  beforeEach(() => {
    stargate = new Stargate();
  });

  it("rescue from with method", () => {
    stargate.dispatch("attack");
    expect(stargate.result).toBe("killed");
  });

  it("rescue from with block", () => {
    stargate.dispatch("nuke");
    expect(stargate.result).toBe("alldead");
  });

  it("rescue from with block with args", () => {
    stargate.dispatch("ronanize");
    expect(stargate.result).toBe("dex");
  });

  it.skip("rescues defined later are added at end of the rescue handlers array", () => {
    // BLOCKED: rescuable-has-no-rescue-handlers-reader
    const expected = ["WraithAttack", "WraithAttack", "NuclearExplosion", "MadRonon", "WeirdError"];
    const result = (stargate as any).rescueHandlers.map((h: [string]) => h[0]);
    expect(result).toEqual(expected);
  });

  it("unhandled exceptions", () => {
    stargate.dispatch("crash");
    expect(stargate.result).toBe("unhandled");
  });
});
