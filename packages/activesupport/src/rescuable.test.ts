import { describe, it, expect, beforeEach } from "vitest";
import { include } from "@blazetrails/ruby-compat";

import { registerConstant } from "./inflector.js";
import { Rescuable, rescueFrom, handleRescue } from "./rescuable.js";

class WraithAttack extends Error {}

class MadRonon extends Error {}

class CoolError extends Error {}

class WeirdError {
  static [Symbol.hasInstance](other: unknown): boolean {
    return other instanceof Error && "isWeird" in other;
  }
}

for (const klass of [WraithAttack, MadRonon, CoolError, WeirdError]) {
  registerConstant(klass.name, klass);
}

class Stargate {
  static NuclearExplosion = class NuclearExplosion extends Error {};

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

  dispatch(
    method: "attack" | "nuke" | "ronanize" | "crash" | "loopedCrash" | "fallBackToCause" | "weird",
  ): void {
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
    throw new Stargate.NuclearExplosion();
  }

  ronanize(): never {
    throw new MadRonon("dex");
  }

  crash(): never {
    throw new RangeError("unhandled RuntimeError");
  }

  loopedCrash(): never {
    const ex1 = new Error("error 1");
    const ex2 = new Error("error 2", { cause: ex1 });
    Object.defineProperty(ex1, "cause", { value: ex2 });
    throw ex1;
  }

  fallBackToCause(): never {
    try {
      this.ronanize();
    } catch (e) {
      throw new RangeError("unhandled RuntimeError with a handleable cause", { cause: e });
    }
  }

  weird(): never {
    throw Object.assign(new Error(), { isWeird: () => true });
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

  it("rescue from error dispatchers with case operator", () => {
    stargate.dispatch("weird");
    expect(stargate.result).toBe("weird");
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

  it.skip("rescue falls back to exception cause", () => {
    // BLOCKED: port-rescuable-tagged-logging-and-isolated-execution-cases
    stargate.dispatch("fallBackToCause");
    expect(stargate.result).toBe("dex");
  });

  it("unhandled exceptions", () => {
    stargate.dispatch("crash");
    expect(stargate.result).toBe("unhandled");
  });

  it.skip("rescue handles loops in exception cause chain", () => {
    // BLOCKED: port-rescuable-tagged-logging-and-isolated-execution-cases
    stargate.dispatch("loopedCrash");
    expect(stargate.result).toBe("unhandled");
  });
});
