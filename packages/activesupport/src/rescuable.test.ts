import { describe, it, expect, beforeEach } from "vitest";
import { include } from "@blazetrails/ruby-compat";

import { registerConstant } from "./inflector.js";
import { Rescuable, rescueFrom, handleRescue } from "./rescuable.js";

class WraithAttack extends Error {}

class MadRonon extends Error {}

class CoolError extends Error {}

class WeirdError {
  static [Symbol.hasInstance](other: unknown): boolean {
    return other instanceof Error && "weird" in other;
  }
}

class NuclearExplosion extends Error {}

for (const klass of [WraithAttack, MadRonon, CoolError, WeirdError, NuclearExplosion]) {
  registerConstant(klass.name, klass);
}

class Stargate {
  declare static rescueHandlers: [string, unknown][];
  declare rescueHandlers: [string, unknown][];

  result: string | null = null;

  static {
    include(this, Rescuable);

    rescueFrom.call(this, WraithAttack, { with: "sosFirst" });

    rescueFrom.call(this, WraithAttack, { with: "sos" });

    rescueFrom.call(this, "NuclearExplosion", {
      with: function (this: Stargate) {
        this.result = "alldead";
      },
    });

    rescueFrom.call(this, MadRonon, {
      with: function (this: Stargate, e: Error) {
        this.result = e.message;
      },
    });

    rescueFrom.call(this, WeirdError as never, {
      with: function (this: Stargate) {
        this.result = "weird";
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

class CoolStargate extends Stargate {
  static {
    rescueFrom.call(this, CoolError, { with: "sosCoolError" });
  }

  sosCoolError(): void {
    this.result = "sos_cool_error";
  }
}

describe("RescuableTest", () => {
  let stargate: Stargate;
  let coolStargate: CoolStargate;

  beforeEach(() => {
    stargate = new Stargate();
    coolStargate = new CoolStargate();
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

  it("rescues defined later are added at end of the rescue handlers array", () => {
    const expected = ["WraithAttack", "WraithAttack", "NuclearExplosion", "MadRonon", "WeirdError"];
    const result = stargate.rescueHandlers.map((handler) => handler[0]);
    expect(result).toEqual(expected);
  });

  it("children should inherit rescue definitions from parents and child rescue should be appended", () => {
    const expected = [
      "WraithAttack",
      "WraithAttack",
      "NuclearExplosion",
      "MadRonon",
      "WeirdError",
      "CoolError",
    ];
    const result = coolStargate.rescueHandlers.map((handler) => handler[0]);
    expect(result).toEqual(expected);
  });

  it("unhandled exceptions", () => {
    stargate.dispatch("crash");
    expect(stargate.result).toBe("unhandled");
  });
});
