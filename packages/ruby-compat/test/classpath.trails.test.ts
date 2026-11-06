import { describe, expect, it } from "vitest";
import { classPathMismatches, defineConstants } from "../lib/classpath.js";
import { TopLevel, rbModName, rbModToS } from "../lib/object.js";
import { rbPathToClass } from "../lib/variable.js";
import { constSet } from "../lib/include.js";
import { constGet } from "../lib/index.js";
import { NameError } from "../lib/name-error.js";

describe("rbModName over the generated class-path table", () => {
  it("answers a generated path", () => {
    class Generated {}
    defineConstants([[() => Generated, "Outer::Inner::Generated"]]);
    expect(rbModName(Generated)).toBe("Outer::Inner::Generated");
    expect(rbModToS(Generated)).toBe("Outer::Inner::Generated");
    expect(rbPathToClass("Outer::Inner::Generated")).toBe(Generated);
  });

  it("constGet resolves a generated row, and a row in TDZ misses", () => {
    class Outer {}
    class Resolved {}
    defineConstants([
      [() => Outer, "ConstGetOuter"],
      [() => Resolved, "ConstGetOuter::Resolved"],
      [
        () => {
          throw new ReferenceError("Cannot access before initialization");
        },
        "ConstGetTdz",
      ],
    ]);
    expect(constGet(Object, "ConstGetOuter::Resolved")).toBe(Resolved);
    expect(() => constGet(Object, "ConstGetTdz")).toThrow(NameError);
  });

  it("constGet reads the receiver's own constant ahead of a top-level one of the same name", () => {
    const OwnTool = { name: "ConstGetHost::ConstGetShadowed::Tool" };
    const Own = { name: "ConstGetShadowed", Tool: OwnTool };
    const Outer = { name: "ConstGetHost", ConstGetShadowed: Own };
    (TopLevel as Record<string, unknown>).ConstGetShadowed = { name: "top" };
    try {
      expect(constGet(Outer, "ConstGetShadowed")).toBe(Own);
      expect(constGet(Outer, "ConstGetShadowed::Tool")).toBe(OwnTool);
    } finally {
      delete (TopLevel as Record<string, unknown>).ConstGetShadowed;
    }
  });

  it("constGet raises NameError for a row whose namespace has no seat", () => {
    class Leaf {}
    defineConstants([[() => Leaf, "ConstGetUnseated::Leaf"]]);
    expect(() => constGet(Object, "ConstGetUnseated::Leaf")).toThrow(
      "uninitialized constant ConstGetUnseated",
    );
  });

  it("answers a const_set-bound path ahead of the generated one", () => {
    const Owner = class Owner {};
    class Seated {}
    constSet(Owner, "Seated", Seated);
    defineConstants([[() => Seated, "Elsewhere::Seated"]]);
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
    defineConstants([
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
    defineConstants([[() => Actual, "Deferred::Swept"]]);
    class Probe {}
    expect(rbModName(Probe)).toBe("Probe");
    class Actual {}
    expect(rbModName(Actual)).toBe("Actual");
    defineConstants([[() => class {}, "Deferred::Other"]]);
    expect(rbModName(Actual)).toBe("Deferred::Swept");
  });

  it("reports a thunk still unresolved when the check runs", () => {
    defineConstants([
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
    defineConstants([[() => Mod, "Outer::PlainModule"]]);
    expect(rbModName(Mod)).toBe("Outer::PlainModule");
    expect(rbPathToClass("Outer::PlainModule")).toBe(Mod);
  });

  it("walks the constant path before reading the generated table", () => {
    class Inner {}
    class Rebound {}
    const Walked = { Inner: Rebound };
    (TopLevel as Record<string, unknown>).Walked = Walked;
    defineConstants([[() => Inner, "Walked::Inner"]]);
    expect(rbPathToClass("Walked::Inner")).toBe(Rebound);
    delete (TopLevel as Record<string, unknown>).Walked;
  });
});
