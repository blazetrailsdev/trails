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
    defineConstants([[{ Generated }, "Generated", "Outer::Inner::Generated"]]);
    expect(rbModName(Generated)).toBe("Outer::Inner::Generated");
    expect(rbModToS(Generated)).toBe("Outer::Inner::Generated");
    expect(rbPathToClass("Outer::Inner::Generated")).toBe(Generated);
  });

  it("reads a thunked namespace at lookup, not at registration", () => {
    class Lazy {}
    defineConstants([[() => namespace, "Lazy", "ThunkedRow::Lazy"]]);
    const namespace = { Lazy };
    expect(rbModName(Lazy)).toBe("ThunkedRow::Lazy");
    expect(rbPathToClass("ThunkedRow::Lazy")).toBe(Lazy);
  });

  it("does not call a class-valued namespace as a thunk", () => {
    class Host {
      static Member = class {};
    }
    defineConstants([[Host, "Member", "ClassNamespace::Host::Member"]]);
    expect(rbPathToClass("ClassNamespace::Host::Member")).toBe(Host.Member);
  });

  it("answers a generated namespace-member row, and the namespace itself", () => {
    class Member {}
    const namespace = { Member };
    defineConstants([
      [namespace, "Member", "RowNamespace::Member"],
      [namespace, null, "RowNamespace"],
    ]);
    expect(rbModName(Member)).toBe("RowNamespace::Member");
    expect(rbPathToClass("RowNamespace")).toBe(namespace);
  });

  it("answers a generated row naming a nested member", () => {
    class Nested {}
    const namespace = { Owner: { Nested } };
    defineConstants([[namespace, "Owner.Nested", "RowNested::Owner::Nested"]]);
    expect(rbModName(Nested)).toBe("RowNested::Owner::Nested");
  });

  it("constGet resolves a generated row, and a row in TDZ misses", () => {
    class Outer {}
    class Resolved {}
    defineConstants([
      [{ Outer }, "Outer", "ConstGetOuter"],
      [{ Resolved }, "Resolved", "ConstGetOuter::Resolved"],
      [
        {
          get ConstGetTdz(): unknown {
            throw new ReferenceError("Cannot access before initialization");
          },
        },
        "ConstGetTdz",
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
    defineConstants([[{ Leaf }, "Leaf", "ConstGetUnseated::Leaf"]]);
    expect(() => constGet(Object, "ConstGetUnseated::Leaf")).toThrow(
      "uninitialized constant ConstGetUnseated",
    );
  });

  it("answers a const_set-bound path ahead of the generated one", () => {
    const Owner = class Owner {};
    class Seated {}
    constSet(Owner, "Seated", Seated);
    defineConstants([[{ Seated }, "Seated", "Elsewhere::Seated"]]);
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
        {
          get Later(): unknown {
            reads++;
            return Later;
          },
        },
        "Later",
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
    defineConstants([
      [
        {
          get Actual(): unknown {
            return Actual;
          },
        },
        "Actual",
        "Deferred::Swept",
      ],
    ]);
    class Probe {}
    expect(rbModName(Probe)).toBe("Probe");
    class Actual {}
    expect(rbModName(Actual)).toBe("Actual");
    defineConstants([[{ Other: class {} }, "Other", "Deferred::Other"]]);
    expect(rbModName(Actual)).toBe("Deferred::Swept");
  });

  it("reports a thunk still unresolved when the check runs", () => {
    defineConstants([
      [
        {
          get Never(): unknown {
            throw new ReferenceError("Cannot access 'Never' before initialization");
          },
        },
        "Never",
        "Deferred::Never",
      ],
    ]);
    expect(classPathMismatches()).toContainEqual(["<unresolved>", "Deferred::Never"]);
  });

  it("resolves a plain-object module whose row was in TDZ at the first lookup", () => {
    defineConstants([
      [
        {
          get LateModule(): unknown {
            return LateModule;
          },
        },
        "LateModule",
        "Deferred::LateModule",
      ],
    ]);
    class Probe {}
    expect(rbModName(Probe)).toBe("Probe");
    const LateModule = {};
    expect(rbModName(LateModule)).toBe("Deferred::LateModule");
  });

  it("seats a plain-object module", () => {
    const Mod = {};
    defineConstants([[{ Mod }, "Mod", "Outer::PlainModule"]]);
    expect(rbModName(Mod)).toBe("Outer::PlainModule");
    expect(rbPathToClass("Outer::PlainModule")).toBe(Mod);
  });

  it("walks the constant path before reading the generated table", () => {
    class Inner {}
    class Rebound {}
    const Walked = { Inner: Rebound };
    (TopLevel as Record<string, unknown>).Walked = Walked;
    defineConstants([[{ Inner }, "Inner", "Walked::Inner"]]);
    expect(rbPathToClass("Walked::Inner")).toBe(Rebound);
    delete (TopLevel as Record<string, unknown>).Walked;
  });
});
