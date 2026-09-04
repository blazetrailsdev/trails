import { describe, it, expect } from "vitest";
import { Trailtie } from "./trailtie.js";

describe("Trailtie registry isolation", () => {
  it("does not see the throwaway subclasses registered by trailtie.test.ts", () => {
    const names = Trailtie.subclasses().map((klass) => klass.name);
    expect(names).not.toContain("MyTrailtie");
    expect(names).not.toContain("OtherTrailtie");
    expect(names).not.toContain("ConfigTrailtie");
  });
});
