import { describe, expect, it } from "vitest";
import { classPathMismatches, registerClassPaths } from "./classpath.js";
import { TopLevel, rbModName, rbModToS } from "./object.js";
import { rbPathToClass } from "./variable.js";
import { constSet } from "./include.js";

describe("rbModName over the generated class-path table", () => {
  it("answers a generated path", () => {
    class Generated {}
    registerClassPaths([[() => Generated, "Outer::Inner::Generated"]]);
    expect(rbModName(Generated)).toBe("Outer::Inner::Generated");
    expect(rbModToS(Generated)).toBe("Outer::Inner::Generated");
    expect(rbPathToClass("Outer::Inner::Generated")).toBe(Generated);
  });

  it("answers a const_set-bound path ahead of the generated one", () => {
    const Owner = class Owner {};
    class Seated {}
    constSet(Owner, "Seated", Seated);
    registerClassPaths([[() => Seated, "Elsewhere::Seated"]]);
    expect(rbModName(Seated)).toBe("Owner::Seated");
    expect(classPathMismatches()).toContainEqual(["Owner::Seated", "Elsewhere::Seated"]);
  });

  it("answers klass.name for an unseated class", () => {
    class Unseated {}
    expect(rbModName(Unseated)).toBe("Unseated");
  });

  it("answers null for an anonymous class", () => {
    expect(rbModName((() => class {})())).toBeNull();
  });

  it("retries a thunk still in TDZ on the next registration, not on every lookup", () => {
    let reads = 0;
    registerClassPaths([
      [
        () => {
          reads++;
          return Later;
        },
        "Deferred::Later",
      ],
    ]);
    class Probe {}
    expect(rbModName(Probe)).toBe("Probe");
    expect(rbModName(Probe)).toBe("Probe");
    expect(reads).toBe(1);
    class Later {}
    expect(rbModName(Later)).toBe("Deferred::Later");
  });

  it("resolves another class's pending entry on the next registration", () => {
    registerClassPaths([[() => Actual, "Deferred::Swept"]]);
    class Probe {}
    expect(rbModName(Probe)).toBe("Probe");
    class Actual {}
    expect(rbModName(Actual)).toBe("Actual");
    registerClassPaths([[() => class {}, "Deferred::Other"]]);
    expect(rbModName(Actual)).toBe("Deferred::Swept");
  });

  it("reports a thunk still unresolved when the check runs", () => {
    registerClassPaths([
      [
        () => {
          throw new ReferenceError("Cannot access 'Never' before initialization");
        },
        "Deferred::Never",
      ],
    ]);
    expect(classPathMismatches()).toContainEqual(["<unresolved>", "Deferred::Never"]);
  });

  it("seats a plain-object module", () => {
    const Mod = {};
    registerClassPaths([[() => Mod, "Outer::PlainModule"]]);
    expect(rbModName(Mod)).toBe("Outer::PlainModule");
    expect(rbPathToClass("Outer::PlainModule")).toBe(Mod);
  });

  it("walks the constant path before reading the generated table", () => {
    class Inner {}
    class Rebound {}
    const Walked = { Inner: Rebound };
    (TopLevel as Record<string, unknown>).Walked = Walked;
    registerClassPaths([[() => Inner, "Walked::Inner"]]);
    expect(rbPathToClass("Walked::Inner")).toBe(Rebound);
    delete (TopLevel as Record<string, unknown>).Walked;
  });
});
