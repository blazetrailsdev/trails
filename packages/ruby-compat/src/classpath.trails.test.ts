import { describe, expect, it } from "vitest";
import { classPathMismatches, registerClassPaths } from "./classpath.js";
import { rbModName, rbModToS } from "./object.js";
import { rbPathToClass } from "./variable.js";
import { rbModConstSet } from "./include.js";

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
    rbModConstSet(Owner, "Seated", Seated);
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

  it("resolves a thunk whose binding is not yet initialized on a later lookup", () => {
    registerClassPaths([[() => Later, "Deferred::Later"]]);
    class Probe {}
    expect(rbModName(Probe)).toBe("Probe");

    class Later {}
    expect(rbModName(Later)).toBe("Deferred::Later");
  });
});
